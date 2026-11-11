// Opens a saved page in desktop Firefox with the add-on loaded, the way
// `npm run run:desktop` opens the live site: the fixtures folder is served
// on localhost, and the profile resolves fixtures.traumasoft.com to it, so
// the content script matches the page and nothing reaches the real site.
// The window opens at phone size; with --verbose the add-on's console lines
// print here too.
//   npm run run:fixture -- memoAlert.html            (TSM_FIXTURES picks the folder)
//   npm run run:fixture -- memoAlert.html --verbose --args=-headless
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = resolve(process.env.TSM_FIXTURES ?? join(root, "test", "fixtures"));
const [file, ...extra] = process.argv.slice(2);
if (!file || !existsSync(join(fixtures, file))) {
  console.error(`usage: npm run run:fixture -- <name>.html [web-ext options]\n(no ${file || "<name>.html"} in ${fixtures}; set TSM_FIXTURES to the folder of saved pages)`);
  process.exit(1);
}
const HOST = "fixtures.traumasoft.com";
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };

// the fixture at the site's path, the login page, and the saved files
// folders; everything else 404
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  let path = null;
  if (url.pathname === "/main.php") path = join(fixtures, url.searchParams.get("fixture") || file);
  else if (url.pathname === "/login.php") path = join(fixtures, "login");
  else if (/^\/[^/]+_files\//.test(url.pathname)) path = join(fixtures, decodeURIComponent(url.pathname.slice(1)));
  if (path && path.startsWith(fixtures) && existsSync(path)) {
    if (/\.php$/.test(url.pathname)) console.log(`served ${basename(path)} for ${req.url}`);
    res.writeHead(200, { "Content-Type": basename(path) === "login" ? "text/html" : TYPES[extname(path).toLowerCase()] || "application/octet-stream" });
    res.end(readFileSync(path));
  } else {
    console.log(`no fixture for ${req.url}`);
    res.writeHead(404);
    res.end();
  }
});
server.listen(0, "127.0.0.1", () => {
  const url = `http://${HOST}:${server.address().port}/main.php?a=user:schedule&fixture=${encodeURIComponent(file)}`;
  console.log(`serving ${fixtures} at ${url}`);
  const child = spawn(join(root, "node_modules", ".bin", "web-ext"), [
    "run", "--source-dir", "src", "--no-config-discovery",
    "--pref", `network.dns.localDomains=${HOST}`,
    "--pref", "general.useragent.override=Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0",
    "--pref", "devtools.console.stdout.content=true",
    "--start-url", url,
    "--args=-width", "--args=412", "--args=-height", "--args=915",
    ...extra,
  ], { cwd: root, stdio: "inherit" });
  child.on("exit", (code) => {
    server.close();
    process.exit(code ?? 0);
  });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
});
