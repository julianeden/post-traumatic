// Renders saved copies of the schedule page at phone width with the add-on's
// CSS and script injected, takes screenshots, and checks the layout fits.
//
// Fixtures are "Web Page, complete" saves of the live site and contain real
// names, so they live outside the repo. Point TSM_FIXTURES at the folder
// (default: test/fixtures). The pages are served at a made-up https origin
// under the site's real paths, their saved asset folders are answered from
// disk, and every other request is blocked, so nothing reaches the real site.
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
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

const ORIGIN = "https://traumasoft.invalid";
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };

// Routes a context: fixture pages at /main.php?fixture=<file> and
// /login.php, saved "<name>_files" folders from disk, everything else blocked.
async function serveFixtures(context, blocked) {
  await context.route(() => true, (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "file:") return route.continue();
    if (url.origin === ORIGIN) {
      let file = null;
      if (url.pathname === "/main.php" && url.searchParams.get("fixture")) file = url.searchParams.get("fixture");
      else if (url.pathname === "/login.php") file = "login";
      else if (/^\/[^/]+_files\//.test(url.pathname)) file = decodeURIComponent(url.pathname.slice(1));
      const path = file && join(fixtures, file);
      if (path && path.startsWith(fixtures) && existsSync(path)) {
        const type = basename(path) === "login" ? "text/html" : TYPES[extname(path).toLowerCase()] || "application/octet-stream";
        let body = readFileSync(path);
        // Punch page variants: "now" moves the server clock the page embeds;
        // "punched=in" rewrites the page the way the site does once you are
        // punched in (controls swapped, current shift filled in).
        if (url.searchParams.get("now") || url.searchParams.get("punched") === "in") {
          let html = body.toString("utf8");
          const now = url.searchParams.get("now");
          if (now) html = html.replace(/moment\.unix\(\d+\)/, `moment.unix(${now})`);
          if (url.searchParams.get("punched") === "in") {
            html = html
              .replace(/<img src="([^"]*)" class="punch_button" onclick="checkEmpQualified\(\); return false;" style="cursor: pointer;" name="punchin_img" id="punchin_img">/,
                '<input type="image" name="punchin_img" id="punchin_img" src="$1" class="punch_button" disabled="disabled">')
              .replace(/<input type="image" name="punchout_img" id="punchout_img" src="([^"]*)" class="punch_button" disabled="disabled">/,
                '<img src="$1" class="punch_button" onclick="punchout(); return false;" style="cursor: pointer;" name="punchout_img" id="punchout_img">')
              .replace('id="punch_in" value="1"', 'id="punch_in" value="0"')
              .replace(/(Current Shifts:<\/td>\s*<td nowrap="nowrap">)(<\/td>)/, "$111/06/2026 07:00 to 11/06/2026 19:00$2");
          }
          body = Buffer.from(html, "utf8");
        }
        return route.fulfill({ status: 200, contentType: type, body });
      }
    } else {
      blocked?.add(url.host);
    }
    return route.abort();
  });
}

const browser = await chromium.launch({ headless: true });
let failures = 0;

