import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "dist");
const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 8768;

const server = http.createServer(async (request, response) => {
  const requestPath = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
  const relative = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const target = path.resolve(publicRoot, relative);
  if (!target.startsWith(publicRoot)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a file");
    response.writeHead(200, { "content-type": contentType(target) });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Synthetic evaluation tool available at http://127.0.0.1:${port}`);
});

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}
