import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve } from "node:path";

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const root = resolve(process.cwd());
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png"
};

const server = createServer((request, response) => {
  const requestedPath = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname);
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(join(root, safePath === "/" ? "index.html" : safePath));
  const relativePath = relative(root, filePath);

  if (relativePath.startsWith("..") || relativePath === ".." || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  if (statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath)
    .on("error", () => {
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      response.end("Server error");
    })
    .pipe(response);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Payment Tracker is already running at http://${host}:${port}`);
    console.error("Use the browser window that is already open, or close the other black window and try again.");
    process.exit(1);
  }

  console.error("Payment Tracker could not start.");
  console.error(error.message);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Master Lee Payment Tracker is running at http://${host}:${port}`);
});
