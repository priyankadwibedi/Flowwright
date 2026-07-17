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
  child.on("exit", (code) =>
    code === 0 ? resolvePromise() : reject(new Error(`tsc exited with ${code}`)),
  );
});

await cp(resolve(root, "public/popup.css"), resolve(build, "popup.css"));
const popup = await readFile(resolve(root, "public/popup.html"), "utf8");
await writeFile(resolve(build, "popup.html"), popup, "utf8");
const manifest = await readFile(resolve(root, "public/manifest.json"), "utf8");
await writeFile(resolve(build, "manifest.json"), manifest, "utf8");
console.log(`Built self-contained extension at ${build}`);
