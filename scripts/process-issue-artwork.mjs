import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [input, issueId] = process.argv.slice(2);

if (!input || !/^(identity-check|scene-check|metadata-check)$/.test(issueId || "")) {
  throw new Error("Usage: node scripts/process-issue-artwork.mjs <input.png> <issue-id>");
}

const destination = path.join(root, "web", "assets", "issue-types", `${issueId}.webp`);
await mkdir(path.dirname(destination), { recursive: true });
await sharp(path.resolve(input))
  .resize(480, 300, { fit: "cover", position: "attention" })
  .webp({ quality: 42, effort: 6 })
  .toFile(destination);

console.log(destination);
