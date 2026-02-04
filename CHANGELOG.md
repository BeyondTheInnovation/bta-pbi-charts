# Changelog

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

