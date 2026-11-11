// Writes a fixture the way the add-on leaves it, to look at without the
// add-on installed: <name>-restyled.html beside the fixture (its files
// folder serves both), <name>-preview.html showing the saved page and the
// restyled one side by side at phone size, and, given the .mht the fixture
// was unpacked from, <name>-restyled.mht next to that file, which Chrome on
// the phone opens. The script's work is baked into the markup, so the
// pages carry the stylesheet but no script.
//   node test/preview.mjs <fixtures-dir>/<name>.html ["<saved>.mht"]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { nameParts, readMht, refsOf } from "./mht.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [fixture, mhtPath] = process.argv.slice(2);
if (!fixture) {
  console.error('usage: node test/preview.mjs <fixtures-dir>/<name>.html ["<saved>.mht"]');
  process.exit(1);
}
const dir = dirname(resolve(fixture));
const file = basename(fixture);
const name = file.replace(/\.html?$/i, "");
const ORIGIN = "https://traumasoft.invalid";
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
// the page at the site's path, its files folder from disk, nothing else
await context.route(() => true, (route) => {
  const url = new URL(route.request().url());
  let path = null;
  if (url.origin === ORIGIN && url.pathname === "/main.php") path = join(dir, file);
  else if (url.origin === ORIGIN && /^\/[^/]+_files\//.test(url.pathname)) path = join(dir, decodeURIComponent(url.pathname.slice(1)));
  if (path && path.startsWith(dir) && existsSync(path)) {
    return route.fulfill({ status: 200, contentType: TYPES[extname(path).toLowerCase()] || "application/octet-stream", body: readFileSync(path) });
  }
  return route.abort();
});
const page = await context.newPage();
page.on("dialog", (d) => d.dismiss());
await page.goto(`${ORIGIN}/main.php?a=user:schedule&fixture=${encodeURIComponent(file)}`, { waitUntil: "load", timeout: 60_000 });
await page.addStyleTag({ path: join(root, "src", "content.css") });
await page.addScriptTag({ path: join(root, "src", "content.js") });
await page.waitForTimeout(1500);
const result = await page.evaluate(() => {
  for (const s of document.scripts) if (!s.src && s.textContent.includes("[Post-Traumatic]")) s.remove();
  return { page: document.documentElement.dataset.tsmPage || document.documentElement.dataset.tsmMode || "none", ready: document.documentElement.dataset.tsmReady === "1", html: document.documentElement.outerHTML };
});
await browser.close();
if (!result.ready) {
  console.error(`the add-on did not restyle ${file}`);
  process.exit(1);
}

const saved = readFileSync(join(dir, file), "utf8");
const doctype = saved.match(/^\s*<!DOCTYPE[^>]*>/i)?.[0] || "<!DOCTYPE html>";
const restyled = `${doctype}\n${result.html}`;
writeFileSync(join(dir, `${name}-restyled.html`), restyled);

const frame = (title, src) => `<figure><figcaption>${title}</figcaption><iframe src="${src}" title="${title}"></iframe></figure>`;
writeFileSync(join(dir, `${name}-preview.html`), `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${name}: before and after</title>
<style>
  body { margin: 0; padding: 24px; background: #e5e7eb; font: 14px system-ui, sans-serif; color: #374151; display: flex; flex-wrap: wrap; gap: 32px; justify-content: center; }
  figure { margin: 0; }
  figcaption { margin: 0 0 8px; text-align: center; font-weight: 600; }
  iframe { display: block; width: 412px; height: 915px; border: 0; border-radius: 24px; background: #fff; box-shadow: 0 0 0 8px #111827, 0 12px 40px rgba(0, 0, 0, 0.35); }
</style></head><body>
${frame("Saved page", file)}
${frame("With Post-Traumatic", `${name}-restyled.html`)}
</body></html>
`);
const outputs = [`${name}-restyled.html`, `${name}-preview.html`].map((f) => join(dir, f));

// The .mht again with the restyled page in place of the saved one: the
// page's links go back to the resource parts' own addresses, and every
// other part stays as Chrome wrote it.
if (mhtPath) {
  const mht = readMht(mhtPath);
  let html = restyled;
  for (const { part, file: f } of nameParts(mht)) {
    const [ref] = refsOf(part).filter((r) => /&amp;/.test(r) || !/&/.test(r));
    html = html.split(`${name}_files/${f}`).join(ref);
  }
  const chunk = mht.chunks[mht.page.chunk];
  const split = chunk.indexOf("\r\n\r\n");
  if (mht.page.encoding !== "binary") throw new Error(`the page part is ${mht.page.encoding}-encoded; only binary pages are rewritten`);
  mht.chunks[mht.page.chunk] = `${chunk.slice(0, split + 4)}${Buffer.from(html, "utf8").toString("latin1")}\r\n`;
  const out = join(dirname(resolve(mhtPath)), `${name}-restyled.mht`);
  writeFileSync(out, Buffer.from(mht.chunks.join(`--${mht.boundary}`), "latin1"));
  outputs.push(out);
}
console.log(`${file} restyled as the ${result.page} page:\n  ${outputs.join("\n  ")}`);
