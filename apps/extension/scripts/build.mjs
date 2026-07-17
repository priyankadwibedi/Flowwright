import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = resolve(root, "build");

await rm(build, { force: true, recursive: true });
await mkdir(build, { recursive: true });

const common = {
  bundle: true,
  logLevel: "info",
  platform: "browser",
  sourcemap: false,
  target: "es2022",
  treeShaking: true,
};

await Promise.all([
  esbuild.build({
    ...common,
    entryPoints: [resolve(root, "src/content.ts")],
    outfile: resolve(build, "content.js"),
    format: "iife",
  }),
  esbuild.build({
    ...common,
    entryPoints: [resolve(root, "src/background.ts")],
    outfile: resolve(build, "background.js"),
    format: "esm",
  }),
  esbuild.build({
    ...common,
    entryPoints: [resolve(root, "src/popup.ts")],
    outfile: resolve(build, "popup.js"),
    format: "esm",
  }),
]);

await cp(resolve(root, "public/popup.css"), resolve(build, "popup.css"));
const popup = await readFile(resolve(root, "public/popup.html"), "utf8");
await writeFile(resolve(build, "popup.html"), popup, "utf8");
const manifest = await readFile(resolve(root, "public/manifest.json"), "utf8");
await writeFile(resolve(build, "manifest.json"), manifest, "utf8");
console.log(`Built self-contained extension at ${build}`);
