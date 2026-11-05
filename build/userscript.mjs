// Bundles src/content.css and src/content.js into a single userscript for
// Safari (Userscripts app) and other userscript managers. The stylesheet is
// injected by the script itself, since a userscript has no manifest to do it.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "src", "manifest.json"), "utf8"));
const css = readFileSync(join(root, "src", "content.css"), "utf8");
const js = readFileSync(join(root, "src", "content.js"), "utf8");
const RAW = "https://gist.githubusercontent.com/julianeden/ded7365e07fe74e89676e93bc5901c66/raw/post-traumatic.user.js";

const header = `// ==UserScript==
// @name         ${manifest.name}
// @namespace    https://github.com/julianeden/post-traumatic
// @version      ${manifest.version}
// @description  ${manifest.description}
// @author       Julian Eden
// @match        *://*.traumasoft.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// @grant        none
// @updateURL    ${RAW}
// @downloadURL  ${RAW}
// @license      MIT
// ==/UserScript==
`;

// The stylesheet goes in a template literal; escape what would end it.
const cssLiteral = "`" + css.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";

const bundle = `${header}
// Firefox injects content.css for the add-on; here the script adds it to the
// page as early as possible, before the document has a <head>.
(() => {
  const css = ${cssLiteral};
  const style = document.createElement("style");
  style.id = "tsm-style";
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();

${js}`;

mkdirSync(join(root, "userscript"), { recursive: true });
const out = join(root, "userscript", "post-traumatic.user.js");
writeFileSync(out, bundle);
console.log(`wrote ${out} (${bundle.length} bytes, version ${manifest.version})`);
