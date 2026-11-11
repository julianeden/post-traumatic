// Unpacks a page saved as .mht (what Chrome on a phone offers, where
// "Web Page, complete" is not on the menu) into the shape the harness
// serves: <name>.html beside a <name>_files folder holding the page's
// stylesheets and images, with the page's links to them rewritten.
//   node test/mht.mjs "<saved>.mht" <fixtures-dir>/<name>.html
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The parts of an .mht read as latin1, which keeps every byte as one
// character so the ASCII boundary can be searched for and each part's
// bytes recovered unchanged; the page is the first text/html part.
export function readMht(path) {
  const raw = readFileSync(path).toString("latin1");
  const boundary = /boundary="([^"]+)"/.exec(raw.slice(0, 4000))?.[1];
  if (!boundary) throw new Error("no multipart boundary in the file head");
  const chunks = raw.split(`--${boundary}`);
  const parts = chunks.slice(1).filter((p) => !/^--/.test(p)).map((chunk, i) => {
    const text = chunk.replace(/^\r?\n/, "");
    const split = text.indexOf("\r\n\r\n");
    const head = text.slice(0, split);
    const body = text.slice(split + 4).replace(/\r?\n$/, "");
    const header = (name) => new RegExp(`^${name}:\\s*(.*)$`, "im").exec(head)?.[1].trim() || "";
    const encoding = header("Content-Transfer-Encoding").toLowerCase();
    let bytes;
    if (encoding === "base64") bytes = Buffer.from(body, "base64");
    else if (encoding === "quoted-printable") bytes = Buffer.from(body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
    else bytes = Buffer.from(body, "latin1");
    return { chunk: i + 1, type: header("Content-Type").split(";")[0].trim().toLowerCase(), location: header("Content-Location"), id: header("Content-ID").replace(/^<|>$/g, ""), encoding, bytes };
  });
  const page = parts.find((p) => p.type === "text/html");
  if (!page) throw new Error("no text/html part in the file");
  return { raw, boundary, chunks, parts, page };
}

const EXT = { "text/css": ".css", "image/png": ".png", "image/gif": ".gif", "image/jpeg": ".jpg", "image/svg+xml": ".svg", "text/javascript": ".js", "application/javascript": ".js", "font/woff": ".woff", "font/woff2": ".woff2", "image/x-icon": ".ico" };

// A file name for every resource part: the URL's own name with an
// extension for its type, identical copies sharing one name; the sheets
// Chrome lifted out of <style> elements are inline-N.css.
export function nameParts(mht) {
  const used = new Map();
  const files = [];
  let inline = 0;
  for (const part of mht.parts) {
    if (part === mht.page) continue;
    const cid = !part.location || /^cid:/i.test(part.location);
    const path = cid ? "" : new URL(part.location).pathname;
    const stem = cid ? `inline-${++inline}` : basename(path).replace(/\.[^.]*$/, "") || "file";
    const ext = EXT[part.type] || extname(path) || "";
    let file = stem + ext;
    for (let n = 2; used.has(file) && !used.get(file).equals(part.bytes); n += 1) file = `${stem}_${n}${ext}`;
    used.set(file, part.bytes);
    files.push({ part, file });
  }
  return files;
}

// A part's reference as the page writes it: its location, or cid:<id>
// for a lifted stylesheet; the form with & escaped for HTML as well.
export function refsOf(part) {
  const refs = [part.location, part.id && `cid:${part.id}`].filter(Boolean);
  return [...new Set(refs.flatMap((r) => [r, r.replace(/&/g, "&amp;")]))];
}

export function unpack(src, out) {
  const mht = readMht(src);
  const name = basename(out).replace(/\.html?$/i, "");
  const dir = join(dirname(out), `${name}_files`);
  mkdirSync(dir, { recursive: true });
  const files = nameParts(mht);
  let html = mht.page.bytes.toString("utf8");
  for (const { part, file } of files) {
    for (const ref of refsOf(part)) html = html.split(ref).join(`${name}_files/${file}`);
  }
  // Stylesheets sit in the folder themselves, so they refer to siblings by name.
  for (const { part, file } of files) {
    let bytes = part.bytes;
    if (part.type === "text/css") {
      let css = bytes.toString("utf8");
      for (const other of files) if (other.part.location && !/^cid:/i.test(other.part.location)) css = css.split(other.part.location).join(other.file);
      bytes = Buffer.from(css, "utf8");
    }
    writeFileSync(join(dir, file), bytes);
  }
  writeFileSync(out, html);
  return { name, files };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) {
    console.error('usage: node test/mht.mjs "<saved>.mht" <fixtures-dir>/<name>.html');
    process.exit(1);
  }
  const { name, files } = unpack(src, out);
  console.log(`${out}\n  ${files.length} files in ${name}_files/: ${[...new Set(files.map((f) => f.file))].join(", ")}`);
}
