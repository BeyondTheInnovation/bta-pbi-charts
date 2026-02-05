# Changelog

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
