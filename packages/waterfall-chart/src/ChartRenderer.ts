"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, formatMeasureValue } from "@pbi-visuals/shared";
import { IVisualSettings } from "./settings";
import { IChartData, IWaterfallStep } from "./ChartTransformer";

function formatPct(value: number): string {
    return (value >= 0 ? "+" : "") + value.toFixed(1) + "%";
}

function truncateLabel(text: string, maxWidthPx: number, fontSize: number): string {
    const avgCharWidth = fontSize * 0.58;
    const maxChars = Math.max(2, Math.floor(maxWidthPx / avgCharWidth));
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 1).trimEnd() + "\u2026";
}

export class ChartRenderer extends BaseRenderer<IVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IVisualSettings): void {
        this.settings = settings;
        const chartData = data as IChartData;

        if (!chartData.steps.length) {
            this.context.container.selectAll("*").remove();
            return;
        }

        const groups = chartData.groups.length ? chartData.groups : ["All"];
        const segmentKeys = chartData.segmentKeys.length ? chartData.segmentKeys : [chartData.valueDisplayName || "Value"];
        const xAxisLabelBlockHeight = settings.showXAxis ? 18 : 0;

        const legendFontSize = settings.textSizes?.legendFontSize || settings.legendFontSize || 11;
        const legendReservation = settings.showLegend && segmentKeys.length > 1
            ? this.getLegendReservation({
                isOrdinal: true,
                categories: segmentKeys,
                legendFontSize,
                availableWidth: this.context.width,
                availableHeight: this.context.height
            })
            : { top: 0, right: 0, bottom: 0, left: 0 };

        const margin = {
            top: 44 + legendReservation.top,
            right: 20 + legendReservation.right,
            bottom: 28 + xAxisLabelBlockHeight + legendReservation.bottom,
            left: 72 + legendReservation.left
        };

        const panelGap = groups.length > 1 ? Math.max(20, settings.smallMultiples.spacing) : 0;
        const width = Math.max(220, this.context.width - margin.left - margin.right);
        const height = Math.max(160, this.context.height - margin.top - margin.bottom - panelGap * (groups.length - 1));
        const panelHeight = height / groups.length;

        const domainMinRaw = chartData.minValue;
        const domainMaxRaw = chartData.maxValue;
        const spanRaw = Math.max(1, domainMaxRaw - domainMinRaw);
        const pad = spanRaw * 0.1;
        const lowerPad = domainMinRaw < 0 ? pad : 0;
        const upperPad = domainMaxRaw > 0 ? pad : 0;
        const yDomainMin = Math.min(0, domainMinRaw - lowerPad);
        const yDomainMax = Math.max(yDomainMin + 1, Math.max(0, domainMaxRaw + upperPad));

        const colorScale = this.getCategoryColors(segmentKeys);
        const valueLabelSize = Math.max(10, (settings.textSizes?.yAxisFontSize || settings.yAxisFontSize) + 1);
        const pctLabelSize = Math.max(9, (settings.textSizes?.xAxisFontSize || settings.xAxisFontSize) - 1);
        const axisLabelSize = settings.textSizes?.xAxisFontSize || settings.xAxisFontSize;

