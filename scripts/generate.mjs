import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const configPath = path.resolve(root, args.config || "config/public-demo.json");
const outputRoot = path.resolve(root, args.output || "dist");
const config = JSON.parse(await readFile(configPath, "utf8"));

validateConfig(config);

const rng = createRng(config.seed);
const catalog = buildCatalog(config, rng);
const clipById = new Map(catalog.clips.map((clip) => [clip.id, clip]));
const titleById = new Map(catalog.titles.map((title) => [title.id, title]));
const routine = buildRoutineRuns(config, catalog, rng);
const repetition = buildRepetitionRuns(config, catalog, rng);
const reviewCases = buildReviewCases(config, routine, repetition, clipById, titleById);
const analysis = buildAnalysis(config, catalog, routine, repetition, reviewCases);

await mkdir(path.join(outputRoot, "data"), { recursive: true });
await mkdir(path.join(outputRoot, "assets", "posters"), { recursive: true });
await mkdir(path.join(outputRoot, "assets", "screens"), { recursive: true });

await writeJson(path.join(outputRoot, "data", "config.json"), {
  ...config,
  synthetic: true,
  label: "Frozen synthetic public run",
});
await writeJson(path.join(outputRoot, "data", "catalog.json"), catalog);
await writeJson(path.join(outputRoot, "data", "routine-runs.json"), routine);
await writeJson(path.join(outputRoot, "data", "repetition-runs.json"), repetition);
await writeJson(path.join(outputRoot, "data", "review-cases.json"), reviewCases);
await writeJson(path.join(outputRoot, "data", "analysis.json"), analysis);

const usedClipIds = new Set([
  ...routine.appearances.map((item) => item.clipId),
  ...repetition.appearances.map((item) => item.clipId),
]);

await renderInBatches(
  catalog.titles,
  20,
  async (title) => {
    await renderPoster(title, path.join(outputRoot, title.posterPath));
  },
);
await renderInBatches(
  [...usedClipIds].map((clipId) => clipById.get(clipId)),
  16,
  async (clip) => {
    await renderScreen(
      clip,
      titleById.get(clip.titleId),
      path.join(outputRoot, clip.screenPath),
    );
  },
);

const manifest = {
  schemaVersion: "synthetic-public-artifact-manifest/v1",
  synthetic: true,
  configDigest: digestJson(config),
  dataDigest: digestJson({ catalog, routine, repetition, reviewCases, analysis }),
  counts: {
    titles: catalog.titles.length,
    canonicalClips: catalog.clips.length,
    routineAppearances: routine.appearances.length,
    repetitionAppearances: repetition.appearances.length,
    renderedPosters: catalog.titles.length,
    renderedScreens: usedClipIds.size,
    reviewCases: reviewCases.cases.length,
  },
  generatedFiles: [
    "data/config.json",
    "data/catalog.json",
    "data/routine-runs.json",
    "data/repetition-runs.json",
    "data/review-cases.json",
    "data/analysis.json",
  ],
};
await writeJson(path.join(outputRoot, "artifact-manifest.json"), manifest);

console.log(
  `Generated ${manifest.counts.titles} fictional titles, ${manifest.counts.canonicalClips} canonical clips, ` +
    `${manifest.counts.routineAppearances} routine appearances, and ${manifest.counts.repetitionAppearances} repetition appearances.`,
);

