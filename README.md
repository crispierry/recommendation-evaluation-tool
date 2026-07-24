# Recommendation Evaluation Tool

A deterministic, privacy-safe demonstration of how product and editorial teams
can evaluate a short-form recommendation feed.

The project measures two different questions:

- **Day-over-day continuity:** whether a title in today's first 50 positions
  appeared anywhere in the prior day's first 50.
- **Exact-clip recurrence:** whether the same canonical clip appeared in an
  earlier run of a controlled repetition study.

Those are intentionally separate analytical grains. The first describes
catalog continuity; the second describes possible clip fatigue.

## Synthetic by construction

Everything in the repository is generated:

- 500 fictional titles
- 2,000 fictional canonical clips, with 3–5 clips per title
- fictional profiles and ordered recommendations
- fictional 30-title RFY rails for cross-surface comparison
- 500 title-specific fictional poster scenes in a hand-drawn navy-ink and watercolor editorial style
- fictional vertical screen captures
- a small fictional human-review queue

The application does not call external services, load third-party media, or
contain a production capture pipeline.

Each catalog title has its own generated raster illustration and a checked-in
scene brief in `config/poster-prompts.json`. The images contain no typography,
logos, recognizable actors, or references to existing entertainment
properties. `npm run audit:posters` verifies count, dimensions, exact
uniqueness, visual complexity, and perceptual separation before release.

## Published configuration

The frozen public run is defined in [`config/public-demo.json`](config/public-demo.json).
Change that file or pass another config to regenerate a different evaluation:

```bash
npm ci
npm run generate -- --config config/public-demo.json
npm run build
npm test
npm run audit:public
```

The main settings are catalog size, clips per title, seed, routine profile
strategies, days, clips per profile per day, RFY rail size and alignment bands,
repetition profile strategies, runs, and clips per run.

## Public surface

The built static application contains:

- Clip History
- Repetition Run
- Unique Clips
- Content Issues
- Analytics
- Findings Report
- Review Center

The Findings Report is a native web page inside the tool and is computed from
the same frozen data as the interactive views. Review Center decisions are
stored only in the visitor's browser and can be reset. They do not alter the
frozen report.

## Reproducibility

`npm run verify` regenerates the complete static bundle and checks counts,
referential integrity, deterministic analysis, offline behavior, and the
public-release boundary. The web report reads the same `analysis.json` used by
the interactive analytics view.
