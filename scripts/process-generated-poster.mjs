import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [input, titleId] = process.argv.slice(2);

if (!input || !/^title-\d{3}$/.test(titleId || "")) {
  throw new Error("Usage: node scripts/process-generated-poster.mjs <input.png> <title-000>");
}

const destinationRoot = path.join(root, "art", "posters");
const destination = path.join(destinationRoot, `${titleId}.webp`);
await mkdir(destinationRoot, { recursive: true });
await sharp(path.resolve(input))
  .resize(480, 720, { fit: "cover", position: "attention" })
  .webp({ quality: 76, effort: 5 })
  .toFile(destination);

console.log(destination);
