# PDF export rollout (custom visuals)

## Scope

This repo now supports **per-visual PDF download** for all visuals via an in-canvas button.

Implemented visuals:

- Bollinger Bands
- Bump Chart
- Calendar Heatmap
- Donut Chart
- Heatmap
- Inline Labels Line
- Packed Bubble
- Streamgraph
- World History Timeline

## How it works

- Each visual creates a shared export control (`Download PDF`) in the top-right corner.
- Export captures the **visible SVG viewport** (not hidden scrolled areas) and renders it to a PNG canvas.
- PNG bytes are embedded into a single-page PDF (`pdf-lib`).
- The visual triggers Power BI download via `host.downloadService.exportVisualsContentExtended(...)` with `fileType = "pdf"`.

File naming format:

- `<visual-name>-YYYYMMDD-HHmmss.pdf`

## Privileges and behavior

All `capabilities.json` files now declare:

```json
"privileges": [
  { "name": "ExportContent" }
]
```

Runtime behavior by privilege status:

- `Allowed`: button enabled.
- `NotDeclared`: button disabled with tooltip.
- `NotSupported`: button disabled with tooltip.
- `DisabledByAdmin`: button disabled with tooltip.

No-data behavior:

- Button is disabled and shows a no-data tooltip.

## Important distinction

- **This feature:** in-visual PDF file download.
- **Not this feature:** Power BI report-level export (`File -> Export -> PDF`).

Report-level export behavior for custom visuals is governed by Power BI certification/distribution requirements and should be validated after certification rollout.

## Validation checklist

1. `bun run build:shared`
2. `bun run build:all`
3. Start any visual (`bun run start:<visual>`) and verify:
   - button appears,
   - button is enabled when data exists and privilege is allowed,
   - generated PDF opens and matches the visible chart region.
4. Validate disabled tooltip states in environments where privilege is unavailable.
