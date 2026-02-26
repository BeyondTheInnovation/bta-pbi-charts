"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, formatMeasureValue, renderEmptyState } from "@pbi-visuals/shared";
import { IVisualSettings } from "./settings";
import { IChartData, IMatrixRow } from "./ChartTransformer";

export class ChartRenderer extends BaseRenderer<IVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IVisualSettings): void {
        this.settings = settings;
        const chartData = data as IChartData;

        if (!chartData.rows.length || chartData.dimensions.length < 1) {
            this.renderNoData();
            return;
        }

        const dims = chartData.dimensions;
        const n = dims.length;

        // Single-measure mode: render strip plot with hint
        if (n === 1) {
            this.renderSingleMeasure(chartData, settings);
            return;
        }

        const groups = chartData.groups.length ? chartData.groups : ["All"];
        const margin = { top: 28, right: 16, bottom: 16, left: 16 };
        const panelGap = groups.length > 1 ? Math.max(18, settings.smallMultiples.spacing) : 0;
        const width = Math.max(220, this.context.width - margin.left - margin.right);
        const height = Math.max(220, this.context.height - margin.top - margin.bottom - panelGap * (groups.length - 1));
        const panelHeight = height / groups.length;

        const cellSize = Math.max(32, Math.min(width, panelHeight) / n);
        const gridSize = cellSize * n;
        const pad = Math.max(4, Math.round(cellSize * 0.08));

        const colorScale = this.getCategoryColors(groups);

