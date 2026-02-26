"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, calculateLabelRotation, formatMeasureValue, measureMaxLabelWidth } from "@pbi-visuals/shared";
import { IVisualSettings } from "./settings";
import { IChartData, ICandle } from "./ChartTransformer";

const DEFAULT_BULL = "#26a69a";
const DEFAULT_BEAR = "#ef5350";

export class ChartRenderer extends BaseRenderer<IVisualSettings> {
    private static windowStart: number = 0;
    private lastData: IChartData | null = null;
    private lastSettings: IVisualSettings | null = null;

    constructor(context: RenderContext) {
        super(context);
    }

    private rerender(): void {
        if (!this.lastData || !this.lastSettings) return;
        this.context.container.selectAll("*").remove();
        this.render(this.lastData, this.lastSettings);
    }

    private navigate(maxStart: number, delta: number): void {
        const next = Math.max(0, Math.min(maxStart, ChartRenderer.windowStart + delta));
        if (next === ChartRenderer.windowStart) return;
        ChartRenderer.windowStart = next;
        this.rerender();
    }

    private formatXLabel(value: string, total: number): string {
        if (value.length > 20) {
            return value.substring(0, 18) + "\u2026";
        }
        return value;
    }

    private computeYTicks(min: number, max: number, count: number): number[] {
        const range = max - min;
        if (range <= 0) return [min];
        const rawStep = range / Math.max(1, count - 1);
        const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const normStep = rawStep / mag;
        let niceStep: number;
        if (normStep <= 1.5) niceStep = 1;
        else if (normStep <= 3) niceStep = 2;
        else if (normStep <= 7) niceStep = 5;
        else niceStep = 10;
        niceStep *= mag;

        const ticks: number[] = [];
        const start = Math.floor(min / niceStep) * niceStep;
        for (let v = start; v <= max + niceStep * 0.01; v += niceStep) {
            if (v >= min - niceStep * 0.01) ticks.push(v);
        }
        return ticks;
    }

    public render(data: ChartData, settings: IVisualSettings): void {
        this.settings = settings;
        const chartData = data as IChartData;
        this.lastData = chartData;
        this.lastSettings = settings;

        if (!chartData.candles.length) {
            this.renderNoData();
            return;
        }

        const groups = chartData.groups.length ? chartData.groups : ["All"];

        const xAxisFontSize = settings.textSizes.xAxisFontSize || settings.xAxisFontSize;
        const yAxisFontSize = settings.textSizes.yAxisFontSize || settings.yAxisFontSize;
        const xAxisColor = this.isHighContrastMode()
            ? this.getThemeForeground(settings.xAxisColor || "#9ca3af")
            : settings.xAxisColor;
        const yAxisColor = this.isHighContrastMode()
            ? this.getThemeForeground(settings.yAxisColor || "#6b7280")
            : settings.yAxisColor;

        // Use classic green/red by default; honor user's color scheme if changed
        const isDefaultScheme = settings.colorScheme === "vibrant";
        const bullColor = this.isHighContrastMode()
            ? this.getThemeForeground(DEFAULT_BULL)
            : isDefaultScheme ? DEFAULT_BULL : this.getCategoryColor(2);
        const bearColor = this.isHighContrastMode()
            ? this.getThemeForegroundSelected(DEFAULT_BEAR)
            : isDefaultScheme ? DEFAULT_BEAR : this.getCategoryColor(0);

        const xDomain = chartData.xValues.length
            ? chartData.xValues
            : Array.from(new Set(chartData.candles.map((c) => c.x)));

        const minPxPerCandle = 12;
        const maxVisible = Math.max(16, Math.floor((this.context.width - 100) / minPxPerCandle));
        const visibleCount = Math.max(1, Math.min(xDomain.length, maxVisible));
        const maxStart = Math.max(0, xDomain.length - visibleCount);
        const hasOverflow = maxStart > 0;
        ChartRenderer.windowStart = Math.max(0, Math.min(maxStart, ChartRenderer.windowStart));

        const visibleX = xDomain.slice(ChartRenderer.windowStart, ChartRenderer.windowStart + visibleCount);
        const visibleSet = new Set(visibleX);
        const scrollStep = Math.max(1, Math.ceil(visibleCount / 8));

        // Wheel scroll
        this.context.svg.on("wheel.candlestick", null);
        if (hasOverflow) {
            this.context.svg.on("wheel.candlestick", (event: WheelEvent) => {
                const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
                if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) return;
                event.preventDefault();
                event.stopPropagation();
                this.navigate(maxStart, (delta > 0 ? 1 : -1) * scrollStep);
            });
        }

