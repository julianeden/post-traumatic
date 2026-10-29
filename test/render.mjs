// Renders saved copies of the schedule page at phone width with the add-on's
// CSS and script injected, takes screenshots, and checks the layout fits.
//
// Fixtures are "Web Page, complete" saves of the live site and contain real
// names, so they live outside the repo. Point TSM_FIXTURES at the folder
// (default: test/fixtures). Every request that is not file:// is blocked, so
// nothing reaches the real site.
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = resolve(process.env.TSM_FIXTURES ?? join(root, "test", "fixtures"));
const outDir = join(root, "test", "out");
mkdirSync(outDir, { recursive: true });

const VIEWPORT = { width: 412, height: 915 };
const cssPath = join(root, "src", "content.css");
const jsPath = join(root, "src", "content.js");

if (!existsSync(fixtures)) {
  console.log(`no fixtures at ${fixtures}; skipping (set TSM_FIXTURES to a folder of saved pages)`);
  process.exit(0);
}
const pages = readdirSync(fixtures).filter((f) => f.toLowerCase().endsWith(".html"));
if (pages.length === 0) {
  console.log(`no .html fixtures in ${fixtures}; skipping`);
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });
let failures = 0;

function fail(msg) {
  failures += 1;
  console.error(`  FAIL ${msg}`);
}

