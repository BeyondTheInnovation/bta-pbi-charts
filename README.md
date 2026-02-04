# BTA PBI Charts

Monorepo of Power BI custom visuals (pbiviz) plus a shared TypeScript package.

## Visuals

- **Bump Chart** (`@pbi-visuals/bump-chart`): category ranks over time
- **Donut Chart** (`@pbi-visuals/donut-chart`): donut/pie with center total + labels + small multiples
- **Heatmap** (`@pbi-visuals/heatmap`): matrix heatmap with optional value labels + small multiples
- **Calendar Heatmap** (`@pbi-visuals/calendar-heatmap`): GitHub-style daily contributions view
- **Packed Bubble** (`@pbi-visuals/packed-bubble`): sized bubbles with optional clustering
- **Streamgraph** (`@pbi-visuals/streamgraph`): stacked area layers with smoothing + opacity controls

Each visual ships with a distinct `assets/icon.png` (sourced from `assets/icon.svg`) so it’s recognizable in the visual picker.

To regenerate PNG icons on macOS: `scripts/generate-icons.sh`

## Development

### Install

- Install: `bun install`
- CI / reproducible: `bun install --frozen-lockfile`
  - This repo sets `linker = "hoisted"` in `bunfig.toml` for Node-based tooling compatibility (`pbiviz`/webpack).

### Build / package

- Build shared package: `bun run build:shared`
- Package everything: `bun run build:all`
- Package one visual:
  - `bun run package:bump-chart`
  - `bun run package:donut`
  - `bun run package:heatmap`
  - `bun run package:calendar`
  - `bun run package:bubble`
  - `bun run package:streamgraph`

Packaged `.pbiviz` files are emitted under each visual’s `dist/` folder.

Note: `pbiviz` is Node-based. This repo includes a small shim so `pbiviz` works reliably when dependencies are installed with Bun.

### Run (dev server)

- `bun run start:bump-chart`
- `bun run start:donut`
- `bun run start:heatmap`
- `bun run start:calendar`
- `bun run start:bubble`
- `bun run start:streamgraph`

## Empty state guidance

Each visual shows a setup screen when required fields aren’t bound, with role-specific guidance (e.g., what goes into X-Axis / Values / Group By).

## npm (fallback)

If you need npm for any reason:

- Install: `npm install`
- Build: `npm run build:all`