        const yTickSample = chartData.candles.filter((c) => visibleSet.has(c.x));
        const globalMin = yTickSample.length ? Math.min(...yTickSample.map((c) => c.low)) : 0;
        const globalMax = yTickSample.length ? Math.max(...yTickSample.map((c) => c.high)) : 1;
        const yTicks = this.computeYTicks(globalMin, globalMax, 6);
        const yTickLabels = yTicks.map((v) => formatMeasureValue(v, chartData.valueFormatString));
        const maxYLabelWidth = measureMaxLabelWidth(yTickLabels, yAxisFontSize, settings.yAxisFontFamily);
        const yAxisReserve = settings.showYAxis ? Math.min(100, Math.max(40, Math.ceil(maxYLabelWidth + 12))) : 20;

        const navBtnWidth = hasOverflow ? 28 : 0;
        const margin = { top: 20, right: 14 + navBtnWidth, bottom: 48, left: yAxisReserve };
        const panelGap = groups.length > 1 ? Math.max(18, settings.smallMultiples.spacing) : 0;
        const chartWidth = Math.max(80, this.context.width - margin.left - margin.right);
        const chartHeight = Math.max(80, this.context.height - margin.top - margin.bottom - panelGap * (groups.length - 1));
        const panelHeight = chartHeight / groups.length;

        const xDisplayLabels = visibleX.map((v) => this.formatXLabel(v, visibleCount));
        const rotationResult = calculateLabelRotation({
            mode: settings.rotateXLabels,
            labels: xDisplayLabels,
            availableWidth: chartWidth,
            fontSize: xAxisFontSize,
            fontFamily: settings.xAxisFontFamily
        });
        const shouldRotate = rotationResult.shouldRotate;
        const skipInterval = rotationResult.skipInterval;