        groups.forEach((groupName, groupIndex) => {
            const panelY = margin.top + groupIndex * (panelHeight + panelGap);
            const panel = this.context.container.append("g")
                .attr("class", "panel")
                .attr("transform", "translate(" + margin.left + "," + Math.round(panelY) + ")");

            const steps = chartData.steps.filter((s) => s.group === groupName);
            if (!steps.length) return;

            const stepNames = steps.map((s) => s.step);
            const x = d3.scalePoint<string>()
                .domain(stepNames)
                .range([0, width])
                .padding(0.5);

            const spacing = width / Math.max(1, stepNames.length);
            const barW = Math.max(26, Math.min(88, spacing * 0.64));

            const y = d3.scaleLinear()
                .domain([yDomainMin, yDomainMax])
                .range([panelHeight, 0]);

            const gridTicks = y.ticks(4).filter((d) => d !== 0);
            panel.selectAll("line.grid")
                .data(gridTicks)
                .join("line")
                .attr("class", "grid")
                .attr("x1", 0)
                .attr("x2", width)
                .attr("y1", (d) => Math.round(y(d)))
                .attr("y2", (d) => Math.round(y(d)))
                .attr("stroke", this.getGridStroke("#e5e7eb"))
                .attr("stroke-width", 1)
                .attr("opacity", 0.72);


            if (groupIndex > 0) {
                panel.append("line")
                    .attr("x1", 0)
                    .attr("x2", width)
                    .attr("y1", -Math.round(panelGap / 2))
                    .attr("y2", -Math.round(panelGap / 2))
                    .attr("stroke", this.getGridStroke("#9ca3af"))
                    .attr("stroke-width", 1.2)
                    .attr("opacity", 0.9);
            }

            const sortedSegments = (step: IWaterfallStep) => step.segments.slice().sort((a, b) => {
                const ai = segmentKeys.indexOf(a.name);
                const bi = segmentKeys.indexOf(b.name);
                return ai - bi;
            });

            const stepBottomPixels: number[] = new Array(steps.length);

            steps.forEach((step, i) => {
                const xCenter = x(step.step);
                if (xCenter === undefined) return;
                const xPos = xCenter - barW / 2;

                if (i > 0 && !step.isTotal) {
                    const prev = steps[i - 1];
                    const prevX = x(prev.step);
                    if (prevX !== undefined) {
                        panel.append("line")
                            .attr("x1", Math.round(prevX + barW / 2))
                            .attr("x2", Math.round(xCenter - barW / 2))
                            .attr("y1", Math.round(y(step.start)))
                            .attr("y2", Math.round(y(step.start)))
                            .attr("stroke", this.getGridStroke("#94a3b8"))
                            .attr("stroke-width", 1)
                            .attr("stroke-dasharray", "3,3")
                            .attr("opacity", 0.9);
                    }
                }

                let runningWithin = step.start;
                sortedSegments(step).forEach((segment) => {
                    const next = runningWithin + segment.value;
                    const low = Math.min(runningWithin, next);
                    const high = Math.max(runningWithin, next);
                    const yTop = y(high);
                    const yBottom = y(low);
                    const rectY = Math.round(Math.min(yTop, yBottom));
                    const rectHeight = Math.max(1, Math.round(Math.abs(yBottom - yTop)));
                    const color = colorScale(segment.name);

                    const rect = panel.append("rect")
                        .attr("class", "segment")
                        .attr("x", Math.round(xPos))
                        .attr("y", rectY)
                        .attr("width", Math.max(1, Math.round(barW)))
                        .attr("height", rectHeight)
                        .attr("fill", color)
                        .attr("fill-opacity", step.isTotal ? 0.94 : 0.84)
                        .attr("stroke", color)
                        .attr("stroke-width", step.isTotal ? 1.1 : 0.85)
                        .attr("rx", 2);

                    this.addTooltip(rect as any, [
                        { displayName: "Step", value: step.step },
                        { displayName: "Header", value: step.header },
                        { displayName: "Segment", value: segment.name, color },
                        { displayName: chartData.valueDisplayName || "Value", value: formatMeasureValue(segment.value, chartData.valueFormatString) },
                        { displayName: "Column Total", value: formatMeasureValue(step.total, chartData.valueFormatString) },
                        {
                            displayName: chartData.percentageDisplayName || "Percentage",
                            value: formatPct(step.explicitPct ?? step.contributionPct)
                        }
                    ], {
                        title: step.step,
                        subtitle: groupName !== "All" ? groupName : undefined,
                        color
                    });

                    if (rectHeight >= 16 && barW >= 40) {
                        panel.append("text")
                            .attr("x", Math.round(xPos + barW / 2))
                            .attr("y", Math.round(rectY + rectHeight / 2 + 4))
                            .attr("text-anchor", "middle")
                            .attr("font-size", Math.max(9, valueLabelSize - 2) + "px")
                            .attr("font-weight", "500")
                            .attr("fill", this.getThemeForeground("#111827"))
                            .text(formatMeasureValue(segment.value, chartData.valueFormatString));
                    }

                    runningWithin = next;
                });

                const low = Math.min(step.start, step.end);
                const high = Math.max(step.start, step.end);
                const barTop = y(high);
                const barBottom = y(low);
                const barTopRounded = Math.round(barTop);
                const barBottomRounded = Math.round(barBottom);
                stepBottomPixels[i] = Math.max(barTopRounded, barBottomRounded);

                panel.append("rect")
                    .attr("x", Math.round(xPos))
                    .attr("y", barTopRounded)
                    .attr("width", Math.max(1, Math.round(barW)))
                    .attr("height", Math.max(1, barBottomRounded - barTopRounded))
                    .attr("fill", "none")
                    .attr("stroke", this.getGridStroke(step.isTotal ? "#374151" : "#6b7280"))
                    .attr("stroke-width", step.isTotal ? 1.6 : 1.05);

                const pctValue = step.explicitPct ?? step.contributionPct;
                const valueLabel = formatMeasureValue(step.total, chartData.valueFormatString);
                const pctLabel = formatPct(pctValue);
                const isPositive = step.total >= 0;

                let valueY = isPositive ? barTop - 24 : barBottom + 18;
                let pctY = isPositive ? barTop - 10 : barBottom + 32;

                if (isPositive && pctY < 10) {
                    valueY = Math.min(panelHeight - 24, barTop + 16);
                    pctY = valueY + 14;
                } else if (!isPositive && pctY > panelHeight - 4) {
                    pctY = Math.max(12, barBottom - 8);
                    valueY = Math.max(12, pctY - 14);
                }

                panel.append("text")
                    .attr("x", Math.round(xPos + barW / 2))
                    .attr("y", Math.round(valueY))
                    .attr("text-anchor", "middle")
                    .attr("font-size", valueLabelSize + "px")
                    .attr("font-weight", "700")
                    .attr("fill", this.getThemeForeground("#111827"))
                    .text(valueLabel);

                panel.append("text")
                    .attr("x", Math.round(xPos + barW / 2))
                    .attr("y", Math.round(pctY))
                    .attr("text-anchor", "middle")
                    .attr("font-size", pctLabelSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", this.getThemeForeground("#334155"))
                    .text(pctLabel);

            });

            if (settings.showXAxis) {
                const fontFamily = settings.xAxisFontFamily || "Segoe UI";
                const maxLabelW = Math.max(28, barW + 8);

                // Each label sits directly under its own bar's bottom edge
                steps.forEach((step, i) => {
                    const xCenter = x(step.step);
                    if (xCenter === undefined) return;
                    const barBottomPx = stepBottomPixels[i] ?? Math.round(Math.max(y(step.start), y(step.end)));
                    const labelY = barBottomPx + axisLabelSize + 2;

                    const raw = String(step.header ?? "").trim();
                    const label = raw || step.step;
                    const truncated = truncateLabel(label, maxLabelW, axisLabelSize);

                    const text = panel.append("text")
                        .attr("x", Math.round(xCenter))
                        .attr("y", labelY)
                        .attr("text-anchor", "middle")
                        .attr("font-size", axisLabelSize + "px")
                        .attr("font-weight", step.isTotal ? "700" : (settings.xAxisBold ? "700" : "500"))
                        .attr("font-family", fontFamily)
                        .attr("fill", settings.xAxisColor);
                    if (settings.xAxisItalic) text.attr("font-style", "italic");
                    if (settings.xAxisUnderline) text.attr("text-decoration", "underline");
                    text.text(truncated);
                    if (truncated !== label) text.append("title").text(label);
                });
            }

            if (settings.showYAxis) {
                panel.selectAll("text.y-label")
                    .data(gridTicks)
                    .join("text")
                    .attr("x", -10)
                    .attr("y", (d) => Math.round(y(d)) + 4)
                    .attr("text-anchor", "end")
                    .attr("font-size", (settings.textSizes.yAxisFontSize || settings.yAxisFontSize) + "px")
                    .attr("fill", settings.yAxisColor)
                    .text((d) => formatMeasureValue(d, chartData.valueFormatString));
            }

            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All") {
                panel.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", -12)
                    .attr("font-size", (settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize) + "px")
                    .attr("fill", this.getThemeForeground("#111827"))
                    .text(groupName);
            }
        });

        if (settings.showLegend && segmentKeys.length > 1) {
            this.renderLegend(colorScale, chartData.maxValue, true, segmentKeys, undefined, undefined, {
                alignFrame: {
                    x: margin.left,
                    y: 0,
                    width,
                    height: Math.max(0, margin.top - 6)
                },
                availableWidth: width,
                availableHeight: Math.max(0, margin.top - 6)
            });
        }
    }
}
