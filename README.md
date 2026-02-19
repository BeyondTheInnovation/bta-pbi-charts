# BTA PBI Charts

Monorepo of Power BI custom visuals (pbiviz) plus a shared TypeScript package.

## Visuals

- **Bollinger Bands** (`@pbi-visuals/bollinger-bands`): time-series price line with SMA and upper/lower volatility bands.  
  D3 reference: [Bollinger Bands](https://observablehq.com/@d3/bollinger-bands)
- **Bump Chart** (`@pbi-visuals/bump-chart`): rank movements across categories over time.  
  D3 reference: [Slope Chart](https://observablehq.com/@d3/slope-chart)
- **Calendar Heatmap** (`@pbi-visuals/calendar-heatmap`): daily intensity grid across months and years.  
  D3 reference: [Calendar](https://observablehq.com/@d3/calendar)
- **Donut Chart** (`@pbi-visuals/donut-chart`): part-to-whole donut with center summary and labels.  
  D3 reference: [Donut Chart](https://observablehq.com/@d3/donut-chart)
- **Heatmap** (`@pbi-visuals/heatmap`): matrix-style color encoding for X/Y category intersections.  
  D3 reference: [Hexbin](https://observablehq.com/@d3/hexbin)
- **Inline Labels Line** (`@pbi-visuals/inline-labels-line`): multi-series line chart with direct inline labels.  
  D3 reference: [Inline Labels](https://observablehq.com/@d3/inline-labels)
- **Packed Bubble** (`@pbi-visuals/packed-bubble`): value-sized circles arranged in a packed layout.  
  D3 reference: [Zoomable Circle Packing](https://observablehq.com/@d3/zoomable-circle-packing)
- **Streamgraph** (`@pbi-visuals/streamgraph`): flowing stacked areas for composition changes over time.  
  D3 reference: [Streamgraph](https://observablehq.com/@d3/streamgraph)
- **World History Timeline** (`@pbi-visuals/world-history-timeline`): interval timeline for civilizations/events with start and end years.  
  D3 reference: [Marey's Trains](https://observablehq.com/@d3/mareys-trains)

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
  - `bun run package:bollinger`
  - `bun run package:bump-chart`
  - `bun run package:calendar`
  - `bun run package:donut`
  - `bun run package:heatmap`
  - `bun run package:inline-labels`
  - `bun run package:bubble`
  - `bun run package:streamgraph`
  - `bun run package:world-history`

Packaged `.pbiviz` files are emitted under each visual’s `dist/` folder.

Note: `pbiviz` is Node-based. This repo includes a small shim so `pbiviz` works reliably when dependencies are installed with Bun.

### Run (dev server)

- `bun run start:bollinger`
- `bun run start:bump-chart`
- `bun run start:calendar`
- `bun run start:donut`
- `bun run start:heatmap`
- `bun run start:inline-labels`
- `bun run start:bubble`
- `bun run start:streamgraph`
- `bun run start:world-history`

## Empty state guidance

Each visual shows a setup screen when required fields aren’t bound, with role-specific guidance (e.g., what goes into X-Axis / Values / Group By).

## PDF export

- Every visual now includes an in-canvas **Download PDF** button (top-right).
- The button exports a snapshot of the visible chart viewport as a single-page PDF.
- Export availability depends on Power BI privilege status for `ExportContent`:
  - If allowed, the button is enabled.
  - If denied/unsupported/admin-disabled, the button stays disabled with an explanatory tooltip.
- This is separate from report-level **Export to PDF** in Power BI Service/Desktop.
  - Native report export rendering for custom visuals still depends on certification/distribution requirements.

## npm (fallback)

If you need npm for any reason:

- Install: `npm install`
- Build: `npm run build:all`