// Punch clock page: one big button, nothing else to scroll, and the
// are-you-sure card before an early punch. The site's own flow ends in a
// form submit (its break check is an AJAX call that is blocked here, and the
// error path submits), so a submit listener records whether a punch went out.
async function checkPunchPage(page, file) {
  const load = async (params) => {
    await page.goto(`${ORIGIN}/main.php?a=user:punchin&fixture=${encodeURIComponent(file)}${params}`, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate(() => {
      // jQuery's .submit() ends in the native form.submit(), which fires no
      // event; shadow the method so a punch is counted instead of navigating.
      window.__tsmSubmits = 0;
      const form = document.getElementById("punchin_form");
      form.addEventListener("submit", (e) => { e.preventDefault(); window.__tsmSubmits += 1; });
      Object.defineProperty(form, "submit", { value: () => { window.__tsmSubmits += 1; }, configurable: true });
    });
    await page.addStyleTag({ path: cssPath });
    await page.addScriptTag({ path: jsPath });
    await page.waitForTimeout(400);
  };
  const state = () => page.evaluate(() => {
    const vis = (el) => Boolean(el && el.offsetParent !== null);
    const buttons = [...document.querySelectorAll(".tsm-punch-btn")].filter(vis);
    const welcome = [...document.querySelectorAll("td")].find((td) => /successfully logged into/.test(td.textContent));
    const confirm = document.querySelector(".tsm-confirm");
    return {
      pageMode: document.documentElement.dataset.tsmPage,
      buttons: buttons.map((b) => ({ text: b.textContent, disabled: b.disabled, width: Math.round(b.getBoundingClientRect().width), height: Math.round(b.getBoundingClientRect().height) })),
      siteControls: ["punchin_img", "punchout_img"].filter((id) => vis(document.getElementById(id))).length + document.querySelectorAll("a.punch_out_link").length - [...document.querySelectorAll("a.punch_out_link")].filter((a) => !vis(a)).length,
      welcomeShown: vis(welcome),
      time: document.querySelector(".tsm-punch-time")?.textContent.trim(),
      timeShown: vis(document.querySelector(".tsm-punch-time")),
      shiftRows: [...document.querySelectorAll(".tsm-shift-row")].filter(vis).map((tr) => {
        const value = tr.querySelector("td:last-child");
        return { label: tr.querySelector("td:first-child").textContent.trim(), value: value.textContent.trim(), lines: Math.round(value.getBoundingClientRect().height / parseFloat(getComputedStyle(value).lineHeight)) };
      }),
      headShown: vis(document.querySelector(".tsm-shift-head")),
      shaded: [...document.querySelectorAll(".tsm-shift-row")].filter((tr) => getComputedStyle(tr).backgroundColor !== "rgba(0, 0, 0, 0)").length,
      footShown: vis(document.getElementById("continue")) || vis(document.getElementById("logout_button")),
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      confirm: confirm ? { title: confirm.querySelector(".tsm-confirm-title")?.textContent, text: confirm.textContent, yes: confirm.querySelector(".tsm-confirm-yes")?.textContent } : null,
      submits: window.__tsmSubmits,
      loading: vis(document.getElementById("json_loading_dialog")),
    };
  });
  const tapPunch = () => page.locator(".tsm-punch-btn").click();

  // As saved: punched out, next shift 11/06 07:00, server clock 11/04 20:54.
  await load("");
  let st = await state();
  if (st.pageMode !== "punch") fail("punch page not recognised");
  if (st.buttons.length !== 1 || st.buttons[0].text !== "Punch In") fail(`expected one "Punch In" button, got ${JSON.stringify(st.buttons)}`);
  if (st.buttons[0] && (st.buttons[0].width < 300 || st.buttons[0].height < 60)) fail(`punch button is small: ${st.buttons[0].width}x${st.buttons[0].height}`);
  if (st.siteControls) fail("the site's own punch controls are still visible");
  if (st.welcomeShown) fail("welcome text still visible");
  if (!st.timeShown || !/^\d\d:\d\d:\d\d$/.test(st.time || "")) fail(`clock with seconds not shown (${st.time})`);
  await page.waitForTimeout(1100);
  const later = await state();
  if (later.time === st.time) fail(`clock does not tick (${st.time})`);
  if (st.shiftRows.length !== 3) fail(`expected 3 shift rows, got ${st.shiftRows.length}`);
  const byLabel = Object.fromEntries(st.shiftRows.map((r) => [r.label.replace(/:$/, ""), r]));
  if (byLabel["Last Shift"]?.value !== "Nov 4 @ 07:00 — Nov 4 @ 19:00") fail(`Last Shift reads "${byLabel["Last Shift"]?.value}"`);
  if (byLabel["Next Shift"]?.value !== "Nov 6 @ 07:00 — Nov 6 @ 19:00") fail(`Next Shift reads "${byLabel["Next Shift"]?.value}"`);
  if (st.shiftRows.some((r) => /\d{4}/.test(r.value))) fail("a shift row still shows a year");
  if (st.shiftRows.some((r) => r.value && r.lines > 1)) fail(`a shift row wraps: ${JSON.stringify(st.shiftRows)}`);
  if (st.headShown) fail("'Scheduled Shifts' title still shown");
  if (st.shaded) fail(`${st.shaded} shift row(s) have a background`);
  if (st.footShown) fail("Continue / Logout still visible");
  if (st.scrollHeight > st.innerHeight) fail(`punch page scrolls: ${st.scrollHeight} > ${st.innerHeight}`);
  if (st.scrollWidth > VIEWPORT.width) fail(`punch page overflows horizontally: ${st.scrollWidth}`);
  console.log(`  punch page: ${st.time} · ${st.buttons.map((b) => b.text).join("/")} · ${st.shiftRows.map((r) => `${r.label} ${r.value || "none"}`).join(" | ")}`);
  await page.screenshot({ path: join(outDir, "punch-out-state.png") });

  // 34 hours early: the card appears, "Not now" cancels without a submit.
  await tapPunch();
  await page.waitForTimeout(200);
  st = await state();
  if (!st.confirm) fail("early punch in did not ask first");
  else {
    if (!/It's 20:54\. Your next shift starts in 34 h 0[456] min\.Punch in anyway\?/.test(st.confirm.text)) fail(`early card text unexpected: ${st.confirm.text}`);
    if (!/Punch in early\?/.test(st.confirm.title) || st.confirm.yes !== "Yes") fail(`early card title/button: "${st.confirm.title}" / "${st.confirm.yes}"`);
    if ((await page.locator(".tsm-confirm-line").count()) !== 2) fail("the question is not on its own line");
    console.log(`  early card: ${st.confirm.title} — ${st.confirm.text.replace(st.confirm.title, "").trim()}`);
    await page.screenshot({ path: join(outDir, "punch-early-card.png") });
    await page.locator(".tsm-confirm-no").click();
    await page.waitForTimeout(100);
    st = await state();
    if (st.confirm) fail("Not now did not close the card");
    if (st.submits) fail("Not now still submitted the punch");
    // and "anyway" hands over to the site, which submits
    await tapPunch();
    await page.locator(".tsm-confirm-yes").click();
    await page.waitForTimeout(800);
    st = await state();
    if (st.submits !== 1) fail(`Punch in anyway should submit once, submitted ${st.submits}`);
    if (!st.loading) fail("site's loading dialog did not open after the punch");
    console.log("  early card: No cancels; Yes submits through the site's own handler");
  }

  // 5 minutes before the shift: no card, straight to the site's handler.
  const t0655 = Math.floor(new Date(2026, 10, 6, 6, 55).getTime() / 1000);
  await load(`&now=${t0655}`);
  await tapPunch();
  await page.waitForTimeout(800);
  st = await state();
  if (st.confirm) fail("punch in 5 minutes early should not ask");
  if (st.submits !== 1) fail(`punch in at 06:55 should submit once, submitted ${st.submits}`);
  console.log("  at 06:55: no card, punched straight through");

  // Exactly 7 minutes and one second early still asks.
  const t065259 = Math.floor(new Date(2026, 10, 6, 6, 52, 59).getTime() / 1000);
  await load(`&now=${t065259}`);
  await tapPunch();
  await page.waitForTimeout(200);
  st = await state();
  if (!st.confirm) fail("punch in 7 min 1 s early should ask");
  else if (!/\b7 min\b/.test(st.confirm.text)) fail(`7:01 card text: ${st.confirm.text}`);
  console.log("  at 06:52:59: card shown (7 min 1 s early)");

  // Punched in, mid-shift at 10:00: Punch Out, 9 hours early, asks.
  const t1000 = Math.floor(new Date(2026, 10, 6, 10, 0).getTime() / 1000);
  await load(`&punched=in&now=${t1000}`);
  st = await state();
  if (st.buttons.length !== 1 || st.buttons[0].text !== "Punch Out") fail(`punched in: expected one "Punch Out" button, got ${JSON.stringify(st.buttons)}`);
  if (!st.shiftRows.some((r) => /^Current/.test(r.label) && r.value === "Nov 6 @ 07:00 — Nov 6 @ 19:00")) fail(`punched in: current shift row reads ${JSON.stringify(st.shiftRows)}`);
  await tapPunch();
  await page.waitForTimeout(200);
  st = await state();
  if (!st.confirm || !/It's 10:00\. Your current shift ends in (9 h 00|8 h 59) min\.Punch out anyway\?/.test(st.confirm.text) || st.confirm.yes !== "Yes") fail(`early punch out card: ${JSON.stringify(st.confirm)}`);
  console.log(`  punched in at 10:00: ${st.buttons.map((b) => b.text).join("/")}; card: ${st.confirm?.title}`);
  await page.screenshot({ path: join(outDir, "punch-in-state-card.png") });
  await page.locator(".tsm-confirm-no").click();

  // Punched in at 18:54: punch out goes straight through.
  const t1854 = Math.floor(new Date(2026, 10, 6, 18, 54).getTime() / 1000);
  await load(`&punched=in&now=${t1854}`);
  await tapPunch();
  await page.waitForTimeout(800);
  st = await state();
  if (st.confirm) fail("punch out 6 minutes early should not ask");
  if (st.submits !== 1) fail(`punch out at 18:54 should submit once, submitted ${st.submits}`);
  console.log("  punched in at 18:54: no card, punched out straight through");
}

function fail(msg) {
  failures += 1;
  console.error(`  FAIL ${msg}`);
}

// The login page, saved as a file called "login" (no extension) in the
// fixtures folder, is served at a made-up https origin so localStorage works
// the way it does on the site. Its assets are not needed and are blocked.
const loginFixture = join(fixtures, "login");
if (existsSync(loginFixture)) {
  console.log("login");
  const origin = ORIGIN;
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await serveFixtures(context);
  const page = await context.newPage();
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[Traumasoft Mobile]")) console.log(`  console: ${text.replace("[Traumasoft Mobile] ", "")}`);
  });
  const inject = async () => {
    await page.addStyleTag({ path: cssPath });
    await page.addScriptTag({ path: jsPath });
    await page.waitForTimeout(300);
  };
  const USER = "input.v-text-field[data-testid='login-identifier'] input, [data-testid='login-identifier'] input";

  // First visit: nothing remembered; typing and pressing Continue stores it.
  await page.goto(`${origin}/login.php`, { waitUntil: "load", timeout: 60_000 });
  await inject();
  const fresh = await page.evaluate((sel) => {
    const i = document.querySelector(sel);
    return { found: Boolean(i), value: i?.value, autocomplete: i?.getAttribute("autocomplete"), name: i?.name, stored: localStorage.getItem("tsm.login.username") };
  }, USER);
  if (!fresh.found) fail("login: username field not found");
  if (fresh.value) fail(`login: field prefilled on first visit with "${fresh.value}"`);
  if (fresh.autocomplete !== "username") fail(`login: username field autocomplete is "${fresh.autocomplete}"`);
  await page.locator(USER).fill("jeden");
  await page.locator("[data-testid='login-submit']").click();
  await page.waitForTimeout(100);
  const stored = await page.evaluate(() => localStorage.getItem("tsm.login.username"));
  if (stored !== "jeden") fail(`login: Continue did not store the username (stored "${stored}")`);
  await page.screenshot({ path: join(outDir, "login-after-first.png") });

  // Second visit: the field is filled before anyone types, and the page's
  // own input handler hears about it.
  await page.goto(`${origin}/login.php`, { waitUntil: "load", timeout: 60_000 });
  await page.evaluate((sel) => {
    window.__tsmInputEvents = 0;
    document.querySelector(sel).addEventListener("input", () => { window.__tsmInputEvents += 1; });
    // Without the site's script, Enter would submit the bare form natively.
    document.querySelector("form")?.addEventListener("submit", (e) => e.preventDefault());
  }, USER);
  await inject();
  const again = await page.evaluate((sel) => ({ value: document.querySelector(sel).value, events: window.__tsmInputEvents }), USER);
  if (again.value !== "jeden") fail(`login: username not filled on return (value "${again.value}")`);
  if (!again.events) fail("login: filled value was not announced with an input event");
  // Enter in the field updates the memory; a password field rendered later is tagged.
  await page.locator(USER).fill("jeden2");
  await page.locator(USER).press("Enter");
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.setAttribute("data-testid", "login-password");
    const pw = document.createElement("input");
    pw.type = "password";
    box.append(pw);
    document.getElementById("loginApp").append(box);
  });
  await page.waitForTimeout(100);
  const later = await page.evaluate(() => ({
    stored: localStorage.getItem("tsm.login.username"),
    pw: document.querySelector("[data-testid='login-password'] input")?.getAttribute("autocomplete"),
  }));
  if (later.stored !== "jeden2") fail(`login: Enter did not update the stored username (stored "${later.stored}")`);
  if (later.pw !== "current-password") fail(`login: password field autocomplete is "${later.pw}"`);
  console.log(`  login: stored on Continue and Enter, refilled on return (${again.events} input event), fields tagged for the password manager`);
  await page.screenshot({ path: join(outDir, "login-after-return.png") });
  await context.close();
}