        groups.forEach((groupName, groupIndex) => {
            const panelY = margin.top + groupIndex * (panelHeight + panelGap);
            const panelX = margin.left + Math.max(0, (width - gridSize) / 2);
            const panel = this.context.container.append("g")
                .attr("class", "panel")
                .attr("transform", "translate(" + Math.round(panelX) + "," + Math.round(panelY) + ")");

            const rows = chartData.rows.filter((r) => r.group === groupName);
            if (!rows.length) return;

            const xByDim = new Map<string, ReturnType<typeof d3.scaleLinear>>();
            dims.forEach((d) => {
                const range = d.max - d.min;
                const domainPad = range > 0 ? range * 0.05 : 0.5;
                xByDim.set(d.key, d3.scaleLinear()
                    .domain([d.min - domainPad, d.max + domainPad])
                    .range([pad, cellSize - pad]));
            });

            // Render grid background
            panel.append("rect")
                .attr("class", "grid-bg")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", Math.round(gridSize))
                .attr("height", Math.round(gridSize))
                .attr("rx", 2);

            for (let yi = 0; yi < n; yi++) {
                for (let xi = 0; xi < n; xi++) {
                    const dimX = dims[xi];
                    const dimY = dims[yi];
                    const cx = Math.round(xi * cellSize);
                    const cy = Math.round(yi * cellSize);

                    const cell = panel.append("g")
                        .attr("class", "cell")
                        .attr("transform", "translate(" + cx + "," + cy + ")");

                    // Cell background
                    cell.append("rect")
                        .attr("class", xi === yi ? "cell-bg cell-bg-diag" : "cell-bg")
                        .attr("width", Math.round(cellSize))
                        .attr("height", Math.round(cellSize));

                    // Cell border (right and bottom edges only for clean grid)
                    if (xi < n - 1) {
                        cell.append("line")
                            .attr("class", "cell-border")
                            .attr("x1", Math.round(cellSize))
                            .attr("y1", 0)
                            .attr("x2", Math.round(cellSize))
                            .attr("y2", Math.round(cellSize));
                    }
                    if (yi < n - 1) {
                        cell.append("line")
                            .attr("class", "cell-border")
                            .attr("x1", 0)
                            .attr("y1", Math.round(cellSize))
                            .attr("x2", Math.round(cellSize))
                            .attr("y2", Math.round(cellSize));
                    }

                    if (xi === yi) {
                        // Diagonal: dimension label
                        const fontSize = Math.max(8, Math.min(13, (settings.textSizes.xAxisFontSize || settings.xAxisFontSize) || Math.round(cellSize * 0.12)));
                        const label = this.truncateLabel(dimX.key, cellSize - pad * 2, fontSize);

                        cell.append("text")
                            .attr("class", "dim-label")
                            .attr("x", Math.round(cellSize / 2))
                            .attr("y", Math.round(cellSize / 2))
                            .attr("font-size", fontSize + "px")
                            .attr("fill", settings.xAxisColor)
                            .text(label);

                        // Min/max indicators on diagonal
                        if (cellSize >= 50) {
                            const tickFontSize = Math.max(7, Math.round(fontSize * 0.7));
                            cell.append("text")
                                .attr("class", "dim-range")
                                .attr("x", pad + 1)
                                .attr("y", Math.round(cellSize) - 4)
                                .attr("font-size", tickFontSize + "px")
                                .text(this.formatCompact(dimX.min, dimX.format));
                            cell.append("text")
                                .attr("class", "dim-range dim-range-end")
                                .attr("x", Math.round(cellSize) - pad - 1)
                                .attr("y", Math.round(cellSize) - 4)
                                .attr("font-size", tickFontSize + "px")
                                .text(this.formatCompact(dimX.max, dimX.format));
                        }
                        continue;
                    }

                    // Off-diagonal: scatter dots
                    const xScale = xByDim.get(dimX.key)!;
                    const yRange = dimY.max - dimY.min;
                    const yDomainPad = yRange > 0 ? yRange * 0.05 : 0.5;
                    const yScale = d3.scaleLinear()
                        .domain([dimY.min - yDomainPad, dimY.max + yDomainPad])
                        .range([cellSize - pad, pad]);

                    const dotRadius = Math.max(2.5, Math.min(4.5, cellSize * 0.025));
                    const fillColor = colorScale(groupName);

                    cell.selectAll("circle.mark")
                        .data(rows)
                        .join("circle")
                        .attr("class", "mark")
                        .attr("cx", (r: IMatrixRow) => {
                            const v = r.values[dimX.key];
                            return v !== undefined ? Number(xScale(v)) : -999;
                        })
                        .attr("cy", (r: IMatrixRow) => {
                            const v = r.values[dimY.key];
                            return v !== undefined ? Number(yScale(v)) : -999;
                        })
                        .attr("r", dotRadius)
                        .attr("fill", fillColor)
                        .attr("fill-opacity", 0.78)
                        .attr("stroke", fillColor)
                        .attr("stroke-opacity", 0.4)
                        .attr("stroke-width", 0.6)
                        .each((r: IMatrixRow, i, nodes) => {
                            this.addTooltip(d3.select(nodes[i]) as any, [
                                { displayName: "Category", value: r.category, color: fillColor },
                                { displayName: dimX.key, value: formatMeasureValue(r.values[dimX.key], dimX.format) },
                                { displayName: dimY.key, value: formatMeasureValue(r.values[dimY.key], dimY.format) }
                            ], {
                                title: r.category,
                                subtitle: groupName !== "All" ? groupName : undefined,
                                color: fillColor
                            });
                        });
                }
            }

            // Outer grid frame
            panel.append("rect")
                .attr("class", "grid-frame")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", Math.round(gridSize))
                .attr("height", Math.round(gridSize))
                .attr("rx", 2);

            // Panel title for small multiples
            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All") {
                panel.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", -10)
                    .attr("font-size", (settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize) + "px")
                    .text(groupName);
            }
        });

        if (settings.showLegend && groups.length > 1) {
            this.renderLegend(colorScale, 1, true, groups);
        }
    }

    /**
     * Renders a strip plot for a single measure, showing data is connected
     * and hinting the user to add another measure.
     */
    private renderSingleMeasure(chartData: IChartData, _settings: IVisualSettings): void {
        const dim = chartData.dimensions[0];
        const groups = chartData.groups.length ? chartData.groups : ["All"];
        const colorScale = this.getCategoryColors(groups);

        const margin = { top: 48, right: 32, bottom: 48, left: 32 };
        const width = Math.max(120, this.context.width - margin.left - margin.right);
        const height = Math.max(80, this.context.height - margin.top - margin.bottom);

        const stripHeight = Math.min(height * 0.4, 80);
        const stripY = Math.round((height - stripHeight) / 2);

        const g = this.context.container.append("g")
            .attr("class", "single-measure")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        // Title: dimension name
        g.append("text")
            .attr("class", "single-measure-title")
            .attr("x", Math.round(width / 2))
            .attr("y", stripY - 18)
            .attr("text-anchor", "middle")
            .attr("font-size", "13px")
            .text(dim.key);

        // Axis line
        const range = dim.max - dim.min;
        const domainPad = range > 0 ? range * 0.05 : 0.5;
        const xScale = d3.scaleLinear()
            .domain([dim.min - domainPad, dim.max + domainPad])
            .range([0, width]);

        g.append("line")
            .attr("class", "strip-axis")
            .attr("x1", 0)
            .attr("y1", stripY + stripHeight)
            .attr("x2", width)
            .attr("y2", stripY + stripHeight);

        // Axis ticks (5 ticks)
        const ticks = xScale.ticks(5);
        ticks.forEach((tick) => {
            const tx = Number(xScale(tick));
            g.append("line")
                .attr("class", "strip-tick")
                .attr("x1", tx)
                .attr("y1", stripY + stripHeight)
                .attr("x2", tx)
                .attr("y2", stripY + stripHeight + 5);
            g.append("text")
                .attr("class", "strip-tick-label")
                .attr("x", tx)
                .attr("y", stripY + stripHeight + 16)
                .attr("text-anchor", "middle")
                .attr("font-size", "9px")
                .text(this.formatCompact(tick, dim.format));
        });

        // Jitter dots vertically within the strip
        const jitterScale = d3.scaleLinear().domain([0, 1]).range([stripY + 6, stripY + stripHeight - 6]);
        const dotRadius = Math.max(2, Math.min(4, width * 0.006));

        chartData.rows.forEach((r, i) => {
            const v = r.values[dim.key];
            if (v === undefined) return;
            const jitter = jitterScale(this.seededRandom(i));
            const fillColor = colorScale(r.group);

            const dot = g.append("circle")
                .attr("class", "mark")
                .attr("cx", Number(xScale(v)))
                .attr("cy", jitter)
                .attr("r", dotRadius)
                .attr("fill", fillColor)
                .attr("fill-opacity", 0.6)
                .attr("stroke", fillColor)
                .attr("stroke-opacity", 0.3)
                .attr("stroke-width", 0.5);

            this.addTooltip(dot as any, [
                { displayName: "Category", value: r.category, color: fillColor },
                { displayName: dim.key, value: formatMeasureValue(v, dim.format) }
            ], {
                title: r.category,
                subtitle: r.group !== "All" ? r.group : undefined,
                color: fillColor
            });
        });

        // Hint message
        renderEmptyState(this.context.container, this.context.width, this.context.height, {
            title: "",
            lines: [],
            hint: "Add another value to see correlations"
        });

        // Position the hint below the strip
        const hintEl = this.context.container.select(".empty-state");
        if (!hintEl.empty()) {
            hintEl.attr("transform", "translate(" + Math.round(this.context.width / 2) + "," + Math.round(margin.top + stripY + stripHeight + 44) + ")");
        }
    }

    /** Simple seeded pseudo-random for stable jitter */
    private seededRandom(seed: number): number {
        const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
    }

    /** Truncate label to fit within a pixel width */
    private truncateLabel(text: string, maxWidth: number, fontSize: number): string {
        const charWidth = fontSize * 0.55;
        const maxChars = Math.floor(maxWidth / charWidth);
        if (text.length <= maxChars) return text;
        if (maxChars <= 3) return text.substring(0, 1) + "…";
        return text.substring(0, maxChars - 1) + "…";
    }

    /** Format a number compactly for axis ticks */
    private formatCompact(value: number, _format?: string): string {
        if (!Number.isFinite(value)) return "";
        const abs = Math.abs(value);
        if (abs >= 1e9) return (value / 1e9).toFixed(1) + "B";
        if (abs >= 1e6) return (value / 1e6).toFixed(1) + "M";
        if (abs >= 1e4) return (value / 1e3).toFixed(1) + "K";
        if (abs >= 100) return Math.round(value).toString();
        if (abs >= 1) return value.toFixed(1);
        return value.toFixed(2);
    }
}
