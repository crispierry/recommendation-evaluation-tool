# Short-Form Recommendation Evaluation Lab

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
- fictional poster art and vertical screen captures
- a small fictional human-review queue

The application does not call external services, load third-party media, or
contain a production capture pipeline.

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
strategies, days, clips per profile per day, repetition profile strategies,
runs, and clips per run.

## Public surface

The built static application contains:

- Clip History
- Repetition Run
- Unique Clips
- Content Issues
- Analytics
- Review Center

Review Center decisions are stored only in the visitor's browser and can be
reset. They do not alter the frozen report.

## Reproducibility

`npm run verify` regenerates the complete static bundle and checks counts,
referential integrity, deterministic analysis, offline behavior, and the
public-release boundary. The report generator reads the same `analysis.json`
used by the website.
