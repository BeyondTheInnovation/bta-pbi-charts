# BTA PBI Charts

A monorepo of Power BI custom visuals (`pbiviz`) with a shared TypeScript package and reusable rendering utilities.

## Visual Gallery

All screenshots are stored in `docs/screenshots/`.

<table>
  <tr>
    <td><strong>Bollinger Bands</strong><br/><code>@pbi-visuals/bollinger-bands</code><br/><img src="docs/screenshots/bollinger-bands.png" alt="Bollinger Bands"/></td>
    <td><strong>Box Plot</strong><br/><code>@pbi-visuals/box-plot</code><br/><img src="docs/screenshots/box-plot.png" alt="Box Plot"/></td>
    <td><strong>Bump Chart</strong><br/><code>@pbi-visuals/bump-chart</code><br/><img src="docs/screenshots/bump-chart.png" alt="Bump Chart"/></td>
  </tr>
  <tr>
    <td><strong>Calendar Heatmap</strong><br/><code>@pbi-visuals/calendar-heatmap</code><br/><img src="docs/screenshots/calendar-heatmap.png" alt="Calendar Heatmap"/></td>
    <td><strong>Candlestick Chart</strong><br/><code>@pbi-visuals/candlestick-chart</code><br/><img src="docs/screenshots/candlestick-chart.png" alt="Candlestick Chart"/></td>
    <td><strong>Chord Diagram</strong><br/><code>@pbi-visuals/chord-diagram</code><br/><img src="docs/screenshots/chord-diagram.png" alt="Chord Diagram"/></td>
  </tr>
  <tr>
    <td><strong>Choropleth Map</strong><br/><code>@pbi-visuals/choropleth-map</code><br/><img src="docs/screenshots/choropleth-map.png" alt="Choropleth Map"/></td>
    <td><strong>Donut Chart</strong><br/><code>@pbi-visuals/donut-chart</code><br/><img src="docs/screenshots/donut-chart.png" alt="Donut Chart"/></td>
    <td><strong>Heatmap</strong><br/><code>@pbi-visuals/heatmap</code><br/><img src="docs/screenshots/heatmap.png" alt="Heatmap"/></td>
  </tr>
  <tr>
    <td><strong>Histogram</strong><br/><code>@pbi-visuals/histogram</code><br/><img src="docs/screenshots/histogram.png" alt="Histogram"/></td>
    <td><strong>Inline Labels Line</strong><br/><code>@pbi-visuals/inline-labels-line</code><br/><img src="docs/screenshots/inline-labels-line.png" alt="Inline Labels Line"/></td>
    <td><strong>Parallel Coordinates</strong><br/><code>@pbi-visuals/parallel-coordinates</code><br/><img src="docs/screenshots/parallel-coordinates.png" alt="Parallel Coordinates"/></td>
  </tr>
  <tr>
    <td><strong>Packed Bubble</strong><br/><code>@pbi-visuals/packed-bubble</code><br/><img src="docs/screenshots/packed-bubble.png" alt="Packed Bubble"/></td>
    <td><strong>Sankey Diagram</strong><br/><code>@pbi-visuals/sankey-diagram</code><br/><img src="docs/screenshots/sankey-diagram.png" alt="Sankey Diagram"/></td>
    <td><strong>Scatterplot Matrix</strong><br/><code>@pbi-visuals/scatterplot-matrix</code><br/><img src="docs/screenshots/scatterplot-matrix.png" alt="Scatterplot Matrix"/></td>
  </tr>
  <tr>
    <td><strong>Streamgraph</strong><br/><code>@pbi-visuals/streamgraph</code><br/><img src="docs/screenshots/streamgraph.png" alt="Streamgraph"/></td>
    <td><strong>Waterfall Chart</strong><br/><code>@pbi-visuals/waterfall-chart</code><br/><img src="docs/screenshots/waterfall-chart.png" alt="Waterfall Chart"/></td>
    <td><strong>World History Timeline</strong><br/><code>@pbi-visuals/world-history-timeline</code><br/><img src="docs/screenshots/world-history-timeline.png" alt="World History Timeline"/></td>
  </tr>
  <tr>
    <td><strong>Zoomable Icicle</strong><br/><code>@pbi-visuals/zoomable-icicle</code><br/><img src="docs/screenshots/zoomable-icicle.png" alt="Zoomable Icicle"/></td>
    <td><strong>Zoomable Sunburst</strong><br/><code>@pbi-visuals/zoomable-sunburst</code><br/><img src="docs/screenshots/zoomable-sunburst.png" alt="Zoomable Sunburst"/></td>
    <td><strong>Zoomable Treemap</strong><br/><code>@pbi-visuals/zoomable-treemap</code><br/><img src="docs/screenshots/zoomable-treemap.png" alt="Zoomable Treemap"/></td>
  </tr>
</table>

Each visual ships with a dedicated `assets/icon.png` (generated from `assets/icon.svg`) for a clear picker experience in Power BI.

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
  - `bun run package:box-plot`
  - `bun run package:bump-chart`
  - `bun run package:calendar`
  - `bun run package:candlestick`
  - `bun run package:chord`
  - `bun run package:choropleth`
  - `bun run package:donut`
  - `bun run package:heatmap`
  - `bun run package:histogram`
  - `bun run package:icicle`
  - `bun run package:inline-labels`
  - `bun run package:parallel`
  - `bun run package:bubble`
  - `bun run package:sankey`
  - `bun run package:scatterplot-matrix`
  - `bun run package:streamgraph`
  - `bun run package:sunburst`
  - `bun run package:treemap`
  - `bun run package:waterfall`
  - `bun run package:world-history`

Packaged `.pbiviz` files are emitted under each visual's `dist/` folder.

Note: `pbiviz` is Node-based. This repo includes a small shim so `pbiviz` works reliably when dependencies are installed with Bun.

### Run (dev server)

- `bun run start:bollinger`
- `bun run start:box-plot`
- `bun run start:bump-chart`
- `bun run start:calendar`
- `bun run start:candlestick`
- `bun run start:chord`
- `bun run start:choropleth`
- `bun run start:donut`
- `bun run start:heatmap`
- `bun run start:histogram`
- `bun run start:icicle`
- `bun run start:inline-labels`
- `bun run start:parallel`
- `bun run start:bubble`
- `bun run start:sankey`
- `bun run start:scatterplot-matrix`
- `bun run start:streamgraph`
- `bun run start:sunburst`
- `bun run start:treemap`
- `bun run start:waterfall`
- `bun run start:world-history`

## Empty state guidance

Each visual shows a setup screen when required fields aren't bound, with role-specific guidance (for example: what to bind to X-Axis / Values / Group By).

## PDF export

- This repo uses the official Power BI report export flow for PDF.
- Full-page export is performed by the Power BI host/report export (`File -> Export -> PDF`), not per-visual download buttons.
- For operational guidance, see `docs/export-pdf.md`.

## npm (fallback)

If you need npm for any reason:

- Install: `npm install`
- Build: `npm run build:all`
