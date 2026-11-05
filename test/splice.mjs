// Builds clean sub-page fixtures (shift substitution, shift trade, time off,
// pickup shifts) when those pages were saved with the add-on running: the
// page's own fragments, which the add-on never touches, are spliced into a
// copy of the clean Schedule save at the positions the tainted saves show.
//   node test/splice.mjs <saved-pages-dir> <out-dir>
import { chromium } from "/Users/julianeden/Software/post-traumatic/node_modules/playwright-core/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const [src, out] = [process.argv[2], process.argv[3]];
const clean = readFileSync(`${src}/Schedule.html`, "utf8");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("about:blank");
for (const name of ["shiftSubstitution", "shiftTrade", "timeOff", "pickupShifts"]) {
  const dirty = readFileSync(`${src}/${name}.html`, "utf8");
  const result = await page.evaluate(([clean, dirty]) => {
    const parse = (t) => new DOMParser().parseFromString(t, "text/html");
    const cdoc = parse(clean), ddoc = parse(dirty);
    const cellOf = (doc) => doc.getElementById("view_select").closest("tr").closest("table").parentElement;
    const ccell = cellOf(cdoc), dcell = cellOf(ddoc);
    const dtoolbar = ddoc.getElementById("view_select").closest("tr").closest("table");
    const sig = (e) => {
      const h = e.querySelector?.("td.std_header")?.textContent.trim().replace(/\s+/g, " ");
      return `${e.tagName}|${e.id || ""}|${h || ""}`;
    };
    const strip = (root) => {
      for (const el of [root, ...root.querySelectorAll("*")]) {
        if (el.classList) for (const c of [...el.classList]) if (c.startsWith("tsm-")) el.classList.remove(c);
        if (el.getAttribute && el.getAttribute("class") === "") el.removeAttribute("class");
        for (const a of [...(el.getAttributeNames?.() || [])]) if (a.startsWith("data-tsm")) el.removeAttribute(a);
      }
    };
    const log = [];
    let cursor = ccell.firstElementChild;
    for (const d of [...dcell.children]) {
      if (d === dtoolbar) { const ct = cdoc.getElementById("view_select").closest("tr").closest("table"); cursor = ct.nextElementSibling; continue; }
      let m = null;
      const generic = !d.id && !d.querySelector?.("td.std_header");
      if (generic) { if (cursor && sig(cursor) === sig(d)) m = cursor; }
      else for (let c = cursor; c; c = c.nextElementSibling) if (sig(c) === sig(d)) { m = c; break; }
      if (m) {
        if (d.tagName === "TABLE" && m.innerHTML !== d.innerHTML) { const t = d.cloneNode(true); strip(t); m.innerHTML = t.innerHTML; log.push(`updated ${sig(d)}`); }
        cursor = m.nextElementSibling;
      } else {
        const clone = cdoc.importNode(d, true); strip(clone);
        ccell.insertBefore(clone, cursor);
        log.push(`inserted ${sig(d)} (${clone.outerHTML.length} chars)`);
      }
    }
    const doctype = clean.match(/^\s*<!DOCTYPE[^>]*>/i)?.[0] || "<!DOCTYPE html>";
    return { html: doctype + "\n" + cdoc.documentElement.outerHTML, log, tsmLeft: cdoc.querySelectorAll('[class*="tsm-"],[data-tsm],[id^="tsm-"]').length };
  }, [clean, dirty]);
  writeFileSync(`${out}/${name}.html`, result.html);
  console.log(`${name}: ${result.log.join("; ")} | tsm leftovers: ${result.tsmLeft}`);
}
await browser.close();
