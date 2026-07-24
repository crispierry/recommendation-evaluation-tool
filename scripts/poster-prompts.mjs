import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.resolve(root, process.argv[2] || "dist/data/catalog.json");
const outputPath = path.resolve(root, process.argv[3] || "poster-prompts.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

const firstMotifs = {
  Amber: "glowing amber light, translucent resin, and late-afternoon warmth",
  Arcadian: "a pastoral hidden valley, old stone paths, and cultivated gardens",
  Autumn: "windblown copper leaves, a turning season, and long evening shadows",
  Blue: "deep blue weather, cool water, and a single warm counterpoint",
  Bright: "hard morning light breaking through darkness and reflective surfaces",
  Cedar: "towering cedar trees, carved wood, and fragrant forest atmosphere",
  Coastal: "a rugged shoreline, salt spray, tide pools, and distant headlands",
  Copper: "weathered copper machinery, green patina, and warm metallic highlights",
  Crimson: "a dramatic crimson fabric or natural phenomenon cutting through the scene",
  Distant: "immense depth, a remote destination, and figures separated by scale",
  Electric: "charged air, branching light, improvised instruments, and kinetic motion",
  Fallow: "an abandoned field or dormant place slowly returning to life",
  First: "the tense instant of a discovery, opening, launch, or unprecedented crossing",
  Glass: "fragile transparent architecture, reflections, refractions, and visible cracks",
  Golden: "low golden light, treasured objects, and luminous dust in the air",
  Hidden: "a concealed entrance, partially obscured evidence, and layered discovery",
  Indigo: "indigo night, ink-dark shadows, and small pools of cool illumination",
  Ivory: "pale carved forms, chalk cliffs, bone-white stone, and soft diffuse light",
  Juniper: "twisted juniper trees, blue berries, mountain air, and resilient growth",
  Last: "a final departure, dwindling resources, and a poignant sense of consequence",
  Lunar: "moonlit terrain, tidal pull, silver shadows, and an uncanny sky",
  Midnight: "a precise midnight event, deep darkness, and isolated practical lights",
  Northern: "aurora, snowbound distance, cold wind, and a resilient expedition",
  Quiet: "suspended stillness, intimate gestures, and a scene where tiny details matter",
  Silver: "silver rain, polished tools, cool highlights, and a mercurial atmosphere",
};

const secondMotifs = {
  Atlas: "a cartographer reading a living map above a vast river-cut landscape",
  Beacon: "a keeper discovering an impossible second signal beyond a lonely tower",
  Circuit: "an inventor tracing a handmade network through a crowded mechanical world",
  Current: "people or creatures navigating a powerful visible flow through land, sea, or air",
  Drift: "travelers and objects carried off course through a changing environment",
  Echo: "a call returning with an unexpected answer from deep inside the setting",
  Field: "a wide field containing a strange pattern that only makes sense from one viewpoint",
  Harbor: "a working harbor at a moment of arrival, warning, reunion, or escape",
  Horizon: "a difficult journey toward a horizon transformed by an approaching event",
  Lantern: "a hand-held lantern revealing an unseen world just beyond ordinary sight",
  Meadow: "a meadow alive with small stories, tracks, weather, and a concealed threshold",
  Meridian: "an expedition crossing an invisible boundary marked by instruments and landscape",
  Mosaic: "many fragments being assembled to reveal a larger human or natural story",
  Orchard: "an orchard whose harvest, caretakers, and hidden history drive the action",
  Orbit: "two bodies, people, or communities caught in a consequential repeating path",
  Paradox: "two incompatible realities occupying the same scene with believable physical detail",
  Passage: "a narrow route through architecture or wilderness at a decisive crossing",
  Signal: "a coded signal being sent, received, misunderstood, or answered",
  Tide: "a rapidly changing tide exposing something that cannot remain hidden",
  Voyage: "a small crew beginning or surviving a journey through a richly observed world",
};

const genreDirections = {
  Adventure: "Stage a decisive, physically active adventure with a resourceful traveler and clear peril.",
  Comedy: "Stage an observant ensemble comedy with expressive body language, visual timing, and a gently absurd complication.",
  Documentary: "Stage a credible observational documentary moment with specific tools, environment, and human or ecological detail.",
  Drama: "Stage an emotionally legible human drama built around one consequential gesture between characters.",
  Food: "Stage a tactile culinary story with cooks, ingredients, steam, utensils, and a meaningful act of preparation or sharing.",
  Mystery: "Stage a layered mystery with one discoverable clue, controlled suspense, and an environment that rewards close inspection.",
  Nature: "Stage a behavior-rich wildlife or landscape story grounded in plausible ecology and changing weather.",
  Science: "Stage a vivid scientific investigation with field instruments, an observable phenomenon, and a moment of insight.",
  Travel: "Stage an immersive travel narrative with local texture, movement through place, and a strong sense of arrival.",
};

const prompts = catalog.titles.map((title) => {
  const [first, second] = title.title.split(" ");
  const prompt = [
    "Use case: illustration-story",
    "Asset type: portrait fictional film or television poster artwork for a synthetic recommendation-evaluation website",
    `Primary request: Create a richly composed, entirely original narrative scene for the fictional ${title.genre.toLowerCase()} ${title.format.toLowerCase()} “${title.title}.”`,
    `Story direction: ${genreDirections[title.genre]} Center the visual premise on ${secondMotifs[second]}. Infuse the scene with ${firstMotifs[first]}.`,
    "Style/medium: hand-drawn executive field-notes illustration on clean warm #FCFAF4 paper; expressive deep navy ink outlines; fine crosshatching; restrained translucent watercolor washes; subtle paper texture; polished editorial warmth. The result should feel authored by an illustrator, not generated from a geometric poster template.",
    "Composition/framing: vertical 2:3 poster; cinematic depth with foreground, middle ground, and distant atmosphere; one strong readable silhouette or focal action at thumbnail size; richly observed setting; full-bleed scene with no border.",
    `Color palette: warm off-white paper and navy ink, with a title-specific restrained watercolor palette led by ${title.palette[1]} and supporting muted teal, rust, gold, or blue where narratively appropriate.`,
    "Constraints: artwork only; no title treatment, typography, letters, numbers, logos, trademarks, watermarks, UI, existing characters, recognizable actors, or references to real films, series, studios, networks, employers, or brands. Depict fictional people without celebrity likenesses.",
    "Avoid: abstract geometric poster templates, flat vector art, gradients, photorealism, generic stock imagery, repeated compositions, large empty circles, and decorative shapes that do not belong to the scene.",
  ].join("\n");
  return {
    id: title.id,
    title: title.title,
    genre: title.genre,
    format: title.format,
    destination: `assets/posters/${title.id}.webp`,
    prompt,
  };
});

await writeFile(outputPath, `${JSON.stringify({ schemaVersion: "synthetic-poster-prompts/v1", prompts }, null, 2)}\n`);
console.log(`Wrote ${prompts.length} unique poster prompts to ${outputPath}`);
