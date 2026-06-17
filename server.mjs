import { execFile } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStaticFilePath } from "./src/static-path.js";

const preferredPort = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const root = dirname(fileURLToPath(import.meta.url));
const maxPortAttempts = 20;
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
  const requestedPath = new URL(request.url, `http://localhost:${preferredPort}`).pathname;
  const filePath = resolveStaticFilePath(root, requestedPath);
  const relativePath = relative(root, filePath);

  if (relativePath.startsWith("..") || relativePath === ".." || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(notFoundMessage(requestedPath, filePath));
    return;
  }

  if (statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(notFoundMessage(requestedPath, filePath));
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
    const nextPort = currentPort + 1;
    if (nextPort < preferredPort + maxPortAttempts) {
      console.log(`Port ${currentPort} is already busy. Trying http://${host}:${nextPort} instead...`);
      listen(nextPort);
      return;
    }

    console.error("Payment Tracker could not find an open port.");
    console.error("Close old Payment Tracker windows or end old node.exe processes in Task Manager, then try again.");
    process.exit(1);
  }

  console.error("Payment Tracker could not start.");
  console.error(error.message);
  process.exit(1);
});

let currentPort = preferredPort;
listen(currentPort);

function listen(port) {
  currentPort = port;
  server.removeListener("listening", onListening);
  server.once("listening", onListening);
  server.listen(currentPort, host);
}

function onListening() {
  const url = `http://${host}:${currentPort}`;
  console.log(`Master Lee Payment Tracker is running at ${url}`);
  console.log(`Serving files from ${root}`);
  openBrowser(url);
}

function notFoundMessage(requestedPath, filePath) {
  return [
    "Not found",
    "",
    `Requested path: ${requestedPath}`,
    `Serving folder: ${root}`,
    `Tried file: ${filePath}`,
    "",
    "If this is the Payment Tracker home page, close every old black Payment Tracker window and run start-windows.bat again from the newly extracted folder."
  ].join("\n");
}

function openBrowser(url) {
  if (process.env.NO_OPEN_BROWSER) {
    return;
  }

  const platform = process.platform;
  const command = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];

  execFile(command, args, { windowsHide: true }, () => {});
}
