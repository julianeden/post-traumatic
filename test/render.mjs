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
import { chromium, webkit } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = resolve(process.env.TSM_FIXTURES ?? join(root, "test", "fixtures"));
const outDir = join(root, "test", "out");
mkdirSync(outDir, { recursive: true });

const VIEWPORT = { width: 412, height: 915 };
const cssPath = join(root, "src", "content.css");
const jsPath = join(root, "src", "content.js");
// TSM_USERSCRIPT=1 injects only the bundled userscript (which carries the
// stylesheet itself); TSM_BROWSER=webkit runs in Safari's engine.
const userscript = process.env.TSM_USERSCRIPT === "1" ? join(root, "userscript", "post-traumatic.user.js") : null;
const engine = process.env.TSM_BROWSER === "webkit" ? webkit : chromium;
async function inject(page) {
  if (userscript) {
    await page.addScriptTag({ path: userscript });
  } else {
    await page.addStyleTag({ path: cssPath });
    await page.addScriptTag({ path: jsPath });
  }
}

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
        // A page saved while only the header chrome was active carries the
        // add-on's bar; drop it so the script builds its own.
        if (/\.html?$/i.test(path) && body.includes("tsm-topnav")) {
          body = Buffer.from(body.toString("utf8").replace(/<nav class="tsm-topnav"[^>]*>[\s\S]*?<\/nav>/, "").replace(/ data-tsm-chrome="on"/, ""), "utf8");
        }
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

const browser = await engine.launch({ headless: true });
console.log(`engine: ${process.env.TSM_BROWSER === "webkit" ? "webkit" : "chromium"}; injecting ${userscript ? "the userscript bundle" : "content.css + content.js"}`);
let failures = 0;

// Work order and checklist pages: everything fits the phone, controls are
// full width and finger sized, and the checklist odometer keeps no upper
// limit even after the site re-applies its rules on a shift change.
async function checkFormPage(page, name, after) {
  if (!after.active) fail("add-on did not activate on the form page");
  if (after.scrollWidth > VIEWPORT.width) fail(`form page overflows: scrollWidth ${after.scrollWidth}`);
  if (after.overflowing.length) fail(`form elements past the right edge: ${after.overflowing.join(" | ")}`);
  const st = await page.evaluate(() => {
    const vis = (el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0;
    const fields = [...document.querySelectorAll("form input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=submit]):not([type=file]), form select, form textarea")].filter(vis);
    const small = fields.filter((f) => f.getBoundingClientRect().width < 200 || parseFloat(getComputedStyle(f).fontSize) < 16).map((f) => `${f.tagName.toLowerCase()}#${f.id || f.name} ${Math.round(f.getBoundingClientRect().width)}px/${getComputedStyle(f).fontSize}`);
    const ticks = [...document.querySelectorAll("form input[type=radio], form input[type=checkbox]")].filter(vis);
    const tinyTicks = ticks.filter((t) => t.getBoundingClientRect().width < 20).length;
    const submit = [...document.querySelectorAll("input[type=submit], button#vehicle_maintenance_request_dialog_button")].filter(vis).map((b) => Math.round(b.getBoundingClientRect().width));
    const odo = document.getElementById("formbuilder_rigcheck_odometer");
    return {
      mode: document.documentElement.dataset.tsmPage,
      fields: fields.length, small, ticks: ticks.length, tinyTicks, submit,
      odo: odo ? { cls: odo.className, max: odo.getAttribute("max"), inputmode: odo.getAttribute("inputmode") } : null,
    };
  });
  const tints = await page.evaluate(() => [...document.querySelectorAll(".tsm-tint")].map((b) => {
    // computed colour may be rgb(r, g, b) or color(srgb r g b) after color-mix
    const bg = getComputedStyle(b).backgroundColor;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
    const c = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(bg);
    const rgb = m ? [m[1] / 255, m[2] / 255, m[3] / 255] : c ? [Number(c[1]), Number(c[2]), Number(c[3])] : null;
    const lum = rgb ? 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] : 0;
    const big = [...b.querySelectorAll("*")].filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) > 16).length;
    return { lum: Math.round(lum * 100) / 100, big, height: Math.round(b.getBoundingClientRect().height) };
  }));
  if (tints.some((t) => t.lum < 0.85)) fail(`a tinted box is still loud: ${JSON.stringify(tints)}`);
  if (tints.some((t) => t.big)) fail(`a tinted box still has large text: ${JSON.stringify(tints)}`);
  if (tints.length) console.log(`  ${tints.length} coloured boxes softened (heights ${tints.map((t) => t.height).join("/")}px)`);
  if (st.small.length) fail(`${st.small.length} form field(s) too narrow or small: ${st.small.slice(0, 4).join(", ")}`);
  if (st.tinyTicks) fail(`${st.tinyTicks} radio/checkbox controls under 20px`);
  if (!st.submit.length || st.submit.some((w) => w < 300)) fail(`submit buttons: ${st.submit.join(", ") || "none visible"}`);
  console.log(`  ${st.mode} page: ${st.fields} fields full width, ${st.ticks} tick boxes, submit ${st.submit.join("/")}px`);
  if (st.odo) {
    if (/max\[/.test(st.odo.cls) || st.odo.max !== null) fail(`odometer still limited: ${st.odo.cls} max=${st.odo.max}`);
    if (!/custom\[integer\]/.test(st.odo.cls) || !/min\[/.test(st.odo.cls)) fail(`odometer lost the site's integer or minimum rule: ${st.odo.cls}`);
    if (st.odo.inputmode !== "decimal") fail("odometer has no decimal keyboard hint");
    // a reading typed with tenths is sent as whole miles
    const miles = await page.evaluate(() => {
      const odo = document.getElementById("formbuilder_rigcheck_odometer");
      const out = {};
      odo.value = "143,800.7";
      odo.dispatchEvent(new Event("change", { bubbles: true }));
      out.afterChange = odo.value;
      odo.value = "143801.2";
      odo.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      out.afterSubmit = odo.value;
      odo.value = "143802";
      odo.dispatchEvent(new Event("change", { bubbles: true }));
      out.wholeKept = odo.value;
      odo.value = "";
      return out;
    });
    if (miles.afterChange !== "143800" || miles.afterSubmit !== "143801" || miles.wholeKept !== "143802") fail(`odometer tenths not cut to whole miles: ${JSON.stringify(miles)}`);
    console.log(`  odometer: 143,800.7 → ${miles.afterChange} on change, 143801.2 → ${miles.afterSubmit} on submit, whole readings untouched`);
    // the way a person does it: type tenths, tab out, and the site's validator
    // (which runs on blur) must see whole miles and raise no prompt
    const odoField = page.locator("#formbuilder_rigcheck_odometer");
    await odoField.fill("143900.4");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(400);
    const typed = await page.evaluate(() => ({
      value: document.getElementById("formbuilder_rigcheck_odometer").value,
      prompts: [...document.querySelectorAll(".formError")].filter((e) => e.offsetParent).map((e) => e.textContent.trim()),
      validatorPresent: typeof window.jQuery?.fn?.validationEngine === "function",
    }));
    if (typed.value !== "143900" || typed.prompts.length) fail(`typing tenths and tabbing out: value ${typed.value}, prompts ${JSON.stringify(typed.prompts)}`);
    console.log(`  odometer typed as 143900.4 then tab: value ${typed.value}, no error prompt${typed.validatorPresent ? " (site validator active)" : " (site validator not loaded here)"}`);
    await odoField.fill("");
    // the site re-applies its rules when the shift changes
    const again = await page.evaluate(async () => {
      const sel = document.getElementById("formbuilder_rigcheck_shift");
      if (!sel || sel.options.length < 2) return "no second shift";
      sel.selectedIndex = sel.selectedIndex === 0 ? 1 : 0;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));
      return document.getElementById("formbuilder_rigcheck_odometer").className;
    });
    if (/max\[/.test(again)) fail(`odometer limit came back after a shift change: ${again}`);
    console.log(`  odometer rules: ${st.odo.cls} → after shift change: ${again}`);
  }
  await page.screenshot({ path: join(outDir, `${name}-after-full.png`), fullPage: true });
}

