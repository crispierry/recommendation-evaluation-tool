import assert from "node:assert/strict";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

test("dashboard works at desktop and mobile widths without network dependencies", async () => {
  const server = http.createServer(async (request, response) => {
    const requestPath = new URL(request.url, "http://127.0.0.1").pathname;
    const relative = requestPath === "/" ? "index.html" : requestPath.slice(1);
    const target = path.resolve(dist, relative);
    if (!target.startsWith(dist)) {
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
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Clip History" }).waitFor();
      assert.equal(await page.locator("#historyRail .poster-card").count(), 50);
      const firstCard = page.locator("#historyRail .poster-card").first();
      const posterSource = await firstCard.locator("img").getAttribute("src");
      await firstCard.click();
      assert.equal(await page.locator("#detailContent img").getAttribute("src"), posterSource);
      assert.equal(await page.locator("#detailContent .eyebrow").innerText(), "FICTIONAL TITLE ARTWORK");
      await page.locator("#detailDialog .dialog-close").click();
      await page.getByLabel("Capture", { exact: true }).check();
      const firstCaptureCard = page.locator("#historyRail .poster-card").first();
      const captureSource = await firstCaptureCard.locator("img").getAttribute("src");
      await firstCaptureCard.click();
      assert.equal(await page.locator("#detailContent img").getAttribute("src"), captureSource);
      assert.equal(await page.locator("#detailContent .eyebrow").innerText(), "SYNTHETIC CANONICAL CLIP");
      await page.locator("#detailDialog .dialog-close").click();
      await page.getByLabel("Poster", { exact: true }).check();
      for (const tab of ["Repetition Run", "Unique Clips", "Content Issues", "Analytics", "Review Center"]) {
        await page.getByRole("button", { name: tab, exact: true }).click();
        await page.getByRole("heading", { name: tab, exact: true }).waitFor();
      }
      await page.getByRole("button", { name: "Findings Report", exact: true }).click();
      await page.getByRole("heading", { name: "What the synthetic feed evaluation found", exact: true }).waitFor();
      assert.equal(await page.locator("#findingsRepeatTables table").count(), 3);
      assert.equal(await page.locator("#findingsContinuityTables table").count(), 3);
      assert.equal(await page.locator("#findingsRfyChart .report-bar-row").count(), 3);
      assert.match(await page.locator("#findingsExecutiveSummary").innerText(), /RFY explains only part/);
      await page.getByRole("button", { name: "Review Center", exact: true }).click();
      assert.equal(await page.locator("#reviewList .review-card").count(), 9);
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, JSON.stringify({ viewport, dimensions }));
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}
