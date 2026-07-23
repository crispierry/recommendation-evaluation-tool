import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const failures = [];
const textExtensions = new Set([".html", ".css", ".js", ".mjs", ".json", ".md", ".txt", ".py", ".xml", ".rels", ".yml", ".yaml"]);
const prohibitedTokens = [
  String.fromCharCode(87, 66, 68),
  String.fromCharCode(72, 66, 79),
  String.fromCharCode(77, 65, 88),
  String.fromCharCode(87, 97, 114, 110, 101, 114, 32, 66, 114, 111, 115),
];

const sourceFiles = (await collect(root)).filter((file) => {
  const relative = path.relative(root, file);
  return !relative.startsWith(".git/") && !relative.startsWith("node_modules/") && !relative.startsWith("dist/");
});
const distFiles = await collect(dist);

for (const file of [...sourceFiles, ...distFiles]) {
  const relative = path.relative(root, file);
  if (file.endsWith(".map")) failures.push(`Source map is not allowed: ${relative}`);
  const extension = path.extname(file).toLowerCase();
  if (!textExtensions.has(extension)) continue;
  const content = await readFile(file, "utf8");
  if (/\/Users\/|[A-Z]:\\Users\\/.test(content)) failures.push(`Absolute personal path: ${relative}`);
  if (relative.startsWith("dist/") && /https?:\/\//i.test(content)) failures.push(`External runtime URL: ${relative}`);
  for (const token of prohibitedTokens) {
    const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`);
    if (pattern.test(content)) failures.push(`Prohibited public token in ${relative}`);
  }
}

const manifest = JSON.parse(await readFile(path.join(dist, "artifact-manifest.json"), "utf8"));
const expected = {
  titles: 500,
  canonicalClips: 2000,
    routineAppearances: 750,
    repetitionAppearances: 180,
    rfyTitles: 90,
  reviewCases: 9,
};
for (const [key, value] of Object.entries(expected)) {
  if (manifest.counts[key] !== value) failures.push(`Manifest ${key} is ${manifest.counts[key]}, expected ${value}`);
}
for (const relative of manifest.generatedFiles) {
  try {
    const info = await stat(path.join(dist, relative));
    if (!info.isFile()) failures.push(`Manifest path is not a file: ${relative}`);
  } catch {
    failures.push(`Manifest file is missing: ${relative}`);
  }
}

const html = await readFile(path.join(dist, "index.html"), "utf8");
for (const removed of ["simulation", "how-it-works"]) {
  if (html.toLowerCase().includes(removed)) failures.push(`Removed public surface remains in index.html: ${removed}`);
}

if (failures.length) {
  console.error("Public-release audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Public-release audit passed across ${sourceFiles.length} source files and ${distFiles.length} built files.`);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(target));
    if (entry.isFile()) files.push(target);
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
