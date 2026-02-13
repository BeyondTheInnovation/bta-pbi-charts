# Changelog

## v1.4.5 - 2026-02-13

### Added
- World History Timeline: native drill support on `Start` hierarchy (`Year -> Quarter -> Month -> Day`) with drill role metadata in capabilities.
- World History Timeline: hierarchy-aware top axis rendering for drill levels, with improved contextual label rows.

### Changed
- Upgraded visual toolchain across workspaces to `powerbi-visuals-api ~5.11.0` and `powerbi-visuals-tools ^7.0.2` (plus aligned ESLint plugin versions).
- Updated all visuals to `apiVersion: 5.11.0` in `pbiviz.json`.
- World History Timeline: updated visual GUID/version and refreshed sample dataset for hierarchy/drill testing.
- Build wrapper (`scripts/pbiviz-wrapper.mjs`) now prefers repo-root binaries and auto-reconciles local `powerbi-visuals-api` links to the manifest API version.

### Fixed
- World History Timeline: `Today` marker label no longer overlaps timeline row labels; it is now rendered in header-safe space.
- World History Timeline: legend/sort/axis layout and scroll behavior regressions addressed to reduce header drift and blank-gap artifacts during navigation.

## v1.4.0 - 2026-02-10

### Added
- Inline Labels Line: Secondary measure (Value 2) support with stacked point value labels.
- Inline Labels Line: Secondary Y-Axis for Value 2 (right-side) with formatting settings.
- Inline Labels Line: Point Values "Inside Line" placement with halo (stroke cut-out effect).
- Inline Labels Line: Point Values styling for Value 2 (separate font size, color, and line gap).

### Changed
- Inline Labels Line: When Value 2 is bound, Point Values and Value 2 labels auto-enable by default (unless explicitly overridden).
- Inline Labels Line: Grey past styling adjusted for clearer contrast and modern look.

## v1.3.0 - 2026-02-10

### Added
- New visual: Inline Labels Line (inline end labels per series, last-2 markers, optional area fill, optional value labels at each stop).
- Inline Labels Line: Point Values option (on by default) to show the value at each data point (with auto density).

### Changed
- Inline Labels Line: X-Axis now supports up to 2 fields; if Legend is empty, the 2nd X-Axis field is used as the series split.
- Inline Labels Line: Values is no longer required to start building field wells (you can add X-Axis first).

### Fixed
- Inline Labels Line, Streamgraph, Bump Chart, Donut Chart: Data Colors pane now matches the initial rendered series colors (no mismatch until a user override is set).

## v1.2.3 - 2026-02-10

### Fixed
- All visuals: Tooltip value label now uses the bound measure's display name (from the Values field well) instead of always showing "Value".

## v1.2.2 - 2026-02-09

### Fixed
- All visuals: Values role now supports Power BI field parameters (declared as `GroupingOrMeasure` instead of `Measure`) so measures can be switched dynamically via slicers.

## v1.2.1 - 2026-02-09

### Added
- Heatmap: optional horizontal/vertical scrolling with pinned axes and labels for easier navigation on large matrices.
- Heatmap: alignment and margin controls for better layout tuning in constrained viewports.

### Fixed
- Heatmap: tooltip hit-testing and positioning now stay correct while scrolling.

## v1.2.0 - 2026-02-05

### Added
- Cross-visual selection, multi-select, and context menu interactions across all visuals.
- Rendering event lifecycle reporting (`renderingStarted`, `renderingFinished`, `renderingFailed`) for host integration.
- High-contrast and host theme-aware color handling in shared rendering utilities.
- New shared selection binding utility for consistent data-point interaction behavior.

### Changed
- Bumped all visual and workspace package versions to `1.2.0` (`pbiviz` visual versions to `1.2.0.0`).
- Tooltip defaults are now styled HTML tooltips again, with legend/category color swatches shown in tooltip rows.
- Visual capabilities updated for better native parity (`supportsKeyboardFocus`, `supportsLandingPage`, `supportsEmptyDataView`, `supportsMultiVisualSelection`, `supportsHighlight`).

### Fixed
- Donut highlight handling now respects host-provided highlight values.
- Transformer pipelines now consume highlight values across visuals instead of ignoring them.
- Bump chart ranking and streamgraph stack prep performance hotspots reduced.
- Packed bubble layout simulation now uses bounded adaptive tick limits for faster rendering.

## v1.0.9 - 2026-02-04

### Added
- Canvas tooltip support for touch and pointer events (Power BI Mobile compatible).

### Changed
- Tooltip ownership moved to the visual lifecycle (renderer no longer recreates/destroys tooltip DOM every render).
- Bubble simulation ticks now stop on alpha convergence (less wasted work on small datasets, more stable on large ones).

### Fixed
- Robust `getContrastColor()` handling for CSS colors beyond 6-digit hex (3-digit hex, rgb/rgba, named colors).
- Calendar heatmap canvas hit-testing optimized from O(n) scan to O(1) coordinate-to-cell mapping.
- Canvas drawing now restores context reliably even on exceptions (save/restore wrapped with try/finally).
- Text measurement cache bounded with LRU eviction and shared measurement canvas reuse.
- Canvas resize now clamps malformed negative viewports more safely.

## v1.0.8 - 2026-02-04

### Added
- Donut Chart visual (rainbow by default) with center total, hover highlight, small multiples, and custom tooltips.
- Heatmap true hierarchical axes using `matrix` data mapping (supports up to 5 levels for X and Y).

### Changed
- Heatmap X-axis ordering for date-like labels now prefers chronological sorting over alphabetical.
- Shared formatting model utilities extended for Donut settings + additional text size controls.

### Fixed
- Donut inside-label auto-fit now sizes based on slice geometry + label length, with safer overflow handling.
- Outside-label leader lines now anchor to the correct slice and use collision-avoiding placement.