function buildCatalog(settings, random) {
  const firstWords = [
    "Amber", "Arcadian", "Autumn", "Blue", "Bright", "Cedar", "Coastal", "Copper",
    "Crimson", "Distant", "Electric", "Fallow", "First", "Glass", "Golden", "Hidden",
    "Indigo", "Ivory", "Juniper", "Last", "Lunar", "Midnight", "Northern", "Quiet", "Silver",
  ];
  const secondWords = [
    "Atlas", "Beacon", "Circuit", "Current", "Drift", "Echo", "Field", "Harbor", "Horizon", "Lantern",
    "Meadow", "Meridian", "Mosaic", "Orchard", "Orbit", "Paradox", "Passage", "Signal", "Tide", "Voyage",
  ];
  const genres = ["Adventure", "Comedy", "Documentary", "Drama", "Food", "Mystery", "Nature", "Science", "Travel"];
  const titles = [];
  const clips = [];
  let clipOrdinal = 0;

  for (let index = 0; index < settings.catalog.titleCount; index += 1) {
    const first = firstWords[index % firstWords.length];
    const second = secondWords[Math.floor(index / firstWords.length) % secondWords.length];
    const id = `title-${String(index + 1).padStart(3, "0")}`;
    const title = `${first} ${second}`;
    const clipCount = [3, 5, 4][index % 3];
    const palette = paletteFor(index);
    const record = {
      id,
      title,
      synthetic: true,
      genre: genres[(index * 7) % genres.length],
      format: index % 4 === 0 ? "Film" : "Series",
      year: 2012 + ((index * 11) % 15),
      clipCount,
      posterPath: `assets/posters/${id}.webp`,
      palette,
    };
    titles.push(record);
    for (let clipIndex = 0; clipIndex < clipCount; clipIndex += 1) {
      clipOrdinal += 1;
      clips.push({
        id: `clip-${String(clipOrdinal).padStart(4, "0")}`,
        titleId: id,
        clipNumber: clipIndex + 1,
        sceneLabel: `Scene ${String(clipIndex + 1).padStart(2, "0")}`,
        screenPath: `assets/screens/clip-${String(clipOrdinal).padStart(4, "0")}.webp`,
        synthetic: true,
      });
    }
  }

  shuffle(titles, random);
  titles.sort((a, b) => a.id.localeCompare(b.id));
  return {
    schemaVersion: "synthetic-canonical-title-index/v1",
    synthetic: true,
    titleCount: titles.length,
    canonicalClipCount: clips.length,
    titles,
    clips,
  };
}

function buildRoutineRuns(settings, catalogData, random) {
  const appearances = [];
  const clipsByTitle = groupBy(catalogData.clips, (clip) => clip.titleId);
  const allTitleIds = catalogData.titles.map((title) => title.id);
  const days = Array.from({ length: settings.routine.days }, (_, index) => ({
    id: `synthetic-day-${index + 1}`,
    label: `Synthetic Day ${index + 1}`,
    ordinal: index + 1,
  }));

  for (const [profileIndex, profile] of settings.routine.profiles.entries()) {
    let previousTitleIds = [];
    let previousClipByTitle = new Map();
    const poolOffset = profileIndex * 113;
    const preferencePool = Array.from({ length: allTitleIds.length }, (_, index) => {
      return allTitleIds[(index * 37 + poolOffset) % allTitleIds.length];
    });

    for (const day of days) {
      const count = settings.routine.clipsPerProfilePerDay;
      const overlapCount = day.ordinal === 1 ? 0 : Math.round(count * profile.priorDayTitleOverlap);
      const retained = sample(previousTitleIds, overlapCount, random);
      const retainedSet = new Set(retained);
      const candidates = preferencePool.filter((id) => !retainedSet.has(id) && !previousTitleIds.includes(id));
      const nextTitles = [...retained, ...sample(candidates, count - retained.length, random)];
      shuffle(nextTitles, random);
      const nextClipByTitle = new Map();

      nextTitles.forEach((titleId, positionIndex) => {
        const titleClips = clipsByTitle.get(titleId);
        const priorClip = previousClipByTitle.get(titleId);
        let clip;
        if (priorClip && random() < profile.exactClipCarryover) {
          clip = priorClip;
        } else {
          const alternatives = priorClip
            ? titleClips.filter((candidate) => candidate.id !== priorClip.id)
            : titleClips;
          clip = choose(alternatives, random);
        }
        nextClipByTitle.set(titleId, clip);
        appearances.push({
          id: `routine-${profile.id}-d${day.ordinal}-p${positionIndex + 1}`,
          synthetic: true,
          profileId: profile.id,
          profileLabel: profile.label,
          strategy: profile.strategy,
          dayId: day.id,
          dayLabel: day.label,
          dayOrdinal: day.ordinal,
          position: positionIndex + 1,
          titleId,
          clipId: clip.id,
        });
      });
      previousTitleIds = nextTitles;
      previousClipByTitle = nextClipByTitle;
    }
  }

  return {
    schemaVersion: "synthetic-routine-runs/v1",
    synthetic: true,
    days,
    profiles: settings.routine.profiles,
    appearances,
  };
}

