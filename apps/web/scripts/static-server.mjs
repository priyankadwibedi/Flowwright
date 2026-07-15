import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../out",
);
const port = Number(process.env.PORT ?? 3000);
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function safePath(urlPath) {
  const withoutBase =
    basePath && urlPath.startsWith(basePath)
      ? urlPath.slice(basePath.length) || "/"
      : urlPath;
  const decoded = decodeURIComponent(withoutBase.split("?")[0]);
  const candidate = path.resolve(root, `.${decoded}`);
  return candidate.startsWith(root) ? candidate : null;
}

async function resolveFile(urlPath) {
  const candidate = safePath(urlPath);
  if (!candidate) return null;
  const options = [candidate];
  if (candidate.endsWith(path.sep))
    options.push(path.join(candidate, "index.html"));
  else options.push(`${candidate}.html`, path.join(candidate, "index.html"));
  for (const option of options) {
    try {
      const info = await stat(option);
      if (info.isFile()) return option;
    } catch {
      // Try the next static-export convention.
    }
  }
  return null;
}

createServer(async (request, response) => {
  try {
    const file = await resolveFile(request.url ?? "/");
    if (!file) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type":
        contentTypes[path.extname(file)] ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  }
}).listen(port, () => {
  console.log(`Static Flowwright export running at http://localhost:${port}`);
});
