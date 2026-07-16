import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = resolve(root, "build");
const manifest = JSON.parse(await readFile(resolve(build, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Extension manifest must use Manifest V3");
for (const file of ["manifest.json", "popup.html", "popup.css", "background.js", "content.js", "popup.js"]) {
  await access(resolve(build, file));
}
if (manifest.background.service_worker !== "background.js" || manifest.content_scripts[0].js[0] !== "content.js") {
  throw new Error("Extension manifest references non-self-contained scripts");
}
console.log("Extension build manifest is valid and self-contained");