function buildRepetitionRuns(settings, catalogData, random) {
  const appearances = [];
  const allClips = [...catalogData.clips];
  for (const [profileIndex, profile] of settings.repetition.profiles.entries()) {
    const orderedPool = Array.from({ length: allClips.length }, (_, index) => {
      return allClips[(index * 43 + profileIndex * 311) % allClips.length];
    });
    const seen = [];
    for (let run = 1; run <= settings.repetition.runs; run += 1) {
      const count = settings.repetition.clipsPerRun;
      const repeatCount = run === 1 ? 0 : Math.round(count * profile.progressiveExactClipRecurrence);
      const repeated = sample(seen, Math.min(repeatCount, seen.length), random);
      const repeatedIds = new Set(repeated.map((clip) => clip.id));
      const unseen = orderedPool.filter(
        (clip) => !seen.some((item) => item.id === clip.id) && !repeatedIds.has(clip.id),
      );
      const selected = [...repeated, ...sample(unseen, count - repeated.length, random)];
      shuffle(selected, random);
      selected.forEach((clip, positionIndex) => {
        appearances.push({
          id: `repeat-${profile.id}-r${run}-p${positionIndex + 1}`,
          synthetic: true,
          profileId: profile.id,
          profileLabel: profile.label,
          strategy: profile.strategy,
          run,
          runLabel: `Run ${run}`,
          position: positionIndex + 1,
          titleId: clip.titleId,
          clipId: clip.id,
          repeatedBefore: seen.some((item) => item.id === clip.id),
        });
      });
      for (const clip of selected) {
        if (!seen.some((item) => item.id === clip.id)) seen.push(clip);
      }
    }
  }
  return {
    schemaVersion: "synthetic-repetition-runs/v1",
    synthetic: true,
    profiles: settings.repetition.profiles,
    runs: settings.repetition.runs,
    appearances,
  };
}

function buildReviewCases(settings, routineData, repetitionData, clipMap, titleMap) {
  const source = [...routineData.appearances.slice(7, 13), ...repetitionData.appearances.slice(22, 25)];
  const issueTypes = [
    ["identity-check", "Confirm title identity", "The generated title treatment is partially obscured."],
    ["scene-check", "Compare possible duplicate scenes", "Two synthetic frames share composition but represent different clip IDs."],
    ["metadata-check", "Complete missing metadata", "A non-critical synthetic metadata field is intentionally blank."],
  ];
  const cases = source.slice(0, settings.reviewCaseCount).map((appearance, index) => {
    const clip = clipMap.get(appearance.clipId);
    const title = titleMap.get(appearance.titleId);
    const [type, label, prompt] = issueTypes[index % issueTypes.length];
    return {
      id: `review-${String(index + 1).padStart(2, "0")}`,
      synthetic: true,
      type,
      label,
      prompt,
      appearanceId: appearance.id,
      titleId: title.id,
      title: title.title,
      clipId: clip.id,
      screenPath: clip.screenPath,
      suggestedDecision: type === "metadata-check" ? "complete" : "confirm",
    };
  });
  return {
    schemaVersion: "synthetic-review-cases/v1",
    synthetic: true,
    persistence: "browser-local-only",
    frozenReportUnaffected: true,
    cases,
  };
}

