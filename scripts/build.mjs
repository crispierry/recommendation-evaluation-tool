import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, "web"), dist, { recursive: true });
await run(process.execPath, ["scripts/generate.mjs", "--output", "dist"]);
await run(process.env.REPORT_PYTHON || "python3", [
  "scripts/build_report.py",
  "--analysis",
  "dist/data/analysis.json",
  "--output",
  "dist/short-form-recommendation-evaluation-report.docx",
  "--chart-dir",
  "dist/report-charts",
]);
console.log(`Built static public artifact at ${dist}`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}
