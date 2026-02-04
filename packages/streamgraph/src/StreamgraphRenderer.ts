"use strict";

import * as d3 from "d3";
import { BaseRenderer, RenderContext, ChartData, calculateLabelRotation, formatLabel } from "@pbi-visuals/shared";
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

        const { xValues, yValues, groups, stackedData } = streamData;

        // Streamgraph doesn't render a Y-axis yet; avoid reserving empty left space.
        const leftMargin = 20;

        const formatXLabel = (val: string): string => {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
            }
            return val;
        };
        const xDisplayLabels = xValues.map(formatXLabel);

        const margin = {
            top: 40,
            right: 20,
            bottom: settings.showXAxis ? 70 : (settings.showLegend ? 60 : 20),
            left: leftMargin
        };

        const groupCount = groups.length;
        const totalSpacing = (groupCount - 1) * settings.smallMultiples.spacing;
        const availableHeight = this.context.height - margin.top - margin.bottom - totalSpacing;
        const chartWidth = this.context.width - margin.left - margin.right;

        let currentY = margin.top;

        groups.forEach((groupName, groupIndex) => {
            const groupHeight = availableHeight / groupCount;
            const groupData = data.dataPoints.filter(d => d.groupValue === groupName);
            const groupYValues = [...new Set(groupData.map(d => d.yValue))].sort();

            const panelGroup = this.context.container.append("g")
                .attr("class", "streamgraph-panel")
                .attr("transform", `translate(${margin.left}, ${currentY})`);

            // Group title with configurable spacing
            if (settings.smallMultiples.showTitle && groupName !== "All") {
                const titleSpacing = settings.smallMultiples.titleSpacing || 25;
                const titleFontSize = this.getEffectiveFontSize(
                    settings.textSizes.panelTitleFontSize,
                    settings.smallMultiples.titleFontSize,
                    10, 24
                );
                const displayTitle = formatLabel(groupName, chartWidth, titleFontSize);
                const title = panelGroup.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", -Math.round(titleSpacing))
                    .attr("font-size", `${titleFontSize}px`)
                    .attr("font-weight", "600")
                    .attr("fill", "#333")
                    .text(displayTitle);

                if (displayTitle !== groupName) {
                    this.addTooltip(title as any, [{ displayName: "Group", value: groupName }]);
                }
            }

            // Prepare data for d3.stack
            const stackInput: Array<Record<string, number>> = xValues.map(x => {
                const row: Record<string, number> = { x: xValues.indexOf(x) };
                groupYValues.forEach(y => {
                    const yMap = stackedData.get(y);
                    row[y] = yMap ? (yMap.get(x) || 0) : 0;
                });
                return row;
            });

            // X scale
            const xScale = d3.scaleLinear()
                .domain([0, xValues.length - 1])
                .range([0, chartWidth]);

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

            // Color scale
            const colorScale = this.getCategoryColors(groupYValues, streamData.categoryColorMap);

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
                    .attr("d", area)
                    .attr("fill", categoryColor)
                    .attr("opacity", settings.streamgraph.opacity)
                    .attr("stroke", "none");

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
                                { displayName: "Value", value: rawValue.toLocaleString() },
                                ...(groupName !== "All" ? [{ displayName: "Group", value: groupName }] : [])
                            ]
                        };
                    });
                } else {
                    this.addTooltip(path as any, [
                        { displayName: "Category", value: category },
                        ...(groupName !== "All" ? [{ displayName: "Group", value: groupName }] : [])
                    ]);
                }
            });

            // X-axis (only on last group) with smart rotation
            if (settings.showXAxis && groupIndex === groups.length - 1) {
                const xAxisGroup = panelGroup.append("g")
                    .attr("class", "x-axis")
                    .attr("transform", `translate(0, ${Math.round(groupHeight)})`);

                const xAxisFontSize = this.getEffectiveFontSize(
                    settings.textSizes.xAxisFontSize,
                    settings.xAxisFontSize,
                    8, 18
                );

                // Smart rotation detection
                const rotationResult = calculateLabelRotation({
                    mode: settings.rotateXLabels,
                    labels: xDisplayLabels,
                    availableWidth: chartWidth,
                    fontSize: xAxisFontSize
                });
                const shouldRotate = rotationResult.shouldRotate;
                const skipInterval = rotationResult.skipInterval;

                xValues.forEach((_, i) => {
                    // Skip labels based on calculated interval, but always include last label
                    if (skipInterval > 1 && i % skipInterval !== 0 && i !== xValues.length - 1) {
                        return;
                    }

                    const x = Math.round(xScale(i));
                    const visibleCount = Math.ceil(xValues.length / Math.max(1, skipInterval));
                    const spacePerLabel = chartWidth / Math.max(1, visibleCount);
                    const displayText = formatLabel(xDisplayLabels[i], Math.max(0, spacePerLabel - 6), xAxisFontSize);
                    const text = xAxisGroup.append("text")
                        .attr("x", x)
                        .attr("y", shouldRotate ? 5 : 15)
                        .attr("font-size", `${xAxisFontSize}px`)
                        .attr("fill", "#666")
                        .text(displayText);

                    if (displayText !== xDisplayLabels[i]) {
                        this.addTooltip(text as any, [{ displayName: "X", value: xDisplayLabels[i] }]);
                    }

                    if (shouldRotate) {
                        text
                            .attr("transform", `rotate(-45, ${x}, 5)`)
                            .attr("text-anchor", "end");
                    } else {
                        text.attr("text-anchor", "middle");
                    }
                });
            }

            currentY += groupHeight + settings.smallMultiples.spacing;
        });

        // Legend
        if (settings.showLegend) {
            const categoryColors = this.getCategoryColors(yValues, streamData.categoryColorMap);
            this.renderLegend(categoryColors, data.maxValue, true, yValues);
        }
    }
}