function buildAnalysis(settings, catalogData, routineData, repetitionData, reviewData) {
  const routineProfiles = settings.routine.profiles.map((profile) => {
    const daily = [];
    for (let day = 2; day <= settings.routine.days; day += 1) {
      const current = routineData.appearances.filter(
        (item) => item.profileId === profile.id && item.dayOrdinal === day,
      );
      const priorTitles = new Set(
        routineData.appearances
          .filter((item) => item.profileId === profile.id && item.dayOrdinal === day - 1)
          .map((item) => item.titleId),
      );
      const overlap = current.filter((item) => priorTitles.has(item.titleId)).length;
      daily.push({
        comparison: `Day ${day - 1} → Day ${day}`,
        dayOrdinal: day,
        overlap,
        denominator: current.length,
        rate: round(overlap / current.length),
      });
    }
    return {
      profileId: profile.id,
      profileLabel: profile.label,
      strategy: profile.strategy,
      daily,
      meanRate: round(mean(daily.map((item) => item.rate))),
      latestRate: daily.at(-1).rate,
    };
  });

  const repetitionProfiles = settings.repetition.profiles.map((profile) => {
    const progressive = [];
    const seen = new Set();
    for (let run = 1; run <= settings.repetition.runs; run += 1) {
      const current = repetitionData.appearances.filter(
        (item) => item.profileId === profile.id && item.run === run,
      );
      const repeated = current.filter((item) => seen.has(item.clipId)).length;
      progressive.push({
        run,
        repeated,
        fresh: current.length - repeated,
        denominator: current.length,
        rate: run === 1 ? 0 : round(repeated / current.length),
      });
      current.forEach((item) => seen.add(item.clipId));
    }
    return {
      profileId: profile.id,
      profileLabel: profile.label,
      strategy: profile.strategy,
      progressive,
      latestRate: progressive.at(-1).rate,
      cumulativeUniqueClips: seen.size,
    };
  });

  const allAppearances = [...routineData.appearances, ...repetitionData.appearances];
  const exposedTitles = new Set(allAppearances.map((item) => item.titleId));
  const exposedClips = new Set(allAppearances.map((item) => item.clipId));
  return {
    schemaVersion: "synthetic-recommendation-analysis/v1",
    synthetic: true,
    question:
      "How much catalog continuity and exact-clip recurrence does a controlled synthetic short-form evaluation surface reveal?",
    generatedFrom: "Deterministic synthetic public run",
    configDigest: digestJson(settings),
    definitions: {
      routineOverlap:
        "For each current appearance, whether its title appears anywhere in the same profile's prior synthetic day's first 50 positions.",
      repetitionRecurrence:
        "For each appearance after Run 1, whether the same canonical clip ID appeared in any earlier run for that repetition profile.",
    },
    counts: {
      catalogTitles: catalogData.titles.length,
      catalogClips: catalogData.clips.length,
      routineAppearances: routineData.appearances.length,
      repetitionAppearances: repetitionData.appearances.length,
      totalAppearances: allAppearances.length,
      exposedTitles: exposedTitles.size,
      exposedClips: exposedClips.size,
      reviewCases: reviewData.cases.length,
    },
    routineProfiles,
    repetitionProfiles,
    headline: {
      routineSpreadPoints: round(
        (Math.max(...routineProfiles.map((item) => item.meanRate)) -
          Math.min(...routineProfiles.map((item) => item.meanRate))) *
          100,
        1,
      ),
      repetitionSpreadPoints: round(
        (Math.max(...repetitionProfiles.map((item) => item.latestRate)) -
          Math.min(...repetitionProfiles.map((item) => item.latestRate))) *
          100,
        1,
      ),
      titleCoverageRate: round(exposedTitles.size / catalogData.titles.length),
      clipCoverageRate: round(exposedClips.size / catalogData.clips.length),
    },
    limitations: [
      "The data is generated from configured behavior bands and does not describe real viewers or a production ranking system.",
      "Five synthetic days and three controlled runs illustrate an evaluation method; they do not establish population-level performance.",
      "Observed delivery patterns do not reveal ranking intent, model features, or causal drivers.",
      "Routine title overlap and repetition exact-clip recurrence use different grains and must not be combined.",
    ],
  };
}

