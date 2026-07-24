import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [, , inputPath, clipId] = process.argv;
if (!inputPath || !/^clip-\d{4}$/.test(clipId || "")) {
  throw new Error("Usage: node scripts/process-review-evidence.mjs <input.png> <clip-0000>");
}
if (!fs.existsSync(inputPath)) {
  throw new Error(`Input image not found: ${inputPath}`);
}

const outputDirectory = path.resolve("web/assets/review-evidence");
const outputPath = path.join(outputDirectory, `${clipId}.webp`);
fs.mkdirSync(outputDirectory, { recursive: true });

await sharp(inputPath)
  .resize(200, 356, { fit: "cover", position: "attention" })
  .webp({ quality: 24, effort: 6, smartSubsample: true })
  .toFile(outputPath);

console.log(outputPath);
