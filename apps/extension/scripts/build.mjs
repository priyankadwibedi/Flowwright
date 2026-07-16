import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = resolve(root, "build");
const tsc = process.platform === "win32" ? "tsc.cmd" : "tsc";

await rm(build, { force: true, recursive: true });
await mkdir(build, { recursive: true });
await new Promise((resolvePromise, reject) => {
  const child = spawn(tsc, ["-p", resolve(root, "tsconfig.build.json")], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("error", reject);
  child.on("exit", (code) => (code === 0 ? resolvePromise() : reject(new Error(`tsc exited with ${code}`))));
});

await cp(resolve(root, "public/popup.css"), resolve(build, "popup.css"));
const popup = await readFile(resolve(root, "public/popup.html"), "utf8");
await writeFile(resolve(build, "popup.html"), popup, "utf8");
const manifest = {
  manifest_version: 3,
  name: "Flowwright Event Capture",
  version: "0.1.0",
  description: "Capture safe browser events for a Flowwright demonstration.",
  permissions: ["activeTab", "storage", "downloads"],
  action: { default_popup: "popup.html" },
  background: { service_worker: "background.js", type: "module" },
  content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"], run_at: "document_start" }],
  host_permissions: ["<all_urls>"],
};
await writeFile(resolve(build, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Built self-contained extension at ${build}`);