for (const file of pages) {
  const name = file.replace(/\.html?$/i, "");
  console.log(`${file}`);
  // A page saved while the add-on was running already carries its markup
  // and state, so the script would find nothing to do; it is not a fixture.
  if (/data-tsm-ready=/.test(readFileSync(join(fixtures, file), "utf8").slice(0, 2000))) {
    console.log("  (saved with the add-on active; skipped. Re-save it with the add-on disabled to test it)");
    continue;
  }
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const blocked = new Set();
  await serveFixtures(context, blocked);
  const page = await context.newPage();
  page.on("dialog", (d) => d.dismiss());
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[Traumasoft Mobile]")) console.log(`  console: ${text.replace("[Traumasoft Mobile] ", "")}`);
  });
  await page.goto(`${ORIGIN}/main.php?a=user:schedule&fixture=${encodeURIComponent(file)}`, { waitUntil: "load", timeout: 60_000 });

  const before = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    handlers: document.querySelectorAll("span.hightlight[onclick]").length,
    days: document.querySelectorAll('table.month td[id^="day_"]').length,
    hasMonth: Boolean(document.querySelector("table.month")),
  }));
  await page.screenshot({ path: join(outDir, `${name}-before.png`) });

  // The individual view asks the site for the unit views; serve the saved
  // BLS page for that request and fail the rest, recording what was asked.
  const blsFixture = pages.find((f) => /schedule2/i.test(f)) || null;
  const blsHtml = blsFixture ? readFileSync(join(fixtures, blsFixture), "utf8") : "";
  await page.evaluate((html) => {
    window.__tsmFetches = [];
    window.fetch = async (url, init) => {
      const u = String(url);
      const body = init?.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, String(v)])) : init?.body;
      window.__tsmFetches.push({ url: u, method: init?.method || "GET", body, credentials: init?.credentials });
      if (/template_id=59\b/.test(u) && html) return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
      return new Response("", { status: 404 });
    };
  }, blsHtml);

  await page.addStyleTag({ path: cssPath });
  await page.addScriptTag({ path: jsPath });
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const html = document.documentElement;
    // Anything inside a fixed element (the site's header) cannot scroll the page.
    const inFixed = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true; return false; };
    const wide = [...document.querySelectorAll("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > innerWidth + 1 && !inFixed(el);
    });
    return {
      active: html.dataset.tsmReady === "1",
      mode: html.dataset.tsmMode || "none",
      scrollWidth: html.scrollWidth,
      handlers: document.querySelectorAll("span.hightlight[onclick]").length,
      overflowing: wide.slice(0, 5).map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""} right=${Math.round(el.getBoundingClientRect().right)}`),
      visibleDays: [...document.querySelectorAll('td[id^="day_"]')].filter((td) => td.offsetParent !== null).length,
      chips: document.querySelectorAll(".tsm-chip").length,
      hasHeader: Boolean(document.getElementById("ts_menus_right_div")),
      punchLink: document.getElementById("tsm-punchlink"),
      // The harness header keeps its desktop search box, so only visibility
      // is checked here, not that the link fits beside it.
      punchLinkShown: Boolean(document.getElementById("tsm-punchlink")?.offsetParent),
      punchLinkHref: document.getElementById("tsm-punchlink")?.getAttribute("href"),
      chat: Boolean(document.getElementById("chat_button")),
      chatShown: Boolean(document.getElementById("chat_button")?.offsetParent),
      punchPage: Boolean(document.getElementById("punchin_form")),
    };
  });
  if (after.hasHeader) {
    if (!after.punchLinkShown) fail("header has no visible Punch link");
    if (after.punchLinkHref !== "/main.php?a=user:punchin") fail(`Punch link points at ${after.punchLinkHref}`);
    if (after.chatShown) fail("chat button still visible in the header");
    console.log(`  header: Punch link ${after.punchLinkShown ? "shown" : "missing"}; chat button ${after.chat ? (after.chatShown ? "visible" : "hidden") : "not on this page"}`);
  }

  console.log(`  before: width ${before.scrollWidth}px, ${before.days} days, ${before.handlers} pickup handlers`);
  console.log(`  after:  mode=${after.mode}, width ${after.scrollWidth}px, ${after.visibleDays} visible days, ${after.handlers} pickup handlers, blocked hosts: ${[...blocked].join(", ") || "none"}`);

  if (after.punchPage) {
    await checkPunchPage(page, file);
  } else if (!before.hasMonth) {
    console.log("  (no calendar on this page; chrome styling only)");
  } else {
    if (!after.active) fail("add-on did not activate");
    if (after.active && after.mode === "none") fail("add-on activated but set no mode (init threw; see console lines above)");
    if (after.scrollWidth > VIEWPORT.width) fail(`page still overflows: scrollWidth ${after.scrollWidth} > ${VIEWPORT.width}`);
    if (after.overflowing.length) fail(`elements past the right edge: ${after.overflowing.join(" | ")}`);
    if (after.handlers !== before.handlers) fail(`pickup handlers changed: ${before.handlers} -> ${after.handlers}`);
    if (after.mode === "location") {
      if (after.visibleDays !== 1) fail(`location view should show exactly one day, shows ${after.visibleDays}`);
      if (after.chips !== before.days) fail(`expected ${before.days} day chips, got ${after.chips}`);
    }
    if (after.mode === "agenda" && after.visibleDays !== before.days) fail(`agenda should show all ${before.days} days, shows ${after.visibleDays}`);
  }

  // View pickers and auto-submit. A submit listener swallows the navigation
  // and records what the form was about to post.
  const toolbar = await page.evaluate(() => {
    const form = document.getElementById("calendar_select");
    const log = [];
    if (form) form.addEventListener("submit", (e) => { e.preventDefault(); log.push(form.action); });
    window.__tsmSubmits = log;
    const selects = [...document.querySelectorAll(".tsm-viewselect")];
    const labels = [...document.querySelectorAll(".tsm-viewpick .tsm-label")].map((l) => l.textContent);
    const commonOpts = selects[0] ? [...selects[0].options].filter((o) => o.value).map((o) => o.text) : [];
    const otherOpts = selects[1] ? [...selects[1].options].filter((o) => o.value).map((o) => o.text) : [];
    return { count: selects.length, labels, commonOpts, otherOpts, goVisible: Boolean(document.getElementById("submit_form")?.offsetParent) };
  });
  if (toolbar.count) {
    console.log(`  view pickers: ${toolbar.labels.join(" / ")}; common = ${toolbar.commonOpts.join(", ")}; other = ${toolbar.otherOpts.length} views`);
    if (toolbar.count !== 2) fail(`expected 2 view pickers, got ${toolbar.count}`);
    if (toolbar.goVisible) fail("Go button still visible");
    if (toolbar.commonOpts.some((t) => /Vehicle\/Location/i.test(t)) || toolbar.otherOpts.some((t) => /Vehicle\/Location/i.test(t))) fail("prefix not stripped from view names");
    const expectedCommon = ["Individual Month View", "Available Open Shifts", "ALS", "BLS", "Details", "Dispatch"];
    if (JSON.stringify(toolbar.commonOpts) !== JSON.stringify(expectedCommon)) fail(`common views are ${toolbar.commonOpts.join(", ")}`);

    // choose BLS in the common picker
    const bls = await page.evaluate(() => {
      const sel = document.querySelector(".tsm-viewselect");
      const opt = [...sel.options].find((o) => o.text === "BLS");
      sel.value = opt.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return { hidden: document.getElementById("view_select").value, chosen: opt.value, submits: window.__tsmSubmits.slice() };
    });
    if (bls.hidden !== bls.chosen) fail("choosing a view did not update the page's own select");
    if (bls.submits.length !== 1 || !bls.submits[0].includes("template_id=59")) fail(`view change did not submit to the BLS view: ${bls.submits.join(" | ")}`);

    // change the month
    const month = await page.evaluate(() => {
      const sel = document.getElementById("StartMonth");
      sel.value = sel.value === "11" ? "12" : "11";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return window.__tsmSubmits.length;
    });
    if (month !== 2) fail("changing the month did not submit the form");
    else console.log(`  view change and month change both submitted the form (${bls.submits[0].replace(/^.*main\.php/, "main.php")})`);
  }

  if (after.mode === "agenda" && blsHtml) {
    await page.waitForFunction(() => ![...document.querySelectorAll(".tsm-crew-note")].some((n) => /checking/i.test(n.textContent)), null, { timeout: 10_000 }).catch(() => {});
    const crew = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("table.tsm-shift")].map((t) => ({
        day: Number(t.closest('td[id^="day_"]').id.slice(4)),
        unit: t.querySelector(".tsm-shift-main td")?.textContent.replace(/\u00a0/g, " ").trim(),
        time: t.querySelector(".tsm-shift-main td.timerange")?.textContent.trim(),
        past: t.closest('td[id^="day_"]').classList.contains("tsm-past"),
        note: t.querySelector(".tsm-crew-note")?.textContent || "",
        with: [...t.querySelectorAll(".tsm-crew:not(.tsm-crew-open) .tsm-crew-name")].map((n) => n.textContent),
        open: [...t.querySelectorAll(".tsm-crew-open .tsm-crew-name")].map((n) => n.textContent),
        spares: Boolean(t.querySelector(".tsm-spares-btn")),
      }));
      return { fetches: window.__tsmFetches, cards };
    });
    const first = crew.fetches[0];
    console.log(`  crew: ${crew.fetches.length} view request(s): ${crew.fetches.map((f) => `${f.method} ${f.url.replace(/^.*main\.php/, "main.php")}`).join(" ; ")}`);
    if (!first) fail("individual view did not request a unit view");
    else {
      if (first.method !== "POST" || !/template_id=59\b/.test(first.url)) fail(`first unit-view request should POST to the BLS view, was ${first.method} ${first.url}`);
      const b = first.body || {};
      if (!b._csrf || !b.cal_start_month || !b.cal_start_year) fail(`unit-view request is missing form fields: ${JSON.stringify(b)}`);
      if (first.credentials !== "same-origin") fail("unit-view request does not send the session cookie");
    }
    for (const c of crew.cards) {
      console.log(`    day ${c.day} ${c.unit} ${c.time}: ${c.with.length ? "with " + c.with.join(", ") : ""}${c.open.length ? " open: " + c.open.join(", ") : ""}${c.note ? " [" + c.note + "]" : ""}${c.spares ? " [See spares]" : ""}`);
      if (/checking/i.test(c.note)) fail(`day ${c.day}: crew line never resolved`);
      if (!c.past && c.open.length && !c.spares) fail(`day ${c.day}: open seat without a See spares button`);
      if (c.past && c.spares) fail(`day ${c.day}: past shift offers spares`);
      if (c.with.length && !c.open.length && c.spares) fail(`day ${c.day}: has a partner but still offers spares`);
      if (c.with.some((w) => /eden/i.test(w))) fail(`day ${c.day}: lists the signed-in user as their own partner`);
    }
    const matched = crew.cards.filter((c) => c.with.length || c.open.length).length;
    if (matched === 0) fail("no shift card got crew information");
    console.log(`  crew: ${matched} of ${crew.cards.length} shifts matched to a unit`);

    // Spares for the first open shift, checked against the BLS page parsed
    // independently here.
    const sparesBtn = page.locator(".tsm-spares-btn").first();
    if (await sparesBtn.count()) {
      await sparesBtn.scrollIntoViewIfNeeded();
      await sparesBtn.click();
      await page.waitForTimeout(200);
      const panel = await page.evaluate(() => {
        const btn = document.querySelector(".tsm-spares-btn[aria-expanded='true']");
        const table = btn.closest("table.tsm-shift");
        const rows = [...table.querySelectorAll(".tsm-spare")].map((r) => ({
          name: r.querySelector(".tsm-spare-name").textContent,
          unit: r.querySelector(".tsm-spare-unit").textContent,
          time: r.querySelector(".tsm-spare-time").textContent,
          overlap: r.querySelector(".tsm-spare-overlap").textContent,
        }));
        const right = Math.max(...[...table.querySelectorAll("*")].map((e) => e.getBoundingClientRect().right));
        return {
          day: Number(table.closest('td[id^="day_"]').id.slice(4)),
          time: table.querySelector(".tsm-shift-main td.timerange").textContent.trim(),
          title: table.querySelector(".tsm-spares-title")?.textContent,
          rows,
          right: Math.round(right),
          label: btn.textContent,
        };
      });
      const expected = await (async () => {
        const p2 = await context.newPage();
        await p2.goto("file://" + join(fixtures, blsFixture), { waitUntil: "load", timeout: 60_000 });
        const data = await p2.evaluate((day) => {
          const tidy = (t) => t.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
          const td = document.getElementById(`day_${day}`);
          return [...td.querySelectorAll("table.eventcontent > tbody > tr")].map((tr) => ({
            unit: tidy(tr.querySelector("div.location")?.textContent || ""),
            slots: [...tr.querySelectorAll("table.shifts > tbody > tr")].map((r) => ({ employee: r.classList.contains("employee"), who: tidy(r.querySelector("td")?.textContent || ""), time: tidy(r.querySelector("td.timerange")?.textContent || "") })),
          }));
        }, panel.day);
        await p2.close();
        const mins = (t) => { const m = /(\d{1,2}):(\d{2})\s*([ap])?/i.exec(t); let h = Number(m[1]); if (m[3]) h = (h % 12) + (m[3].toLowerCase() === "p" ? 12 : 0); return h * 60 + Number(m[2]); };
        const rng = (t) => { const [a, b] = t.split("-"); const s = mins(a); let e = mins(b); if (e <= s) e += 1440; return [s, e]; };
        const ov = (a, b) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
        const mine = rng(panel.time);
        const out = [];
        for (const u of data) for (const x of u.slots) {
          if (!x.employee || /eden/i.test(x.who)) continue;
          const r = rng(x.time);
          if (ov(r, mine) <= 0) continue;
          if (u.slots.some((y) => y !== x && y.employee && ov(rng(y.time), r) > 0)) continue;
          out.push(`${x.who}|${x.time}`);
        }
        return out;
      })();
      const got = panel.rows.map((r) => `${r.name}|${r.time}`);
      if (panel.label !== "Hide spares") fail(`spares button reads "${panel.label}" while open`);
      if (panel.right > VIEWPORT.width) fail(`spares panel overflows: right ${panel.right}`);
      if (got.length !== expected.length || got.some((g) => !expected.includes(g))) fail(`spares for day ${panel.day} ${panel.time}: got ${got.join("; ") || "none"}, expected ${expected.join("; ") || "none"}`);
      if (panel.rows.some((r) => !r.unit || !r.overlap)) fail("a spare row is missing its unit or overlap");
      console.log(`  spares on day ${panel.day} (${panel.time}): ${panel.title}; ${panel.rows.map((r) => `${r.name} @ ${r.unit} ${r.time} ${r.overlap}`).join(" ; ") || "none"}`);
      await page.screenshot({ path: join(outDir, `${name}-after-spares.png`) });
      await sparesBtn.click();
      await page.waitForTimeout(100);
      if (await page.locator(".tsm-shift-spares").count()) fail("Hide spares did not close the panel");
    } else {
      console.log("  (no open shift in this fixture, spares panel not exercised)");
    }
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

      // Calendar mode: a month grid with a dot per shift of that person.
      await page.locator(".tsm-calbtn").click();
      await page.waitForTimeout(200);
      const cal = await page.evaluate(() => {
        const html = document.documentElement;
        const cells = [...document.querySelectorAll(".tsm-cal-day")];
        const count = (c) => (c.querySelector(".tsm-cal-count") ? Number(c.querySelector(".tsm-cal-count").textContent) : c.querySelectorAll(".tsm-cal-dot").length);
        const chipCounts = [...document.querySelectorAll(".tsm-chip")].map((chip) => {
          const b = chip.querySelector(".tsm-chip-name");
          return b.hidden ? 0 : Number(b.textContent);
        });
        const inFixed = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true; return false; };
        const wide = [...document.querySelectorAll("body *")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > innerWidth + 1 && !inFixed(el);
        });
        return {
          on: html.dataset.tsmCal === "on",
          gridVisible: Boolean(document.querySelector(".tsm-cal-grid")?.offsetParent),
          cells: cells.length,
          dotted: cells.filter((c) => c.classList.contains("tsm-cal-has")).length,
          mismatches: cells.filter((c, i) => count(c) !== chipCounts[i]).length,
          visibleDays: [...document.querySelectorAll('td[id^="day_"]')].filter((td) => td.offsetParent !== null).length,
          stripVisible: Boolean(document.querySelector(".tsm-strip")?.offsetParent),
          caption: document.querySelector(".tsm-cal-caption")?.textContent,
          button: document.querySelector(".tsm-calbtn")?.textContent,
          overflowing: wide.length,
          scrollWidth: html.scrollWidth,
        };
      });
      if (!cal.on || !cal.gridVisible) fail("calendar mode did not turn on");
      if (cal.cells !== before.days) fail(`calendar has ${cal.cells} day cells, expected ${before.days}`);
      if (cal.dotted !== check.daysWithBadge) fail(`calendar dots ${cal.dotted} days, chips flag ${check.daysWithBadge}`);
      if (cal.mismatches) fail(`dot counts disagree with chip counts on ${cal.mismatches} days`);
      if (cal.visibleDays !== 0 || cal.stripVisible) fail("calendar mode still shows the day list or strip");
      if (cal.button !== "List") fail(`toggle reads "${cal.button}" in calendar mode`);
      if (cal.overflowing || cal.scrollWidth > VIEWPORT.width) fail(`calendar mode overflows: ${cal.overflowing} elements, scrollWidth ${cal.scrollWidth}`);
      console.log(`  calendar: ${cal.dotted} dotted days; caption: ${cal.caption}`);
      await page.screenshot({ path: join(outDir, `${name}-after-calendar-month.png`) });

      // Tap the last dotted day (lowest on the grid, so the card has to fit
      // below it) and compare the card against the day's own unit list.
      await page.locator(".tsm-cal-day.tsm-cal-has").last().click();
      await page.waitForTimeout(400);
      const pop = await page.evaluate((personName) => {
        const pop = document.querySelector(".tsm-pop");
        const r = pop.getBoundingClientRect();
        const cell = document.querySelector(".tsm-cal-day.tsm-cal-active");
        const dayNum = cell?.querySelector(".tsm-cal-num")?.textContent;
        const dots = cell ? (cell.querySelector(".tsm-cal-count") ? Number(cell.querySelector(".tsm-cal-count").textContent) : cell.querySelectorAll(".tsm-cal-dot").length) : -1;
        const shifts = [...pop.querySelectorAll(".tsm-pop-shift")].map((s) => ({
          unit: s.querySelector(".tsm-pop-unit")?.textContent,
          time: s.querySelector(".tsm-pop-time")?.textContent,
          with: [...s.querySelectorAll(".tsm-pop-with")].map((w) => [...w.children].map((c) => c.textContent).join(" ") || w.textContent),
        }));
        // Independent expectation from the day cell: every highlighted slot's
        // unit and time, plus the other crew with the identical time string.
        const key = (t) => {
          const w = t.replace(/\u00a0/g, " ").trim().split(/\s+/);
          return w.length < 2 ? w[0] : `${w[0].split("-")[0]} ${w[w.length - 1]}`.toLowerCase();
        };
        const td = document.getElementById(`day_${dayNum}`);
        const expected = [...td.querySelectorAll("tr.tsm-match-slot")].map((tr) => {
          const unit = tr.closest(".tsm-unit");
          const time = tr.querySelector("td.timerange").textContent.trim();
          const mates = [...unit.querySelectorAll("tr.employee")]
            .filter((o) => o !== tr && o.querySelector("td.timerange").textContent.trim() === time && key(o.querySelector("td").textContent) !== key(tr.querySelector("td").textContent))
            .map((o) => o.querySelector("td").textContent.replace(/\u00a0/g, " ").trim());
          return { unitText: unit.querySelector("div.location").textContent.trim(), time, mates };
        });
        return {
          shown: !pop.hidden && r.width > 0,
          left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
          docBottom: Math.round(r.bottom + scrollY), docHeight: document.documentElement.scrollHeight,
          title: pop.querySelector(".tsm-pop-title")?.textContent,
          dayNum, dots, shifts, expected,
          goVisible: Boolean(pop.querySelector(".tsm-pop-go")?.offsetParent),
          personKey: key(personName),
        };
      }, person);
      if (!pop.shown) fail("tapping a dotted day did not open the shift card");
      if (pop.left < 0 || pop.right > VIEWPORT.width) fail(`shift card off-screen horizontally: ${pop.left}..${pop.right}`);
      if (pop.docBottom > pop.docHeight) fail(`shift card extends past the page bottom: ${pop.docBottom} > ${pop.docHeight}`);
      if (pop.shifts.length !== pop.dots || pop.shifts.length !== pop.expected.length) fail(`card lists ${pop.shifts.length} shifts, day shows ${pop.dots} dots, cell has ${pop.expected.length} matches`);
      if (!pop.goVisible) fail("shift card has no See-this-day button");
      for (const [i, s] of pop.shifts.entries()) {
        const e = pop.expected[i];
        if (!s.unit || !s.time) fail(`shift ${i + 1} on the card is missing unit or time`);
        if (e && !e.unitText.startsWith(s.unit)) fail(`shift ${i + 1}: card says "${s.unit}", cell says "${e.unitText}"`);
        if (e && e.time !== s.time) fail(`shift ${i + 1}: card says ${s.time}, cell says ${e.time}`);
        const withText = s.with.join(" | ");
        for (const mate of e?.mates ?? []) {
          if (!withText.includes(mate)) fail(`shift ${i + 1}: crewmate "${mate}" missing from the card (${withText})`);
        }
        const selfListed = s.with.some((w) => w.toLowerCase().includes(pop.personKey.split(" ")[1] || "\u0000") && w.toLowerCase().includes(pop.personKey.split(" ")[0]));
        if (selfListed) fail(`shift ${i + 1}: the person is listed as their own crewmate (${withText})`);
      }
      console.log(`  shift card for ${pop.title}: ${pop.shifts.map((s) => `${s.unit} ${s.time} [${s.with.join("; ")}]`).join(" · ")}`);
      await page.screenshot({ path: join(outDir, `${name}-after-calendar-popup.png`) });

      // "See this day" returns to the list on that day.
      await page.locator(".tsm-pop-go").click();
      await page.waitForTimeout(200);
      const back = await page.evaluate(() => ({
        on: Boolean(document.documentElement.dataset.tsmCal),
        selected: document.querySelector('td[id^="day_"].tsm-selected')?.id,
        visibleDays: [...document.querySelectorAll('td[id^="day_"]')].filter((td) => td.offsetParent !== null).length,
        popHidden: document.querySelector(".tsm-pop").hidden,
        button: document.querySelector(".tsm-calbtn")?.textContent,
      }));
      if (back.on || back.visibleDays !== 1 || !back.popHidden || back.button !== "Calendar") fail("See this day did not return to list mode");
      if (back.selected !== `day_${pop.dayNum}`) fail(`See this day landed on ${back.selected}, expected day_${pop.dayNum}`);

      await page.locator(".tsm-search-clear").click();
      await page.waitForTimeout(300);
      const cleared = await page.evaluate(() => ({
        active: Boolean(document.documentElement.dataset.tsmName),
        badges: document.querySelectorAll(".tsm-chip-has-match").length,
      }));
      if (cleared.active || cleared.badges) fail("clearing the person filter did not reset it");

      // Calendar with nothing typed: no dots, a hint instead.
      await page.locator(".tsm-calbtn").click();
      await page.waitForTimeout(200);
      const empty = await page.evaluate(() => ({
        dotted: document.querySelectorAll(".tsm-cal-has").length,
        caption: document.querySelector(".tsm-cal-caption")?.textContent || "",
      }));
      if (empty.dotted || !/type a name/i.test(empty.caption)) fail(`empty calendar: ${empty.dotted} dotted days, caption "${empty.caption}"`);
      await page.locator(".tsm-calbtn").click();
      await page.waitForTimeout(200);
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
