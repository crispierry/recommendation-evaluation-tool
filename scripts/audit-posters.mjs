import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const posterRoot = path.join(root, "art", "posters");
const files = (await readdir(posterRoot))
  .filter((file) => /^title-\d{3}\.webp$/.test(file))
  .sort();

if (files.length !== 500) {
  throw new Error(`Expected 500 generated posters, found ${files.length}.`);
}

const exactDigests = new Set();
const perceptual = [];
let minimumEntropy = Number.POSITIVE_INFINITY;

for (const file of files) {
  const source = path.join(posterRoot, file);
  const bytes = await readFile(source);
  const metadata = await sharp(bytes).metadata();
  if (metadata.width !== 480 || metadata.height !== 720 || metadata.format !== "webp") {
    throw new Error(`${file} must be a 480×720 WebP.`);
  }

  const digest = createHash("sha256").update(bytes).digest("hex");
  if (exactDigests.has(digest)) throw new Error(`${file} duplicates another poster exactly.`);
  exactDigests.add(digest);

  const stats = await sharp(bytes).stats();
  minimumEntropy = Math.min(minimumEntropy, stats.entropy);
  if (stats.entropy < 3.5) {
    throw new Error(`${file} appears too visually simple (entropy ${stats.entropy.toFixed(2)}).`);
  }

  const pixels = await sharp(bytes)
    .resize(17, 16, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const bits = [];
  for (let row = 0; row < 16; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      const offset = row * 17 + column;
      bits.push(pixels[offset] > pixels[offset + 1] ? 1 : 0);
    }
  }
  perceptual.push({ file, bits });
}

let closest = { distance: Number.POSITIVE_INFINITY, left: "", right: "" };
for (let left = 0; left < perceptual.length; left += 1) {
  for (let right = left + 1; right < perceptual.length; right += 1) {
    let distance = 0;
    for (let bit = 0; bit < perceptual[left].bits.length; bit += 1) {
      if (perceptual[left].bits[bit] !== perceptual[right].bits[bit]) distance += 1;
    }
    if (distance < closest.distance) {
      closest = { distance, left: perceptual[left].file, right: perceptual[right].file };
    }
  }
}

if (closest.distance < 18) {
  throw new Error(
    `${closest.left} and ${closest.right} are too visually similar (perceptual distance ${closest.distance}).`,
  );
}

console.log(
  `Poster audit passed: ${files.length} unique 480×720 WebPs, minimum entropy ${minimumEntropy.toFixed(2)}, ` +
    `closest perceptual distance ${closest.distance} (${closest.left}, ${closest.right}).`,
);