async function renderPoster(title, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const [background, accent, ink] = title.palette;
  const escaped = escapeXml(title.title);
  const [line1, line2] = splitTitle(title.title);
  const svg = `
    <svg width="480" height="720" viewBox="0 0 480 720" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="720" fill="${background}"/>
      <circle cx="${80 + (hashNumber(title.id) % 250)}" cy="${150 + (hashNumber(title.title) % 260)}" r="165" fill="${accent}" opacity="0.72"/>
      <path d="M-40 560 C120 420 280 760 540 500 L540 760 L-40 760 Z" fill="${ink}" opacity="0.92"/>
      <path d="M40 120 L420 620" stroke="${ink}" stroke-width="10" opacity="0.18"/>
      <text x="42" y="64" fill="${ink}" font-family="Arial, sans-serif" font-size="15" letter-spacing="4">FICTIONAL TITLE</text>
      <text x="42" y="520" fill="#fcfaf4" font-family="Georgia, serif" font-size="48">${escapeXml(line1)}</text>
      <text x="42" y="576" fill="#fcfaf4" font-family="Georgia, serif" font-size="48">${escapeXml(line2)}</text>
      <text x="42" y="668" fill="#fcfaf4" font-family="Arial, sans-serif" font-size="16" letter-spacing="2">${escapeXml(title.genre.toUpperCase())} · SYNTHETIC</text>
      <title>${escaped}</title>
    </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 78, effort: 4 }).toFile(destination);
}

async function renderScreen(clip, title, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const [background, accent, ink] = title.palette;
  const number = clip.clipNumber;
  const svg = `
    <svg width="540" height="960" viewBox="0 0 540 960" xmlns="http://www.w3.org/2000/svg">
      <rect width="540" height="960" fill="${ink}"/>
      <rect x="16" y="16" width="508" height="928" rx="34" fill="${background}"/>
      <path d="M16 ${620 - number * 22} C150 ${450 + number * 26} 350 ${740 - number * 18} 524 ${390 + number * 34} L524 944 L16 944 Z" fill="${accent}" opacity="0.88"/>
      <circle cx="${110 + number * 82}" cy="${210 + number * 64}" r="${86 + number * 9}" fill="${ink}" opacity="0.2"/>
      <rect x="36" y="42" width="126" height="30" rx="15" fill="${ink}" opacity="0.78"/>
      <text x="55" y="63" fill="#fcfaf4" font-family="Arial, sans-serif" font-size="14" letter-spacing="2">EVALUATION TOOL</text>
      <text x="38" y="742" fill="${ink}" font-family="Georgia, serif" font-size="46">${escapeXml(splitTitle(title.title)[0])}</text>
      <text x="38" y="794" fill="${ink}" font-family="Georgia, serif" font-size="46">${escapeXml(splitTitle(title.title)[1])}</text>
      <text x="40" y="836" fill="${ink}" font-family="Arial, sans-serif" font-size="18">${escapeXml(clip.sceneLabel)} · ${escapeXml(title.genre)}</text>
      <text x="40" y="886" fill="${ink}" font-family="Arial, sans-serif" font-size="15" letter-spacing="2">SYNTHETIC CAPTURE</text>
      <circle cx="470" cy="742" r="24" fill="${ink}" opacity="0.8"/>
      <circle cx="470" cy="812" r="24" fill="${ink}" opacity="0.8"/>
      <rect x="205" y="914" width="130" height="5" rx="3" fill="${ink}" opacity="0.62"/>
    </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 78, effort: 4 }).toFile(destination);
}

function paletteFor(index) {
  const palettes = [
    ["#e7dcc8", "#c36f4e", "#24333a"],
    ["#dce8e4", "#3f7f74", "#152b2d"],
    ["#ede2c5", "#d3a44a", "#313025"],
    ["#deddeb", "#69629a", "#222238"],
    ["#ead9d6", "#ad5962", "#352328"],
    ["#d9e2eb", "#4f779d", "#172838"],
    ["#e6e0d6", "#7d8b5f", "#263029"],
    ["#e8d8c6", "#b7783b", "#30271e"],
  ];
  return palettes[index % palettes.length];
}

async function renderInBatches(items, batchSize, render) {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(render));
  }
}

function validateConfig(settings) {
  if (settings.catalog.titleCount !== 500) throw new Error("Public catalog must contain exactly 500 titles.");
  if (settings.catalog.clipsPerTitle.min !== 3 || settings.catalog.clipsPerTitle.max !== 5) {
    throw new Error("Public catalog clips-per-title range must be 3–5.");
  }
  if (settings.routine.profiles.length !== 3 || settings.routine.days !== 5 || settings.routine.clipsPerProfilePerDay !== 50) {
    throw new Error("Routine public run must be 3 profiles × 5 days × 50 clips.");
  }
  if (settings.repetition.profiles.length !== 3 || settings.repetition.runs !== 3 || settings.repetition.clipsPerRun !== 20) {
    throw new Error("Repetition public run must be 3 profiles × 3 runs × 20 clips.");
  }
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--config") parsed.config = values[++index];
    if (values[index] === "--output") parsed.output = values[++index];
  }
  return parsed;
}

function createRng(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(items, count, random) {
  const copy = [...items];
  shuffle(copy, random);
  return copy.slice(0, count);
}

function choose(items, random) {
  return items[Math.floor(random() * items.length)];
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function groupBy(items, keyFor) {
  const result = new Map();
  for (const item of items) {
    const key = keyFor(item);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(item);
  }
  return result;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, precision = 4) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashNumber(value) {
  return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16);
}

function splitTitle(value) {
  const words = value.split(" ");
  return [words[0] || "", words.slice(1).join(" ") || ""];
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function writeJson(destination, value) {
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
