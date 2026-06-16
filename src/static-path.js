import { posix, resolve } from "node:path";

export function resolveStaticFilePath(root, urlPath) {
  const decodedPath = decodeURIComponent(urlPath).replace(/\\/g, "/");
  const normalizedPath = posix.normalize(`/${decodedPath}`);
  const safePath = normalizedPath.replace(/^\/+/, "");

  return resolve(root, safePath || "index.html");
}
