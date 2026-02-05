"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, calculateLabelRotation, formatLabel, measureMaxLabelWidth, formatMeasureValue } from "@pbi-visuals/shared";
import { IStreamgraphVisualSettings } from "./settings";
import { StreamgraphData } from "./StreamgraphTransformer";

export class StreamgraphRenderer extends BaseRenderer<IStreamgraphVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IStreamgraphVisualSettings): void {
        this.settings = settings;
        const streamData = data as StreamgraphData;

        if (data.dataPoints.length === 0) {
            this.renderNoData();
            return;
        }

        const { xValues, yValues, groups, stackedDataByGroup, maxStackSum } = streamData;
        const legendCategories = streamData.hasLegendRoleData ? yValues : [];
        const yAxisColor = this.isHighContrastMode() ? this.getThemeForeground(settings.yAxisColor || "#111827") : settings.yAxisColor;
        const xAxisColor = this.isHighContrastMode() ? this.getThemeForeground(settings.xAxisColor || "#111827") : settings.xAxisColor;

        const yAxisFontSize = this.getEffectiveFontSize(
            settings.textSizes.yAxisFontSize > 0 ? settings.textSizes.yAxisFontSize : settings.yAxisFontSize,
            6,
            40
        );

        const formatTick = (v: number): string => formatMeasureValue(v, streamData.valueFormatString);

        // Reserve space for Y-axis tick labels when enabled (native-like)
        let leftMargin = 20;
        if (settings.showYAxis) {
            const maxSum = Number.isFinite(maxStackSum) ? maxStackSum : 0;
            const candidates = [0, maxSum / 2, maxSum, -maxSum / 2, -maxSum].map(formatTick);
            const width = measureMaxLabelWidth([...new Set(candidates)], yAxisFontSize, settings.yAxisFontFamily);
            leftMargin = Math.min(90, Math.max(32, Math.ceil(width + 14)));
        }

