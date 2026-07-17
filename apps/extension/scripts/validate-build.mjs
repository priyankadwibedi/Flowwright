import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = resolve(root, "build");
const manifest = JSON.parse(await readFile(resolve(build, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Extension manifest must use Manifest V3");
for (const file of [
  "manifest.json",
  "popup.html",
  "popup.css",
  "background.js",
  "content.js",
  "popup.js",
  "sensitive.js",
]) {
  await access(resolve(build, file));
}
if (manifest.background.service_worker !== "background.js") {
  throw new Error("Extension manifest references non-self-contained scripts");
}
if (manifest.content_scripts) {
  throw new Error("Permanent content_scripts should be replaced by activeTab + scripting");
}
if (!manifest.permissions.includes("scripting") || !manifest.permissions.includes("activeTab")) {
  throw new Error("Extension must use activeTab and scripting");
}
if (JSON.stringify(manifest).includes("<all_urls>")) {
  throw new Error("Permanent <all_urls> access is not allowed");
}
if (!manifest.optional_host_permissions) {
  throw new Error("optional_host_permissions required for explicit host grants");
}

await new Promise((resolvePromise, reject) => {
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", resolve(root, "src/sensitive.test.ts")],
    { stdio: "inherit" },
  );
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0 ? resolvePromise() : reject(new Error(`sensitive tests failed: ${code}`)),
  );
});

console.log("Extension build manifest is valid and self-contained");