for (const file of pages) {
  const name = file.replace(/\.html?$/i, "");
  console.log(`${file}`);
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const blocked = new Set();
  await context.route(() => true, (route) => {
    const url = route.request().url();
    if (url.startsWith("file://")) return route.continue();
    blocked.add(new URL(url).host);
    return route.abort();
  });
  const page = await context.newPage();
  page.on("dialog", (d) => d.dismiss());
  await page.goto("file://" + join(fixtures, file), { waitUntil: "load", timeout: 60_000 });

  const before = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    handlers: document.querySelectorAll("span.hightlight[onclick]").length,
    days: document.querySelectorAll('table.month td[id^="day_"]').length,
    hasMonth: Boolean(document.querySelector("table.month")),
  }));
  await page.screenshot({ path: join(outDir, `${name}-before.png`) });

  await page.addStyleTag({ path: cssPath });
  await page.addScriptTag({ path: jsPath });
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const html = document.documentElement;
    const wide = [...document.querySelectorAll("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(el).position !== "fixed";
    });
    return {
      active: html.classList.contains("tsm-ready"),
      mode: html.classList.contains("tsm-location") ? "location" : html.classList.contains("tsm-agenda") ? "agenda" : "none",
      scrollWidth: html.scrollWidth,
      handlers: document.querySelectorAll("span.hightlight[onclick]").length,
      overflowing: wide.slice(0, 5).map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""} right=${Math.round(el.getBoundingClientRect().right)}`),
      visibleDays: [...document.querySelectorAll('td[id^="day_"]')].filter((td) => td.offsetParent !== null).length,
      chips: document.querySelectorAll(".tsm-chip").length,
    };
  });

  console.log(`  before: width ${before.scrollWidth}px, ${before.days} days, ${before.handlers} pickup handlers`);
  console.log(`  after:  mode=${after.mode}, width ${after.scrollWidth}px, ${after.visibleDays} visible days, ${after.handlers} pickup handlers, blocked hosts: ${[...blocked].join(", ") || "none"}`);

  if (!before.hasMonth) {
    console.log("  (no calendar on this page; chrome styling only)");
  } else {
    if (!after.active) fail("add-on did not activate");
    if (after.scrollWidth > VIEWPORT.width) fail(`page still overflows: scrollWidth ${after.scrollWidth} > ${VIEWPORT.width}`);
    if (after.overflowing.length) fail(`elements past the right edge: ${after.overflowing.join(" | ")}`);
    if (after.handlers !== before.handlers) fail(`pickup handlers changed: ${before.handlers} -> ${after.handlers}`);
    if (after.mode === "location") {
      if (after.visibleDays !== 1) fail(`location view should show exactly one day, shows ${after.visibleDays}`);
      if (after.chips !== before.days) fail(`expected ${before.days} day chips, got ${after.chips}`);
    }
    if (after.mode === "agenda" && after.visibleDays !== before.days) fail(`agenda should show all ${before.days} days, shows ${after.visibleDays}`);
  }

  await page.screenshot({ path: join(outDir, `${name}-after-top.png`) });
  await page.evaluate(() => document.querySelector("table.month")?.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -56));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(outDir, `${name}-after-calendar.png`) });

  if (after.mode === "location") {
    const openBtn = page.locator(".tsm-filter", { hasText: "Open only" });
    if (await openBtn.count()) {
      await openBtn.click();
      await page.waitForTimeout(200);
      const check = await page.evaluate(() => {
        const day = document.querySelector('td[id^="day_"].tsm-selected');
        const units = [...day.querySelectorAll(".tsm-unit")];
        const visible = units.filter((u) => u.offsetParent !== null);
        return { visible: visible.length, bad: visible.filter((u) => !u.querySelector("tr.unassigned")).length, open: Number(day.dataset.open) };
      });
      if (check.bad) fail(`"Open only" shows ${check.bad} units without a requestable slot`);
      console.log(`  open-only filter: ${check.visible} units visible, ${check.open} open slots on selected day`);
      await page.screenshot({ path: join(outDir, `${name}-after-open-only.png`) });
      // next day, then reset filter
      await page.locator(".tsm-navbtn").last().click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(outDir, `${name}-after-next-day.png`) });
      await page.locator(".tsm-filter", { hasText: "All units" }).click();
    }

    // Person filter: pick a crew member who appears on several days and type
    // their first and last name as a person would.
    const person = await page.evaluate(() => {
      const counts = new Map();
      for (const td of document.querySelectorAll("tr.employee > td:first-child")) {
        const words = td.textContent.replace(/ /g, " ").trim().split(/\s+/);
        if (words.length < 2) continue;
        const key = `${words[0].split("-")[0]} ${words[words.length - 1]}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[2]?.[0] ?? null;
    });
    if (person) {
      await page.locator(".tsm-search-input").fill(person);
      await page.waitForTimeout(400);
      const check = await page.evaluate(() => {
        const day = document.querySelector('td[id^="day_"].tsm-selected');
        const units = [...day.querySelectorAll(".tsm-unit")];
        const visible = units.filter((u) => u.offsetParent !== null);
        const bad = visible.filter((u) => !u.querySelector("tr.tsm-match-slot")).length;
        const highlighted = day.querySelectorAll("tr.tsm-match-slot").length;
        const daysWithBadge = document.querySelectorAll(".tsm-chip-has-match").length;
        return { visible: visible.length, bad, highlighted, daysWithBadge, status: document.querySelector(".tsm-status")?.textContent };
      });
      if (!check.daysWithBadge) fail(`person filter "${person}" matched no days`);
      if (check.visible === 0) fail(`person filter "${person}" left no visible units on the selected day`);
      if (check.bad) fail(`person filter shows ${check.bad} units without that person`);
      console.log(`  person filter "${person}": ${check.visible} units visible, ${check.highlighted} highlighted, ${check.daysWithBadge} days flagged; status: ${check.status}`);
      await page.screenshot({ path: join(outDir, `${name}-after-person.png`) });
      await page.locator(".tsm-search-clear").click();
      await page.waitForTimeout(300);
      const cleared = await page.evaluate(() => ({
        active: document.documentElement.classList.contains("tsm-filter-name"),
        badges: document.querySelectorAll(".tsm-chip-has-match").length,
      }));
      if (cleared.active || cleared.badges) fail("clearing the person filter did not reset it");
    }

    // The site's own confirm dialog, opened directly (no network involved).
    const dialogOpened = await page.evaluate(() => {
      try {
        const $ = window.jQuery;
        if (!$ || !$.fn.dialog || !document.getElementById("confirm_dialog")) return false;
        $("#confirm_dialog").dialog({ title: "Confirm Pickup Shift Request" }).dialog("open");
        return true;
      } catch {
        return false;
      }
    });
    if (dialogOpened) {
      await page.waitForTimeout(300);
      const dlg = await page.evaluate(() => {
        const d = document.getElementById("confirm_dialog").closest(".ui-dialog");
        const r = d.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), bottom: Math.round(r.bottom), shown: getComputedStyle(d).display !== "none" };
      });
      if (!dlg.shown || dlg.width === 0) fail("confirm dialog did not open");
      else if (dlg.right > VIEWPORT.width || dlg.left < 0 || dlg.bottom > VIEWPORT.height) fail(`confirm dialog off-screen: left ${dlg.left}, right ${dlg.right}, bottom ${dlg.bottom}`);
      console.log(`  confirm dialog: ${dlg.width}px wide at x=${dlg.left}`);
      await page.screenshot({ path: join(outDir, `${name}-after-dialog.png`) });
    } else {
      console.log("  (confirm dialog not available in this fixture)");
    }
  }

  await context.close();
}

await browser.close();
console.log(failures ? `${failures} failure(s)` : "all checks passed");
console.log(`screenshots in ${outDir}`);
process.exit(failures ? 1 : 0);