        const formatXLabel = (val: string): string => {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
            }
            return val;
        };
        const xDisplayLabels = xValues.map(formatXLabel);

        const legendReserve = this.getLegendReservation({ isOrdinal: true, categories: legendCategories });

        const titleSpacing = settings.smallMultiples.titleSpacing || 25;
        const panelTitleFontSize = this.getEffectiveFontSize(
            settings.textSizes.panelTitleFontSize > 0 ? settings.textSizes.panelTitleFontSize : settings.smallMultiples.titleFontSize,
            6,
            40
        );
        const hasPanelTitles = Boolean(settings.smallMultiples.showTitle && groups.length > 1 && groups.some(g => g !== "All" && g !== "(Blank)"));
        const titleReserve = hasPanelTitles ? Math.round(titleSpacing + panelTitleFontSize + 8) : 0;
        const interPanelGap = groups.length > 1
            ? (hasPanelTitles ? Math.max(settings.smallMultiples.spacing, titleReserve) : settings.smallMultiples.spacing)
            : 0;

        const margin = {
            top: 12 + legendReserve.top + titleReserve,
            right: 12 + legendReserve.right,
            bottom: (settings.showXAxis ? 45 : 12) + legendReserve.bottom,
            left: leftMargin + legendReserve.left
        };

        const groupCount = groups.length;
        const totalSpacing = (groupCount - 1) * interPanelGap;
        const availableHeight = this.context.height - margin.top - margin.bottom - totalSpacing;
        const chartWidth = this.context.width - margin.left - margin.right;

        let currentY = margin.top;

        groups.forEach((groupName, groupIndex) => {
            const groupHeight = availableHeight / groupCount;
            const groupData = data.dataPoints.filter(d => d.groupValue === groupName);
            const groupYValues = [...new Set(groupData.map(d => d.yValue))].sort();
            const groupStack = stackedDataByGroup.get(groupName) ?? new Map<string, Map<string, number>>();

            const panelGroup = this.context.container.append("g")
                .attr("class", "streamgraph-panel")
                .attr("transform", `translate(${margin.left}, ${currentY})`);

            // Group title with configurable spacing
            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All" && groupName !== "(Blank)") {
                const titleSpacing = settings.smallMultiples.titleSpacing || 25;
                const titleBase = settings.smallMultiples.titleFontSize;
                const titleRequested = settings.textSizes.panelTitleFontSize > 0 ? settings.textSizes.panelTitleFontSize : titleBase;
                const titleFontSize = this.getEffectiveFontSize(titleRequested, 6, 40);
                const displayTitle = formatLabel(groupName, chartWidth, titleFontSize);
                const title = panelGroup.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", -Math.round(titleSpacing))
                    .attr("font-size", `${titleFontSize}px`)
                    .attr("font-weight", "600")
                    .attr("fill", this.getTitleTextColor("#333"))
                    .text(displayTitle);

                if (displayTitle !== groupName) {
                    this.addTooltip(title as any, [{ displayName: "Group", value: groupName }]);
                }
            }

            // Prepare data for d3.stack
            const stackInput: Array<Record<string, number>> = xValues.map((x, index) => {
                const row: Record<string, number> = { x: index };
                groupYValues.forEach(y => {
                    const yMap = groupStack.get(y);
                    row[y] = yMap ? (yMap.get(x) ?? 0) : 0;
                });
                return row;
            });

            // X scale
            const xInset = Math.max(4, Math.min(16, chartWidth * 0.02));
            const xScale = d3.scaleLinear()
                .domain([0, xValues.length - 1])
                .range([xInset, Math.max(xInset, chartWidth - xInset)]);

            // Stack generator with wiggle offset
            const stack = d3.stack<Record<string, number>>()
                .keys(groupYValues)
                .offset(d3.stackOffsetWiggle)
                .order(d3.stackOrderInsideOut);

            const series = stack(stackInput);

            // Find y extent
            let yMin = Infinity;
            let yMax = -Infinity;
            series.forEach(s => {
                s.forEach(d => {
                    if (d[0] < yMin) yMin = d[0];
                    if (d[1] > yMax) yMax = d[1];
                });
            });

            const yScale = d3.scaleLinear()
                .domain([yMin, yMax])
                .range([groupHeight, 0]);

            // Y-axis ticks
            if (settings.showYAxis) {
                const yAxisGroup = panelGroup.append("g")
                    .attr("class", "y-axis");

                const ticks = yScale.ticks(5);
                ticks.forEach(tick => {
                    const y = Math.round(yScale(tick));
                    yAxisGroup.append("text")
                        .attr("x", -8)
                        .attr("y", y)
                        .attr("dy", "0.32em")
                        .attr("text-anchor", "end")
                        .attr("font-size", `${yAxisFontSize}px`)
                        .attr("font-family", settings.yAxisFontFamily)
                        .style("font-weight", settings.yAxisBold ? "700" : "400")
                        .style("font-style", settings.yAxisItalic ? "italic" : "normal")
                        .style("text-decoration", settings.yAxisUnderline ? "underline" : "none")
                        .attr("fill", yAxisColor)
                        .text(formatTick(tick));
                });
            }

            // Color scale (keep stable when a legend is bound)
            const colorDomain = streamData.hasLegendRoleData ? yValues : groupYValues;
            const colorScale = this.getCategoryColors(colorDomain, streamData.categoryColorMap);

            // Area generator
            const area = d3.area<d3.SeriesPoint<Record<string, number>>>()
                .x(d => xScale(d.data.x))
                .y0(d => yScale(d[0]))
                .y1(d => yScale(d[1]));

            if (settings.streamgraph.curveSmoothing) {
                area.curve(d3.curveBasis);
            } else {
                area.curve(d3.curveLinear);
            }

            // SVG rendering
            series.forEach((s, i) => {
                const category = groupYValues[i];
                const categoryColor = colorScale(category);

                const path = panelGroup.append("path")
                    .datum(s)
                    .attr("class", "stream-layer")
                    .attr("data-selection-key", category)
                    .attr("d", area)
                    .attr("fill", categoryColor)
                    .attr("opacity", this.isHighContrastMode() ? 1 : settings.streamgraph.opacity)
                    .attr("stroke", this.isHighContrastMode() ? this.getThemeBackground("#ffffff") : "none");

                if (settings.tooltip.style === "custom") {
                    this.addTooltipDynamic(path as any, (event: MouseEvent) => {
                        const node = panelGroup.node() as any;
                        const [px] = d3.pointer(event, node);
                        const rawIndex = Math.round(xScale.invert(px));
                        const index = Math.max(0, Math.min(xValues.length - 1, rawIndex));
                        const rawValue = (stackInput[index]?.[category] ?? 0) as number;

                        return {
                            meta: { title: category, subtitle: xDisplayLabels[index], color: categoryColor },
                            tooltipData: [
                                { displayName: "Value", value: formatMeasureValue(rawValue, streamData.valueFormatString), color: categoryColor },
                                ...(groupName !== "All" && groupName !== "(Blank)" ? [{ displayName: "Group", value: groupName }] : [])
                            ]
                        };
                    });
                } else {
                    this.addTooltip(path as any, [
                        { displayName: "Category", value: category, color: categoryColor },
                        ...(groupName !== "All" && groupName !== "(Blank)" ? [{ displayName: "Group", value: groupName }] : [])
                    ]);
                }
            });

            // X-axis (only on last group) with smart rotation
            if (settings.showXAxis && groupIndex === groups.length - 1) {
                const xAxisGroup = panelGroup.append("g")
                    .attr("class", "x-axis")
                    .attr("transform", `translate(0, ${Math.round(groupHeight)})`);

                const xAxisFontSize = this.getEffectiveFontSize(
                    settings.textSizes.xAxisFontSize > 0 ? settings.textSizes.xAxisFontSize : settings.xAxisFontSize,
                    6,
                    40
                );

                // Smart rotation detection — use the actual label spread (after xInset)
                const rotationResult = calculateLabelRotation({
                    mode: settings.rotateXLabels,
                    labels: xDisplayLabels,
                    availableWidth: chartWidth - 2 * xInset,
                    fontSize: xAxisFontSize,
                    fontFamily: settings.xAxisFontFamily
                });
                const shouldRotate = rotationResult.shouldRotate;
                const skipInterval = rotationResult.skipInterval;

                // Pre-compute the set of visible label indices so the last
                // label is only shown when it doesn't collide with its neighbour.
                const visibleXIndices: number[] = [];
                for (let i = 0; i < xValues.length; i++) {
                    if (skipInterval <= 1 || i % skipInterval === 0) {
                        visibleXIndices.push(i);
                    }
                }
                const lastIdx = xValues.length - 1;
                if (visibleXIndices.length > 0 && visibleXIndices[visibleXIndices.length - 1] !== lastIdx) {
                    const prevIdx = visibleXIndices[visibleXIndices.length - 1];
                    const stepSize = chartWidth / Math.max(1, xValues.length - 1);
                    const gap = (lastIdx - prevIdx) * stepSize;
                    const maxLabelW = measureMaxLabelWidth(
                        [xDisplayLabels[prevIdx], xDisplayLabels[lastIdx]],
                        xAxisFontSize,
                        settings.xAxisFontFamily
                    );
                    if (gap >= maxLabelW + 4) {
                        visibleXIndices.push(lastIdx);
                    }
                }
                const visibleSet = new Set(visibleXIndices);

                xValues.forEach((_, i) => {
                    if (!visibleSet.has(i)) return;

                    const x = Math.round(xScale(i));

                    const text = xAxisGroup.append("text")
                        .attr("x", x)
                        .attr("y", shouldRotate ? 5 : 15)
                        .attr("font-size", `${xAxisFontSize}px`)
                        .attr("font-family", settings.xAxisFontFamily)
                        .style("font-weight", settings.xAxisBold ? "700" : "400")
                        .style("font-style", settings.xAxisItalic ? "italic" : "normal")
                        .style("text-decoration", settings.xAxisUnderline ? "underline" : "none")
                        .attr("fill", xAxisColor)
                        .text(xDisplayLabels[i]);

                    if (shouldRotate) {
                        text
                            .attr("transform", `rotate(-45, ${x}, 5)`)
                            .attr("text-anchor", "end");
                    } else {
                        text.attr("text-anchor", "middle");
                    }
                });
            }

            currentY += groupHeight + interPanelGap;
        });

        // Legend
        if (streamData.hasLegendRoleData) {
            const categoryColors = this.getCategoryColors(yValues, streamData.categoryColorMap);
            this.renderLegend(categoryColors, data.maxValue, true, yValues, undefined, undefined, {
                alignFrame: {
                    x: margin.left,
                    y: margin.top,
                    width: chartWidth,
                    height: Math.max(0, this.context.height - margin.top - margin.bottom)
                }
            });
        }
    }
}
