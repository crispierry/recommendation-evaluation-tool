import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const readJson = async (relative) => JSON.parse(await readFile(path.join(dist, relative), "utf8"));

test("public run has the exact requested shape", async () => {
  const [catalog, routine, repetition, rfy, review, analysis] = await Promise.all([
    readJson("data/catalog.json"),
    readJson("data/routine-runs.json"),
    readJson("data/repetition-runs.json"),
    readJson("data/rfy-runs.json"),
    readJson("data/review-cases.json"),
    readJson("data/analysis.json"),
  ]);

  assert.equal(catalog.synthetic, true);
  assert.equal(catalog.titles.length, 500);
  assert.equal(catalog.clips.length, 2000);
  assert.equal(new Set(catalog.titles.map((item) => item.title)).size, 500);
  assert.equal(new Set(catalog.clips.map((item) => item.id)).size, 2000);
  assert.deepEqual(
    Object.values(Object.groupBy(catalog.titles, (item) => item.clipCount)).map((items) => items.length).sort((a, b) => a - b),
    [166, 167, 167],
  );

  assert.equal(routine.profiles.length, 3);
  assert.equal(routine.days.length, 5);
  assert.equal(routine.appearances.length, 750);
  assert.equal(repetition.profiles.length, 3);
  assert.equal(repetition.runs, 3);
  assert.equal(repetition.appearances.length, 180);
  assert.equal(rfy.profiles.length, 3);
  assert.equal(rfy.titlesPerProfile, 30);
  assert.equal(rfy.shortsWindow, 30);
  assert.equal(rfy.rails.length, 90);
  assert.equal(review.cases.length, 9);
  assert.equal(analysis.counts.totalAppearances, 930);

  const routineProfiles = new Set(routine.profiles.map((item) => item.id));
  const repetitionProfiles = new Set(repetition.profiles.map((item) => item.id));
  assert.equal([...routineProfiles].some((id) => repetitionProfiles.has(id)), false);
});

test("every appearance resolves to a fictional title and canonical clip", async () => {
  const [catalog, routine, repetition] = await Promise.all([
    readJson("data/catalog.json"),
    readJson("data/routine-runs.json"),
    readJson("data/repetition-runs.json"),
  ]);
  const titleIds = new Set(catalog.titles.map((item) => item.id));
  const clipById = new Map(catalog.clips.map((item) => [item.id, item]));
  for (const item of [...routine.appearances, ...repetition.appearances]) {
    assert.ok(titleIds.has(item.titleId), item.id);
    assert.ok(clipById.has(item.clipId), item.id);
    assert.equal(clipById.get(item.clipId).titleId, item.titleId, item.id);
  }
});

test("computed profile behavior matches the configured bands", async () => {
  const analysis = await readJson("data/analysis.json");
  const routineRates = analysis.routineProfiles.map((item) => item.meanRate);
  assert.ok(routineRates[0] >= 0.2 && routineRates[0] <= 0.3);
  assert.ok(routineRates[1] >= 0.35 && routineRates[1] <= 0.45);
  assert.ok(routineRates[2] >= 0.5 && routineRates[2] <= 0.6);
  const repeatRates = analysis.repetitionProfiles.map((item) => item.latestRate);
  assert.deepEqual(repeatRates, [0.15, 0.35, 0.55]);
  assert.deepEqual(analysis.rfyProfiles.map((item) => item.rate), [0.2, 0.3333, 0.4667]);
  assert.equal(analysis.repetitionProfiles.every((item) => item.topRecurringClips.length === 5), true);
  assert.equal(
    analysis.routineProfiles.every(
      (item) => item.anchorComparisons.length === 4 && item.nearestPersistentTitles.length > 0,
    ),
    true,
  );
});

test("generation is deterministic for data and representative raster assets", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "recommendation-eval-"));
  try {
    await run(process.execPath, ["scripts/generate.mjs", "--output", temp]);
    for (const relative of [
      "data/catalog.json",
      "data/routine-runs.json",
      "data/repetition-runs.json",
      "data/rfy-runs.json",
      "data/review-cases.json",
      "data/analysis.json",
      "assets/posters/title-001.webp",
    ]) {
      assert.equal(await digest(path.join(dist, relative)), await digest(path.join(temp, relative)), relative);
    }
    const screens = await readdir(path.join(temp, "assets", "screens"));
    assert.ok(screens.length > 0);
    assert.equal(
      await digest(path.join(dist, "assets", "screens", screens[0])),
      await digest(path.join(temp, "assets", "screens", screens[0])),
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

async function digest(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