// The overtime form the site serves after a late punch out: a summary card
// built from the page's own shift facts, stacked full-width fields, the
// reason-specific rows still appearing, and a full-width Submit.
async function checkOvertimePage(page, name, after) {
  if (!after.active) fail("add-on did not activate on the overtime form");
  if (after.scrollWidth > VIEWPORT.width) fail(`overtime form overflows: scrollWidth ${after.scrollWidth}`);
  if (after.overflowing.length) fail(`overtime form elements past the right edge: ${after.overflowing.join(" | ")}`);
  const read = () => page.evaluate(() => {
    const vis = (el) => Boolean(el) && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
    const fields = [...document.querySelectorAll("#form1 input:not([type=hidden]):not([type=submit]), #form1 select, #form1 textarea")].filter(vis);
    return {
      heading: document.querySelector(".tsm-ot-heading")?.textContent.trim(),
      summary: [...document.querySelectorAll(".tsm-ot-summary .tsm-ot-sum-row")].map((r) => [...r.children].map((c) => c.textContent.trim()).join(" ")),
      factsShown: [...document.querySelectorAll("tr.tsm-ot-fact")].filter(vis).length,
      titleRowShown: vis(document.querySelector("tr.tsm-ot-title")),
      fields: fields.map((f) => `${f.tagName.toLowerCase()}#${f.id || f.name}`),
      small: fields.filter((f) => f.getBoundingClientRect().width < 300 || parseFloat(getComputedStyle(f).fontSize) < 16).map((f) => `${f.id} ${Math.round(f.getBoundingClientRect().width)}px/${getComputedStyle(f).fontSize}`),
      labels: [...document.querySelectorAll("td.tsm-ot-label")].filter(vis).map((c) => c.textContent.replace(/\s+/g, " ").trim()),
      submit: [...document.querySelectorAll('#form1 input[type="submit"]')].filter(vis).map((b) => Math.round(b.getBoundingClientRect().width)),
      requiredStar: vis(document.querySelector(".required_comments")),
      height: document.documentElement.scrollHeight,
    };
  });
  let st = await read();
  if (st.heading !== "Overtime/Extra Hours Authorization Form") fail(`overtime heading reads "${st.heading}"`);
  if (st.titleRowShown || st.factsShown) fail(`the site's title row or fact rows are still shown (${st.factsShown} facts)`);
  if (st.summary.length !== 2 || st.summary[0] !== "Shift Sat Nov 7 · 10:00 – 18:00" || st.summary[1] !== "Punched out 19:25 1 h 25 min after the shift ended") fail(`summary card reads ${JSON.stringify(st.summary)}`);
  if (JSON.stringify(st.fields) !== JSON.stringify(["select#reason", "textarea#comments"])) fail(`fields shown at first: ${st.fields.join(", ")}`);
  if (st.small.length) fail(`overtime fields too narrow or small: ${st.small.join(", ")}`);
  if (st.labels.some((l) => /:$/.test(l))) fail(`labels still end in a colon: ${st.labels.join(" | ")}`);
  if (!st.submit.length || st.submit.some((w) => w < 300)) fail(`overtime submit: ${st.submit.join(", ") || "none visible"}`);
  console.log(`  overtime form: "${st.heading}" · ${st.summary.join(" / ")} · fields ${st.fields.join(", ")} · submit ${st.submit.join("/")}px · ${st.height}px tall`);
  await page.screenshot({ path: join(outDir, `${name}-after.png`) });
  await page.screenshot({ path: join(outDir, `${name}-after-full.png`), fullPage: true });

  // A reason the site attaches questions to shows those rows, full width.
  await page.selectOption("#reason", "On a Call");
  await page.waitForTimeout(150);
  st = await read();
  const onCall = ["select#reason", "input#run_number", "input#patient_name", "input#patient_address", "input#pickup_location", "textarea#comments"];
  if (JSON.stringify(st.fields) !== JSON.stringify(onCall)) fail(`On a Call fields: ${st.fields.join(", ")}`);
  if (st.small.length) fail(`On a Call fields too narrow or small: ${st.small.join(", ")}`);
  if (st.labels.some((l) => /:$/.test(l))) fail(`On a Call labels still end in a colon: ${st.labels.join(" | ")}`);
  console.log(`  On a Call: ${st.fields.length} fields · labels ${st.labels.join(" · ")}`);
  await page.screenshot({ path: join(outDir, `${name}-after-oncall.png`), fullPage: true });
  await page.selectOption("#reason", "Other");
  await page.waitForTimeout(150);
  st = await read();
  if (!st.requiredStar) fail("Other: comments not marked required");
  if (JSON.stringify(st.fields) !== JSON.stringify(["select#reason", "textarea#comments"])) fail(`Other fields: ${st.fields.join(", ")}`);
  // Submitting with no reason stays on the page: the site's validator alerts.
  await page.selectOption("#reason", "");
  await page.locator('#form1 input[type="submit"]').click();
  await page.waitForTimeout(300);
  if (!(await page.evaluate(() => Boolean(document.getElementById("form1"))))) fail("submitting with no reason left the page");
  console.log("  Other marks comments required; an empty submit stays on the page");
}

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
    await inject(page);
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
      continueShown: vis(document.getElementById("continue")) && /Continue/.test(document.getElementById("continue").value),
      logoutShown: vis(document.getElementById("logout_button")),
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
  if (!st.continueShown) fail("Continue link missing on the punch page");
  if (st.logoutShown) fail("Logout still visible");
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
    if (text.includes("[Post-Traumatic]")) console.log(`  console: ${text.replace("[Post-Traumatic] ", "")}`);
  });
  const injectLogin = async () => {
    await inject(page);
    await page.waitForTimeout(300);
  };
  const USER = "input.v-text-field[data-testid='login-identifier'] input, [data-testid='login-identifier'] input";

  // First visit: nothing remembered; typing and pressing Continue stores it.
  await page.goto(`${origin}/login.php`, { waitUntil: "load", timeout: 60_000 });
  await injectLogin();
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
  await injectLogin();
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
  // A saved page already holds its built jqGrid; the site's script would build
  // it again on load and empty it, so a second build of a built table is skipped.
  await context.addInitScript(() => {
    let jq;
    const hook = (v) => {
      jq = v;
      if (!v || !v.fn || v.fn.__tsmGridHooked) return;
      let real = v.fn.jqGrid;
      Object.defineProperty(v.fn, "jqGrid", {
        configurable: true,
        get: () => real && function (opts) { return typeof opts === "object" && this[0]?.classList.contains("ui-jqgrid-btable") ? this : real.apply(this, arguments); },
        set: (f) => { real = f; },
      });
      v.fn.__tsmGridHooked = true;
    };
    for (const name of ["jQuery", "$"]) Object.defineProperty(window, name, { configurable: true, get: () => jq, set: hook });
  });
  const page = await context.newPage();
  page.on("dialog", (d) => d.dismiss());
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[Post-Traumatic]")) console.log(`  console: ${text.replace("[Post-Traumatic] ", "")}`);
  });
  // The Dispatch view is told apart by the template id its dropdown option
  // carries; naming it in the address makes a saved unit view count as Dispatch.
  const dispatchId = /template_id=(\d+)[^>]*>[^<]*Dispatch/.exec(readFileSync(join(fixtures, file), "utf8"))?.[1];
  await page.goto(`${ORIGIN}/main.php?a=user:schedule&fixture=${encodeURIComponent(file)}${dispatchId ? `&template_id=${dispatchId}` : ""}`, { waitUntil: "load", timeout: 60_000 });

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

  // The Fleet request page builds its form by script after load; empty the
  // saved form first and put it back late, as the site does.
  const lateForm = await page.evaluate(() => {
    const box = document.getElementById("vehicle_maintenance_request_dialog");
    if (!box) return false;
    window.__tsmLate = box.innerHTML;
    box.innerHTML = "";
    return true;
  });

  // A unit view gets a "today" (its second day) and a clock reading 06:00, so
  // the on-now marks can be checked against the saved shifts.
  const onNowSetup = await page.evaluate(() => {
    if (!document.querySelector("table.month div.location")) return null;
    const days = [...document.querySelectorAll('table.month td[id^="day_"]')];
    if (days.length < 2) return null;
    for (const td of days) td.classList.remove("today");
    days[1].classList.add("today");
    // two headings worded the way the Dispatch view words them (typo and all)
    const heads = days[1].querySelectorAll("div.location");
    if (heads[0]) heads[0].textContent = "Commincation Supervisor (Commincation Supervisor)";
    if (heads[1]) heads[1].textContent = "Communications-Night (Communications-Night)";
    const six = new Date(); six.setHours(6, 0, 0, 0);
    const s = document.createElement("script"); s.textContent = `/* harness clock */ moment.unix(${Math.floor(six.getTime() / 1000)})`;
    document.body.append(s);
    const range = (text) => { const m = /(\d{1,2}):(\d{2})\s*([ap])?m?\s*[-–]\s*(\d{1,2}):(\d{2})\s*([ap])?m?/i.exec(text || ""); if (!m) return null; const mins = (h, mi, ap) => ((ap ? (Number(h) % 12) + (ap.toLowerCase() === "p" ? 12 : 0) : Number(h)) * 60 + Number(mi)); const start = mins(m[1], m[2], m[3]); let end = mins(m[4], m[5], m[6]); if (end <= start) end += 1440; return { start, end }; };
    const rows = (td, at) => [...td.querySelectorAll("tr.employee")].filter((tr) => { const rg = range(tr.querySelector("td.timerange")?.textContent); return rg && rg.start <= at && at < rg.end; }).map((tr) => { tr.dataset.expectOnNow = "1"; return tr.querySelector("td.timerange").textContent.trim(); });
    return { today: rows(days[1], 360), yesterday: rows(days[0], 360 + 1440) };
  });

  await inject(page);
  await page.waitForTimeout(500);
  if (lateForm) {
    const early = await page.evaluate(() => document.documentElement.dataset.tsmPage || "none");
    if (early !== "none") fail(`fleet page styled before its form existed (${early})`);
    await page.evaluate(() => { document.getElementById("vehicle_maintenance_request_dialog").innerHTML = window.__tsmLate; });
    await page.waitForFunction(() => document.documentElement.dataset.tsmPage === "fleet", null, { timeout: 5000 }).catch(() => {});
    console.log("  fleet form injected 500 ms after the script ran");
  }

  // A page that opens on More Options (a management form served inline) is
  // checked as it landed, then parked on the Schedule tab for the shared checks.
  const landing = await page.evaluate(() => {
    const vis = (el) => el.offsetParent !== null;
    const active = document.querySelector(".tsm-active");
    return {
      sub: document.documentElement.dataset.tsmView === "sub",
      tab: document.documentElement.dataset.tsmTab,
      subCount: document.querySelectorAll(".tsm-subpage").length,
      subShown: [...document.querySelectorAll(".tsm-subpage")].filter(vis).length,
      active: active?.querySelector("td.std_header")?.textContent.trim() || "",
      activeTop: active ? Math.round(active.getBoundingClientRect().top) : null,
      calendarShown: document.querySelector("table.month") ? vis(document.querySelector("table.month")) : false,
      scrollWidth: document.documentElement.scrollWidth,
      cards: document.querySelectorAll("table.tsm-cards > tbody > tr:not(.tsm-cards-head):not(.tsm-cards-caption):not(.tsm-cards-span)").length,
      uncaptioned: document.querySelectorAll("table.tsm-cards > tbody > tr:not(.tsm-cards-head):not(.tsm-cards-caption):not(.tsm-cards-span) > td:not([data-label]):not(.tsm-cards-action):not(.tsm-empty)").length,
      tabsShown: document.querySelector(".tsm-tabs") ? vis(document.querySelector(".tsm-tabs")) : false,
      backShown: document.querySelector(".tsm-back") ? vis(document.querySelector(".tsm-back")) : false,
      othersShown: [...document.querySelectorAll(".tsm-more:not(.tsm-active):not(.tsm-subpage)")].filter(vis).length,
      title: document.querySelector(".tsm-subbar-title")?.textContent || "",
    };
  });
  if (landing.sub) {
    await page.screenshot({ path: join(outDir, `${name}-landing.png`) });
    await page.screenshot({ path: join(outDir, `${name}-more-options.png`), fullPage: true });
    // scrolled down, the bar stays under the site header; Back restores the list
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(100);
    landing.scrolled = await page.evaluate(() => ({ y: Math.round(scrollY), barTop: Math.round(document.querySelector(".tsm-subbar")?.getBoundingClientRect().top ?? -1) }));
    await page.screenshot({ path: join(outDir, `${name}-landing-scrolled.png`) });
    await page.locator(".tsm-back").click();
    await page.waitForTimeout(150);
    landing.afterBack = await page.evaluate(() => {
      const vis = (el) => el && el.offsetParent !== null;
      return { view: document.documentElement.dataset.tsmView, tab: document.documentElement.dataset.tsmTab, y: Math.round(scrollY), tabsShown: vis(document.querySelector(".tsm-tabs")), barShown: vis(document.querySelector(".tsm-subbar")), subShown: [...document.querySelectorAll(".tsm-subpage")].filter(vis).length, links: [...document.querySelectorAll("td.indent > a")].filter(vis).length };
    });
    await page.locator(".tsm-tab", { hasText: "Schedule" }).click();
    await page.waitForTimeout(150);
  }

  const after = await page.evaluate(() => {
    const html = document.documentElement;
    // Anything inside a fixed element (the site's header) cannot scroll the page.
    const inFixed = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true; return false; };
    // ...and a region that scrolls sideways on purpose keeps its contents off the page width.
    const inScroller = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (/auto|scroll/.test(getComputedStyle(n).overflowX)) return true; return false; };
    const wide = [...document.querySelectorAll("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > innerWidth + 1 && !inFixed(el) && !inScroller(el);
    });
    return {
      active: html.dataset.tsmReady === "1",
      mode: html.dataset.tsmMode || "none",
      scrollWidth: html.scrollWidth,
      handlers: document.querySelectorAll("span.hightlight[onclick]").length,
      overflowing: wide.slice(0, 5).map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""} right=${Math.round(el.getBoundingClientRect().right)}`),
      visibleDays: [...document.querySelectorAll('td[id^="day_"]')].filter((td) => td.offsetParent !== null).length,
      chips: document.querySelectorAll(".tsm-chip").length,
      hasHeader: Boolean(document.getElementById("ts_menus_menu_div")),
      nav: [...document.querySelectorAll("#tsm-topnav .tsm-topbtn")].map((b) => ({ label: b.title, href: b.getAttribute("href"), shown: Boolean(b.offsetParent), right: Math.round(b.getBoundingClientRect().right) })),
      navAfterBurger: document.querySelector('button[title="All Menus"]')?.nextElementSibling?.id === "tsm-topnav",
      chromeShown: ["ts_menu_search_text_div", "sysmgt_button", "chat_button", "myportal_button", "ts_menus_user_div"].filter((id) => document.getElementById(id)?.offsetParent).concat([...document.querySelectorAll(".ts-menus-logo")].filter((e) => e.offsetParent).map(() => "logo")),
      // the bell stays in the page as a 1px invisible activator, never as a visible button
      bell: document.getElementById("notifications_button") ? document.getElementById("notifications_button").getBoundingClientRect().width > 2 : null,
      // every bar item left to right: x range and height
      barItems: [document.querySelector('button[title="All Menus"]'), ...document.querySelectorAll("#tsm-topnav .tsm-topbtn")]
        .filter((e) => e && e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.height)]; }),
      footerShown: Boolean(document.getElementById("footer")?.offsetParent),
      punchPage: Boolean(document.getElementById("punchin_form")),
      formPage: html.dataset.tsmPage === "form" || html.dataset.tsmPage === "fleet",
      overtimePage: html.dataset.tsmPage === "overtime",
    };
  });
  if (after.active && after.footerShown) fail("the copyright footer is still shown");

  if (after.hasHeader) {
    const labels = after.nav.map((b) => b.label);
    if (JSON.stringify(labels) !== JSON.stringify(["Schedule", "Work orders", "Checklists", "Punch Clock"])) fail(`top bar buttons are ${labels.join(", ")}`);
    if (after.nav.some((b) => !b.shown)) fail("a top bar button is hidden");
    if (after.nav.some((b) => b.right > VIEWPORT.width)) fail("the top bar runs past the right edge");
    if (!after.navAfterBurger) {
      if (await page.locator('button[title="All Menus"]').count()) fail("top bar is not right after the hamburger");
    }
    if (after.nav[0]?.href !== "/main.php?a=user:schedule" || after.nav[3]?.href !== "/main.php?a=user:punchin") fail(`top bar links: ${after.nav.map((b) => b.href).join(", ")}`);
    if (after.chromeShown.length) fail(`header still shows: ${after.chromeShown.join(", ")}`);
    if (after.bell === true) fail("notifications bell still visible in the bar");
    if (after.barItems.length >= 5) {
      const gaps = after.barItems.slice(1).map((b, i) => b[0] - after.barItems[i][1]);
      const edges = [after.barItems[0][0], VIEWPORT.width - after.barItems[after.barItems.length - 1][1]];
      const all = gaps.concat(edges);
      if (Math.max(...all) - Math.min(...all) > 14) fail(`bar items not spread evenly: gaps ${gaps.join(",")} edges ${edges.join(",")}`);
      const heights = after.barItems.map((b) => b[2]);
      if (Math.max(...heights) - Math.min(...heights) > 3) fail(`bar items differ in height: ${heights.join(",")}`);
    }
    console.log(`  header: ${labels.length} quick buttons; bell ${after.bell === null ? "not on this page" : "hidden"}; hidden ok`);

    // The hamburger's list exists in the DOM even while closed (the saved
    // pages' Vue menus do not animate open here); it gets an Alerts entry
    // after Punch Clock whose tap triggers the hidden bell.
    if (after.bell !== null && await page.locator('button[title="All Menus"]').count()) {
      const ham = await page.evaluate(() => {
        const burger = document.querySelector('button[title="All Menus"]');
        const id = burger.getAttribute("aria-controls") || burger.getAttribute("aria-owns");
        const list = document.getElementById(id)?.querySelector(".v-list");
        const items = list ? [...list.querySelectorAll("a.ts_menu_list_item")].map((a) => a.textContent.trim()) : [];
        const alerts = document.getElementById("tsm-alerts-item");
        const bell = document.getElementById("notifications_button");
        window.__bellClicks = 0;
        bell.addEventListener("click", () => { window.__bellClicks += 1; });
        const anchor = items.includes("Punch Clock") ? "Punch Clock" : "My Account";
        return { items, alerts: Boolean(alerts), anchor, afterPunch: items.indexOf("Alerts") === items.indexOf(anchor) + 1, icon: alerts?.querySelector("i.mdi-bell") ? true : false };
      });
      if (!ham.items.length) fail("hamburger list not found");
      else {
        if (!ham.alerts || !ham.icon) fail("Alerts entry missing from the hamburger list");
        if (!ham.afterPunch) fail(`Alerts entry not after ${ham.anchor}: ${ham.items.join(", ")}`);
        await page.locator("#tsm-alerts-item").dispatchEvent("click");
        await page.waitForTimeout(200);
        const clicks = await page.evaluate(() => window.__bellClicks);
        if (clicks !== 1) fail(`Alerts entry triggered the bell ${clicks} times`);
        console.log(`  hamburger: ${ham.items.length} items, Alerts after ${ham.anchor}, triggers the bell`);
      }
    }

    // The wrench and checklist menus open under their buttons and close on a tap outside.
    for (const [title, expected] of [["Work orders", 5], ["Checklists", 2]]) {
      await page.locator(`.tsm-topbtn[title="${title}"]`).click();
      await page.waitForTimeout(100);
      const menu = await page.evaluate(() => {
        const m = document.querySelector(".tsm-menu:not([hidden])");
        if (!m) return null;
        const r = m.getBoundingClientRect();
        return { items: [...m.querySelectorAll(".tsm-menu-item")].map((a) => [a.textContent, a.getAttribute("href")]), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) };
      });
      if (!menu) fail(`${title} menu did not open`);
      else {
        if (menu.items.length !== expected) fail(`${title} menu has ${menu.items.length} items, expected ${expected}`);
        if (menu.left < 0 || menu.right > VIEWPORT.width) fail(`${title} menu off-screen: ${menu.left}..${menu.right}`);
        if (title === "Checklists" && (menu.items[0][1] !== "/main.php?a=formbuilder:display_form&form_id=125" || menu.items[1][1] !== "/main.php?a=formbuilder:display_form&form_id=112")) fail(`checklist links: ${JSON.stringify(menu.items)}`);
        if (title === "Work orders" && !menu.items.some(([t, h]) => t.includes("Fleet") && h === "/main.php?a=user:vehicle_maintenance_request")) fail(`work order links: ${JSON.stringify(menu.items)}`);
        if (title === "Work orders") await page.screenshot({ path: join(outDir, `${name}-menu-workorders.png`) });
      }
      await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height - 40);
      await page.waitForTimeout(100);
      if (await page.locator(".tsm-menu:not([hidden])").count()) fail(`${title} menu did not close on a tap outside`);
    }
  }

  console.log(`  before: width ${before.scrollWidth}px, ${before.days} days, ${before.handlers} pickup handlers`);
  console.log(`  after:  mode=${after.mode}, width ${after.scrollWidth}px, ${after.visibleDays} visible days, ${after.handlers} pickup handlers, blocked hosts: ${[...blocked].join(", ") || "none"}`);

  if (after.punchPage) {
    await checkPunchPage(page, file);
  } else if (after.overtimePage) {
    await checkOvertimePage(page, name, after);
  } else if (after.formPage) {
    await checkFormPage(page, name, after);
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

  // Unit headings that repeat the name in parentheses show it once.
  if (after.mode === "location") {
    // only the day on screen: hidden text reads as shown elsewhere
    const headings = await page.evaluate(() => [...document.querySelectorAll("table.month td.tsm-selected .tsm-unit div.location")].map((h) => ({ full: h.dataset.tsmFull || h.textContent.trim().replace(/\s+/g, " "), shown: h.innerText.trim().replace(/\s+/g, " ") })));
    const comm = (h) => /^comm/i.test(h.full);
    const repeated = headings.filter((h) => /^(.*?) \(\1\)$/.test(h.full) && !comm(h));
    const bad = repeated.filter((h) => h.shown !== h.full.replace(/ \(.*\)$/, ""));
    if (bad.length) fail(`unit headings still repeat the name: ${bad.slice(0, 3).map((h) => h.shown).join(", ")}`);
    const kept = headings.filter((h) => !/^(.*?) \(\1\)$/.test(h.full) && !comm(h) && h.shown !== h.full);
    if (kept.length) fail(`unit headings lost text: ${kept.slice(0, 3).map((h) => `${h.full} → ${h.shown}`).join(", ")}`);
    const dispatchHeads = headings.filter(comm).map((h) => h.shown);
    if (onNowSetup && JSON.stringify(dispatchHeads) !== JSON.stringify(["Supervisor", "Night"])) fail(`Dispatch headings read ${JSON.stringify(dispatchHeads)}, expected Supervisor and Night`);
    console.log(`  unit headings: ${repeated.length} of ${headings.length} repeated their name and show it once (e.g. ${repeated[0]?.shown || "none"}); Dispatch wording → ${dispatchHeads.join(", ")}`);
  }

  // Dispatch view: exactly the saved shifts that contain 06:00 are marked on
  // now, including last night's that run past midnight, which today notes.
  if (onNowSetup && after.mode === "location") {
    const marks = await page.evaluate(() => ({
      marked: document.querySelectorAll("tr.tsm-on-now").length,
      expected: document.querySelectorAll("tr[data-expect-on-now]").length,
      wrong: [...document.querySelectorAll("tr.tsm-on-now")].filter((tr) => !tr.dataset.expectOnNow).length,
      missed: [...document.querySelectorAll("tr[data-expect-on-now]")].filter((tr) => !tr.classList.contains("tsm-on-now")).length,
      note: document.querySelector(".tsm-on-now-note")?.textContent.trim() || "",
      noteShown: Boolean(document.querySelector(".tsm-on-now-note")?.offsetParent),
      badgeShown: [...document.querySelectorAll("tr.tsm-on-now")].some((tr) => tr.offsetParent !== null),
    }));
    if (marks.wrong || marks.missed) fail(`on-now marks: ${marks.marked} marked, ${marks.expected} expected, ${marks.wrong} wrong, ${marks.missed} missed`);
    if (onNowSetup.yesterday.length ? !marks.noteShown : marks.note) fail(`on-now note: ${JSON.stringify(marks.note)} with ${onNowSetup.yesterday.length} overnight shift(s)`);
    if (marks.marked && !marks.badgeShown) fail("on-now rows are all hidden");
    console.log(`  on now at 06:00: ${onNowSetup.today.length} shift(s) today (${onNowSetup.today.slice(0, 3).join(", ")}) + ${onNowSetup.yesterday.length} since yesterday (${onNowSetup.yesterday.slice(0, 3).join(", ")}); note: ${marks.note.slice(0, 60) || "none"}`);
    await page.screenshot({ path: join(outDir, `${name}-on-now.png`) });
    const unitOnNow = page.locator("table.month td.today .tsm-unit-on-now").first();
    if (await unitOnNow.count()) await unitOnNow.screenshot({ path: join(outDir, `${name}-on-now-row.png`) });
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  // The Today button lands today's row just under the fixed site header.
  if (after.mode === "agenda" && await page.locator(".tsm-fab").count()) {
    await page.locator(".tsm-fab").click();
    await page.waitForTimeout(900);
    const today = await page.evaluate(() => {
      const td = document.querySelector("table.month td.today");
      const header = document.getElementById("ts_menus_menu_div")?.closest("[style*='fixed'], header, div") || null;
      return { top: Math.round(td.getBoundingClientRect().top), scrollY: Math.round(scrollY), maxScroll: Math.round(document.documentElement.scrollHeight - innerHeight) };
    });
    // it may not get all the way there on a short month, in which case the page is at the bottom
    if (!(today.top >= 48 && today.top <= 72) && today.scrollY < today.maxScroll - 1) fail(`Today button put today's row at ${today.top}px (header ends at 48px)`);
    console.log(`  Today button: today's row at ${today.top}px`);
    await page.evaluate(() => window.scrollTo(0, 0));
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
    const more = document.querySelector(".tsm-viewpick-more");
    const toggle = document.querySelector(".tsm-viewpick-toggle");
    return { count: selects.length, labels, commonOpts, otherOpts, goVisible: Boolean(document.getElementById("submit_form")?.offsetParent),
      moreShown: Boolean(more?.offsetParent), toggleShown: Boolean(toggle?.offsetParent), toggleText: toggle?.textContent };
  });
  if (toolbar.count) {
    console.log(`  view pickers: ${toolbar.labels.join(" / ")}; common = ${toolbar.commonOpts.join(", ")}; other = ${toolbar.otherOpts.length} views behind "${toolbar.toggleText}"`);
    if (toolbar.count !== 2) fail(`expected 2 view pickers, got ${toolbar.count}`);
    if (toolbar.moreShown || !toolbar.toggleShown || toolbar.toggleText !== "See more view options") fail(`other views should be hidden behind the button: ${JSON.stringify(toolbar)}`);
    await page.locator(".tsm-viewpick-toggle").click();
    await page.waitForTimeout(100);
    const revealed = await page.evaluate(() => ({ more: Boolean(document.querySelector(".tsm-viewpick-more")?.offsetParent), toggle: Boolean(document.querySelector(".tsm-viewpick-toggle")?.offsetParent), label: document.querySelector(".tsm-viewpick-more .tsm-label")?.textContent, options: document.querySelectorAll(".tsm-viewpick-more option:not([hidden])").length }));
    if (!revealed.more || revealed.toggle || revealed.label !== "Other Schedule Views" || revealed.options !== toolbar.otherOpts.length) fail(`button did not reveal the other views as before: ${JSON.stringify(revealed)}`);
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

  // Schedule / More Options tabs: the admin sections hide behind the second
  // tab, the calendar is the default, and each tab fits the phone.
  if (before.hasMonth && after.active && !after.punchPage && !after.formPage) {
    const tabState = () => page.evaluate(() => {
      const vis = (el) => el.offsetParent !== null;
      const more = [...document.querySelectorAll(".tsm-more")];
      return {
        tab: document.documentElement.dataset.tsmTab,
        tabs: [...document.querySelectorAll(".tsm-tab")].map((b) => [b.textContent, b.getAttribute("aria-selected")]),
        moreCount: more.length, moreShown: more.filter(vis).length,
        linksShown: [...document.querySelectorAll("td.indent > a")].filter(vis).length,
        calendarShown: vis(document.querySelector("table.month")), toolbarShown: vis(document.querySelector(".tsm-viewpick")),
        mySchedHeader: [...document.querySelectorAll("td.std_header")].filter((h) => /my\s*schedule/i.test(h.textContent) && vis(h)).length,
        scrollWidth: document.documentElement.scrollWidth,
        subCount: document.querySelectorAll(".tsm-subpage").length,
        subShown: [...document.querySelectorAll(".tsm-subpage")].filter(vis).length,
        active: document.querySelector(".tsm-active td.std_header")?.textContent.trim() || "",
        activeTop: Math.round(document.querySelector(".tsm-active")?.getBoundingClientRect().top ?? -1),
        cards: document.querySelectorAll("table.tsm-cards > tbody > tr:not(.tsm-cards-head):not(.tsm-cards-caption):not(.tsm-cards-span)").length,
        uncaptioned: [...document.querySelectorAll("table.tsm-cards > tbody > tr:not(.tsm-cards-head):not(.tsm-cards-caption):not(.tsm-cards-span) > td:not([data-label]):not(.tsm-cards-action):not(.tsm-empty)")].length,
      };
    });
    let t = await tabState();
    if (landing.sub) {
      const l = landing;
      if (l.tab !== "more" || !l.active || l.subShown !== l.subCount || l.calendarShown) fail(`sub-page landing: ${JSON.stringify(l)}`);
      if (l.activeTop === null || l.activeTop < 48 || l.activeTop > 220) fail(`sub-page section is not at the top (top ${l.activeTop})`);
      if (l.tabsShown || !l.backShown || l.othersShown || !l.title) fail(`sub-page shows more than its form: ${JSON.stringify(l)}`);
      if (l.scrolled.y > 0 && (l.scrolled.barTop < 46 || l.scrolled.barTop > 50)) fail(`back bar did not stay under the header when scrolled (top ${l.scrolled.barTop} at y ${l.scrolled.y})`);
      const b = l.afterBack;
      if (b.view !== "closed" || b.tab !== "more" || b.y !== 0 || !b.tabsShown || b.barShown || b.subShown || b.links < 5) fail(`Back did not restore More Options: ${JSON.stringify(b)}`);
      if (l.scrollWidth > VIEWPORT.width) fail(`sub-page overflows on landing: ${l.scrollWidth}`);
      if (l.uncaptioned) fail(`${l.uncaptioned} card cells have no caption`);
      // parked on Schedule by now, which closed the form: the calendar shows
      if (t.tab !== "schedule" || t.subShown || t.moreShown || !t.calendarShown) fail(`Schedule tab on a sub-page: ${JSON.stringify(t)}`);
      // More Options is back to its plain list, with a link to reopen the form
      await page.locator(".tsm-tab", { hasText: "More Options" }).click();
      await page.waitForTimeout(150);
      t = await tabState();
      if (t.tab !== "more" || t.subShown || t.calendarShown || t.active) fail(`More Options after closing the form: ${JSON.stringify(t)}`);
      if (t.linksShown < 5) fail(`More Options after closing shows ${t.linksShown} quick links, expected at least 5`);
      if (t.scrollWidth > VIEWPORT.width) fail(`More Options overflows: ${t.scrollWidth}`);
      await page.screenshot({ path: join(outDir, `${name}-more-options-closed.png`), fullPage: true });
      await page.locator(".tsm-tab", { hasText: "Schedule" }).click();
      await page.waitForTimeout(150);
      console.log(`  sub-page: "${l.title}" alone under a back bar (${l.cards} cards; bar at ${l.scrolled.barTop}px when scrolled to ${l.scrolled.y}); Back restores More Options with ${l.afterBack.links} rows; a tab tap closes it too`);
    } else {
    if (t.tab !== "schedule" || JSON.stringify(t.tabs) !== JSON.stringify([["Schedule", "true"], ["More Options", "false"]])) fail(`tabs: ${JSON.stringify(t)}`);
    if (t.moreCount < 5 || t.moreShown) fail(`Schedule tab: ${t.moreShown} of ${t.moreCount} admin sections visible`);
    if (t.linksShown || !t.calendarShown || !t.toolbarShown || t.mySchedHeader) fail(`Schedule tab content: ${JSON.stringify(t)}`);
    await page.locator(".tsm-tab", { hasText: "More Options" }).click();
    await page.waitForTimeout(150);
    t = await tabState();
    if (t.tab !== "more" || t.moreShown !== t.moreCount || t.calendarShown || t.toolbarShown) fail(`More Options tab: ${JSON.stringify(t)}`);
    if (t.linksShown < 5) fail(`More Options shows ${t.linksShown} quick links, expected at least 5`);
    if (t.scrollWidth > VIEWPORT.width) fail(`More Options overflows: ${t.scrollWidth}`);
    const moreHeight = await page.evaluate(() => Math.round(document.body.getBoundingClientRect().bottom + scrollY));
    console.log(`  More Options content height: ${moreHeight}px`);
    await page.screenshot({ path: join(outDir, `${name}-more-options.png`), fullPage: true });
    await page.locator(".tsm-tab", { hasText: "Schedule" }).click();
    await page.waitForTimeout(150);
    t = await tabState();
    if (t.tab !== "schedule" || t.moreShown || !t.calendarShown) fail("switching back to Schedule failed");
    console.log(`  tabs: Schedule default; More Options holds ${t.moreCount} sections with ${before.hasMonth ? "quick links" : ""} and nothing else`);
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