        groups.forEach((groupName, groupIndex) => {
            const panelY = margin.top + groupIndex * (panelHeight + panelGap);
            const panel = this.context.container.append("g")
                .attr("class", "panel")
                .attr("transform", `translate(${margin.left},${Math.round(panelY)})`);

            const candles = chartData.candles.filter((c) => c.group === groupName && visibleSet.has(c.x));
            if (!candles.length) return;

            const localMin = Math.min(...candles.map((c) => c.low));
            const localMax = Math.max(...candles.map((c) => c.high));
            const yPad = (localMax - localMin) * 0.06 || 1;
            const yScale = d3.scaleLinear()
                .domain([localMin - yPad, localMax + yPad])
                .range([panelHeight, 0]);

            const xScale = d3.scalePoint<string>()
                .domain(visibleX)
                .range([0, chartWidth])
                .padding(0.5);
            const step = visibleX.length > 1
                ? Math.abs((xScale(visibleX[1]) ?? 0) - (xScale(visibleX[0]) ?? 0))
                : chartWidth;
            const bodyW = Math.max(3, Math.min(24, step * 0.62));

            // Grid lines
            const gridTicks = this.computeYTicks(localMin, localMax, 5);
            panel.selectAll("line.grid")
                .data(gridTicks)
                .join("line")
                .attr("class", "grid")
                .attr("x1", 0)
                .attr("x2", chartWidth)
                .attr("y1", (d) => Math.round(yScale(d)))
                .attr("y2", (d) => Math.round(yScale(d)))
                .attr("stroke", this.getGridStroke("#e5e7eb"))
                .attr("stroke-width", 0.8)
                .attr("shape-rendering", "crispEdges");

            // Bottom axis line
            panel.append("line")
                .attr("x1", 0)
                .attr("x2", chartWidth)
                .attr("y1", panelHeight)
                .attr("y2", panelHeight)
                .attr("stroke", this.getGridStroke("#d1d5db"))
                .attr("stroke-width", 1)
                .attr("shape-rendering", "crispEdges");

            // Candles
            const marks = panel.selectAll("g.mark")
                .data(candles)
                .join("g")
                .attr("class", "mark")
                .attr("transform", (d: ICandle) => `translate(${Math.round(xScale(d.x) ?? 0)},0)`);

            marks.each((d: ICandle, i, nodes) => {
                const node = d3.select(nodes[i]);
                const isBull = d.close >= d.open;
                const color = isBull ? bullColor : bearColor;

                // Wick
                node.append("line")
                    .attr("x1", 0)
                    .attr("x2", 0)
                    .attr("y1", Math.round(yScale(d.high)))
                    .attr("y2", Math.round(yScale(d.low)))
                    .attr("stroke", color)
                    .attr("stroke-width", 1)
                    .attr("shape-rendering", "crispEdges");

                // Body
                const top = Math.round(yScale(Math.max(d.open, d.close)));
                const bottom = Math.round(yScale(Math.min(d.open, d.close)));
                const h = Math.max(1, bottom - top);

                node.append("rect")
                    .attr("x", -Math.round(bodyW / 2))
                    .attr("y", top)
                    .attr("width", Math.round(bodyW))
                    .attr("height", h)
                    .attr("fill", color)
                    .attr("stroke", color)
                    .attr("stroke-width", 1)
                    .attr("shape-rendering", "crispEdges");

                // Tooltip hitarea
                this.addTooltip(node.append("rect")
                    .attr("x", -Math.round(Math.max(bodyW, step * 0.4) / 2))
                    .attr("y", Math.round(yScale(d.high)))
                    .attr("width", Math.round(Math.max(bodyW, step * 0.4)))
                    .attr("height", Math.max(1, Math.round(yScale(d.low) - yScale(d.high))))
                    .attr("fill", "transparent")
                    .attr("cursor", "crosshair") as any,
                [
                    { displayName: "Open", value: formatMeasureValue(d.open, chartData.valueFormatString), color },
                    { displayName: "High", value: formatMeasureValue(d.high, chartData.valueFormatString), color },
                    { displayName: "Low", value: formatMeasureValue(d.low, chartData.valueFormatString), color },
                    { displayName: "Close", value: formatMeasureValue(d.close, chartData.valueFormatString), color }
                ], {
                    title: d.x,
                    subtitle: groupName !== "All" ? groupName : undefined,
                    color
                });
            });

            // Y-axis
            if (settings.showYAxis) {
                const localYTicks = this.computeYTicks(localMin, localMax, 5);
                localYTicks.forEach((tick) => {
                    const py = Math.round(yScale(tick));
                    if (py < -2 || py > panelHeight + 2) return;

                    panel.append("line")
                        .attr("x1", -6)
                        .attr("x2", 0)
                        .attr("y1", py)
                        .attr("y2", py)
                        .attr("stroke", this.getGridStroke("#d1d5db"))
                        .attr("stroke-width", 1)
                        .attr("shape-rendering", "crispEdges");

                    panel.append("text")
                        .attr("class", "y-label")
                        .attr("x", -10)
                        .attr("y", py)
                        .attr("dy", "0.35em")
                        .attr("text-anchor", "end")
                        .attr("font-size", yAxisFontSize + "px")
                        .attr("font-family", settings.yAxisFontFamily)
                        .style("font-weight", settings.yAxisBold ? "700" : "400")
                        .style("font-style", settings.yAxisItalic ? "italic" : "normal")
                        .style("text-decoration", settings.yAxisUnderline ? "underline" : "none")
                        .attr("fill", yAxisColor)
                        .text(formatMeasureValue(tick, chartData.valueFormatString));
                });
            }

            // X-axis (last panel only)
            if (settings.showXAxis && groupIndex === groups.length - 1) {
                const visibleLabelIndices: number[] = [];
                for (let i = 0; i < visibleX.length; i++) {
                    if (skipInterval <= 1 || i % skipInterval === 0) {
                        visibleLabelIndices.push(i);
                    }
                }
                const lastIdx = visibleX.length - 1;
                if (visibleLabelIndices.length > 0 && visibleLabelIndices[visibleLabelIndices.length - 1] !== lastIdx) {
                    const prevIdx = visibleLabelIndices[visibleLabelIndices.length - 1];
                    const gapPx = (lastIdx - prevIdx) * step;
                    const maxLW = measureMaxLabelWidth(
                        [xDisplayLabels[prevIdx], xDisplayLabels[lastIdx]],
                        xAxisFontSize,
                        settings.xAxisFontFamily
                    );
                    if (gapPx >= maxLW + 4) visibleLabelIndices.push(lastIdx);
                }
                const labelSet = new Set(visibleLabelIndices);

                visibleX.forEach((xVal, i) => {
                    if (!labelSet.has(i)) return;
                    const cx = Math.round(xScale(xVal) ?? 0);

                    panel.append("line")
                        .attr("x1", cx)
                        .attr("x2", cx)
                        .attr("y1", panelHeight)
                        .attr("y2", panelHeight + 4)
                        .attr("stroke", this.getGridStroke("#d1d5db"))
                        .attr("stroke-width", 1)
                        .attr("shape-rendering", "crispEdges");

                    const text = panel.append("text")
                        .attr("class", "x-label")
                        .attr("x", cx)
                        .attr("y", Math.round(panelHeight + (shouldRotate ? 8 : 18)))
                        .attr("font-size", xAxisFontSize + "px")
                        .attr("font-family", settings.xAxisFontFamily)
                        .style("font-weight", settings.xAxisBold ? "700" : "400")
                        .style("font-style", settings.xAxisItalic ? "italic" : "normal")
                        .style("text-decoration", settings.xAxisUnderline ? "underline" : "none")
                        .attr("fill", xAxisColor)
                        .text(xDisplayLabels[i]);

                    if (shouldRotate) {
                        text.attr("transform", `rotate(-45,${cx},${Math.round(panelHeight + 8)})`)
                            .attr("text-anchor", "end");
                    } else {
                        text.attr("text-anchor", "middle");
                    }
                });
            }

            // Panel title
            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All") {
                panel.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", -8)
                    .attr("font-size", (settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize) + "px")
                    .text(groupName);
            }
        });

        // Nav arrows for overflow
        if (hasOverflow) {
            const midY = Math.round(this.context.height / 2);
            const rightX = Math.round(this.context.width - 14);
            const canGoLeft = ChartRenderer.windowStart > 0;
            const canGoRight = ChartRenderer.windowStart < maxStart;

            const arrowGroup = this.context.container.append("g").attr("class", "nav-arrows");

            // Left arrow
            if (canGoLeft) {
                const leftBtn = arrowGroup.append("g")
                    .attr("class", "nav-left")
                    .attr("cursor", "pointer")
                    .attr("transform", `translate(${margin.left - 6},${midY})`);
                leftBtn.append("rect")
                    .attr("x", -12)
                    .attr("y", -16)
                    .attr("width", 24)
                    .attr("height", 32)
                    .attr("fill", "transparent");
                leftBtn.append("path")
                    .attr("d", "M4,-8 L-4,0 L4,8")
                    .attr("stroke", "#6b7280")
                    .attr("stroke-width", 2)
                    .attr("fill", "none");
                leftBtn.on("click", () => this.navigate(maxStart, -scrollStep));
            }

            // Right arrow
            if (canGoRight) {
                const rightBtn = arrowGroup.append("g")
                    .attr("class", "nav-right")
                    .attr("cursor", "pointer")
                    .attr("transform", `translate(${rightX},${midY})`);
                rightBtn.append("rect")
                    .attr("x", -12)
                    .attr("y", -16)
                    .attr("width", 24)
                    .attr("height", 32)
                    .attr("fill", "transparent");
                rightBtn.append("path")
                    .attr("d", "M-4,-8 L4,0 L-4,8")
                    .attr("stroke", "#6b7280")
                    .attr("stroke-width", 2)
                    .attr("fill", "none");
                rightBtn.on("click", () => this.navigate(maxStart, scrollStep));
            }

            // Page indicator
            const page = Math.floor(ChartRenderer.windowStart / scrollStep) + 1;
            const totalPages = Math.ceil(xDomain.length / scrollStep);
            this.context.container.append("text")
                .attr("class", "page-indicator")
                .attr("x", Math.round(this.context.width / 2))
                .attr("y", this.context.height - 4)
                .attr("text-anchor", "middle")
                .attr("font-size", "9px")
                .attr("fill", "#9ca3af")
                .text(`${ChartRenderer.windowStart + 1}\u2013${Math.min(xDomain.length, ChartRenderer.windowStart + visibleCount)} of ${xDomain.length}`);
        }
    }
}
