# Automated Marketing GIFs

This workflow generates deterministic marketing assets from `samples/taskflurry` using Playwright, Chromium, and `ffmpeg`.

## Prerequisites

Install the root dependencies once:

```bash
npm install
```

Install the Taskflurry sample dependencies once:

```bash
npm install --prefix samples/taskflurry
```

Install the browser and media toolchain once:

```bash
npx playwright install chromium
brew install ffmpeg
```

## Generate All Scenarios

```bash
npm run marketing:capture
```

The command will:

- build `samples/taskflurry`
- serve the built app on `http://127.0.0.1:4173`
- run the approved Playwright scenarios
- export `mp4`, `gif`, `png`, and `json` artifacts per scenario
- generate a review gallery at `artifacts/marketing-gifs/index.html`

## Rerun One Scenario

```bash
npm run marketing:capture -- --scenario=create-task
```

Available scenario slugs:

- `projects-to-tasks`
- `create-task`
- `update-task`
- `delete-task`
- `history-time-travel`

List them from the CLI:

```bash
npm run marketing:capture -- --list
```

## Output Layout

Generated assets live under `artifacts/marketing-gifs/`:

- `artifacts/marketing-gifs/index.html`
- `artifacts/marketing-gifs/run-summary.json`
- `artifacts/marketing-gifs/<scenario>/<scenario>.mp4`
- `artifacts/marketing-gifs/<scenario>/<scenario>.gif`
- `artifacts/marketing-gifs/<scenario>/<scenario>.png`
- `artifacts/marketing-gifs/<scenario>/<scenario>.json`

## Determinism Notes

The workflow keeps runs stable by:

- building a static Taskflurry bundle instead of capturing from hot reload
- using a fresh Playwright browser context per scenario
- freezing browser time to a fixed timestamp
- fixing viewport, locale, timezone, color scheme, and DPR
- driving stable `data-testid` selectors instead of text-only selectors

## Review

Open `artifacts/marketing-gifs/index.html` in a browser after a run to review the generated assets.
