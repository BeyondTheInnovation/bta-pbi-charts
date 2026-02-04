"use strict";

import * as d3 from "d3";
import {
    BaseRenderer,
    RenderContext,
    ChartData,
    calculateLabelRotation,
    formatLabel,
    measureMaxLabelWidth,
    measureTextWidth
} from "@pbi-visuals/shared";
import { IBumpChartVisualSettings } from "./settings";
import { BumpChartData, BumpChartDataPoint } from "./BumpChartTransformer";

export class BumpChartRenderer extends BaseRenderer<IBumpChartVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IBumpChartVisualSettings): void {
        this.settings = settings;
        const bumpData = data as BumpChartData;

        if (data.dataPoints.length === 0) {
            this.renderNoData();
            return;
        }

        const { xValues, yValues, groups, rankedData, maxRank } = bumpData;

        // Safety check
        if (!xValues || xValues.length === 0 || !yValues || yValues.length === 0) {
            this.renderNoData();
            return;
        }

        const yAxisFontSize = this.getResponsiveFontSize(settings.yAxisFontSize, 8, 18);
        const xAxisFontSize = this.getResponsiveFontSize(settings.xAxisFontSize, 8, 18);
        const legendFontSize = this.getResponsiveFontSize(settings.legendFontSize || 11, 9, 16);

        // Format X-axis labels (use these for rotation/collision decisions)
        const formatXLabel = (val: string): string => {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
            }
            return val;
        };
        const xDisplayLabels = xValues.map(formatXLabel);
        const xLabelByValue = new Map<string, string>();
        xValues.forEach((v, i) => xLabelByValue.set(v, xDisplayLabels[i]));

        // Calculate left label margin using real text measurement
        const maxYLabelWidth = measureMaxLabelWidth(yValues, yAxisFontSize, "Inter, sans-serif");
        const leftLabelWidth = settings.showYAxis
            ? Math.min(
                Math.max(60, Math.round(this.context.width * 0.35)),
                Math.max(60, Math.ceil(maxYLabelWidth + 18))
            )
            : 20;

        // Smart rotation detection using actual text measurement
        const availableWidthForLabels = Math.max(0, this.context.width - leftLabelWidth - 20);
        const rotationResult = calculateLabelRotation({
            mode: settings.rotateXLabels,
            labels: xDisplayLabels,
            availableWidth: availableWidthForLabels,
            fontSize: xAxisFontSize
        });
        let needsRotation = rotationResult.shouldRotate;
        const labelSkipInterval = rotationResult.skipInterval;

        // If auto-rotation decided to rotate, but we are already skipping labels,
        // re-check whether the remaining visible labels can fit without rotation.
        if (settings.rotateXLabels === "auto" && needsRotation && labelSkipInterval > 1 && xValues.length > 1) {
            const fontFamily = "Segoe UI, sans-serif";
            const padding = 4;
            const visibleIndices: number[] = [];

            for (let i = 0; i < xValues.length; i += labelSkipInterval) {
                visibleIndices.push(i);
            }
            if (visibleIndices[visibleIndices.length - 1] !== xValues.length - 1) {
                visibleIndices.push(xValues.length - 1);
            }

            const visibleLabels = visibleIndices.map(i => xDisplayLabels[i]);
            const maxVisibleWidth = measureMaxLabelWidth(visibleLabels, xAxisFontSize, fontFamily);

            // Matches the scalePoint padding used for the X scale in this chart.
            const scalePointPadding = 0.5;
            const denom = Math.max(1, (xValues.length - 1) + (scalePointPadding * 2));
            const step = availableWidthForLabels / denom;

            let minDelta = Number.POSITIVE_INFINITY;
            for (let j = 1; j < visibleIndices.length; j++) {
                minDelta = Math.min(minDelta, visibleIndices[j] - visibleIndices[j - 1]);
            }
            const minSpacing = Number.isFinite(minDelta) ? (minDelta * step) : availableWidthForLabels;

            if ((maxVisibleWidth + padding) <= minSpacing) {
                needsRotation = false;
            }
        }

        // Legend position affects margins (dynamic height with wrapping)
        const legendAtTop = settings.legendPosition === "top";
        const legendY = 10;

        const baseMargin = {
            top: 30,
            right: 20,
            bottom: settings.showXAxis ? (needsRotation ? 70 : 45) : 20,
            left: leftLabelWidth
        };

        const chartWidth = this.context.width - baseMargin.left - baseMargin.right;

        // Safety check for valid dimensions
        if (chartWidth <= 0) {
            return;
        }

        const groupCount = groups.length || 1;
        const totalSpacing = (groupCount - 1) * settings.smallMultiples.spacing;
        const colorScale = this.getCategoryColors(yValues, bumpData.categoryColorMap);

        const legendCategories = yValues.slice(0, Math.min(yValues.length, this.settings.maxLegendItems || 10));
        const legendLayout = settings.showLegend
            ? this.buildLegendLayout(legendCategories, chartWidth, legendFontSize)
            : { items: [], height: 0, rowHeight: 0 };

        const margin = {
            ...baseMargin,
            top: (settings.showLegend && legendAtTop) ? (legendY + legendLayout.height + 20) : baseMargin.top
        };

        const bottomLegendBlockHeight = (settings.showLegend && !legendAtTop)
            ? (legendLayout.height + 15)
            : 0;

        const availableHeight = this.context.height - margin.top - margin.bottom - totalSpacing - bottomLegendBlockHeight;

        // Safety check for valid dimensions
        if (availableHeight <= 0) {
            return;
        }

        // Render legend at top if configured
        if (settings.showLegend && legendAtTop) {
            this.renderBumpLegend(colorScale, legendLayout, margin.left, legendY);
        }

        let currentY = margin.top;

        groups.forEach((groupName, groupIndex) => {
            const groupHeight = availableHeight / groupCount;
            const groupData = data.dataPoints.filter(d => d.groupValue === groupName);
            const groupYValues = [...new Set(groupData.map(d => d.yValue))].sort();

            const panelGroup = this.context.container.append("g")
                .attr("class", "bump-chart-panel")
                .attr("transform", `translate(${margin.left}, ${currentY})`);

            // Group title
            if (settings.smallMultiples.showTitle && groupName !== "All") {
                const titleSpacing = settings.smallMultiples.titleSpacing || 25;
                const titleFontSize = this.getResponsiveFontSize(settings.smallMultiples.titleFontSize, 10, 24);
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

            // Scales
            const xScale = d3.scalePoint<string>()
                .domain(xValues)
                .range([0, chartWidth])
                .padding(0.5);

            const effectiveMaxRank = maxRank || yValues.length || 1;
            const yScale = d3.scaleLinear()
                .domain([1, effectiveMaxRank])
                .range([15, groupHeight - 15]);

            // Line generator
            const line = d3.line<BumpChartDataPoint>()
                .x(d => xScale(d.xValue) ?? 0)
                .y(d => yScale(d.rank))
                .curve(d3.curveMonotoneX);

            // FIRST: Draw grid lines (behind everything)
            if (settings.showYAxis) {
                for (let rank = 1; rank <= effectiveMaxRank; rank++) {
                    const y = yScale(rank);
                    panelGroup.append("line")
                        .attr("class", "grid-line")
                        .attr("x1", 0)
                        .attr("x2", chartWidth)
                        .attr("y1", y)
                        .attr("y2", y)
                        .attr("stroke", "#f0f0f0")
                        .attr("stroke-width", 1);
                }
            }

            // SECOND: Draw lines for each category
            groupYValues.forEach(yVal => {
                const seriesData = rankedData.get(yVal);
                if (!seriesData || seriesData.length === 0) return;

                const points = seriesData.filter(d => d.groupValue === groupName);
                if (points.length === 0) return;

                const color = colorScale(yVal);

                panelGroup.append("path")
                    .datum(points)
                    .attr("class", "bump-line")
                    .attr("d", line)
                    .attr("fill", "none")
                    .attr("stroke", color)
                    .attr("stroke-width", settings.bumpChart.lineThickness)
                    .attr("stroke-linecap", "round")
                    .attr("stroke-linejoin", "round");
            });

            // THIRD: Draw markers (on top of lines)
            if (settings.bumpChart.showMarkers) {
                groupYValues.forEach(yVal => {
                    const seriesData = rankedData.get(yVal);
                    if (!seriesData || seriesData.length === 0) return;

                    const points = seriesData.filter(d => d.groupValue === groupName);
                    if (points.length === 0) return;

                    const color = colorScale(yVal);

                    points.forEach(point => {
                        const cx = xScale(point.xValue) ?? 0;
                        const cy = yScale(point.rank);
                        const periodLabel = xLabelByValue.get(point.xValue) ?? point.xValue;

                        const marker = panelGroup.append("circle")
                            .attr("class", "bump-marker")
                            .attr("cx", cx)
                            .attr("cy", cy)
                            .attr("r", settings.bumpChart.markerSize / 2)
                            .attr("fill", color)
                            .attr("stroke", color)
                            .attr("stroke-width", 1);

                        this.addTooltip(marker as any, [
                            { displayName: "Rank", value: `#${point.rank}` },
                            { displayName: "Value", value: point.value.toLocaleString() },
                            ...(groupName !== "All" ? [{ displayName: "Group", value: groupName }] : [])
                        ], { title: yVal, subtitle: periodLabel, color });
                    });
                });
            }

            // Y-axis: Category labels on LEFT (colored to match lines)
            if (settings.showYAxis) {
                // Get the first data point for each category to find their starting rank
                groupYValues.forEach(yVal => {
                    const seriesData = rankedData.get(yVal);
                    if (!seriesData || seriesData.length === 0) return;

                    const points = seriesData.filter(d => d.groupValue === groupName);
                    if (points.length === 0) return;

                    const firstPoint = points[0];
                    const color = colorScale(yVal);
                    const maxLabelWidth = Math.max(0, margin.left - 18);
                    const displayLabel = formatLabel(yVal, maxLabelWidth, yAxisFontSize);

                    const label = panelGroup.append("text")
                        .attr("class", "y-axis-label")
                        .attr("x", -8)
                        .attr("y", Math.round(yScale(firstPoint.rank)))
                        .attr("dy", "0.35em")
                        .attr("text-anchor", "end")
                        .attr("font-size", `${yAxisFontSize}px`)
                        .attr("fill", color)
                        .text(displayLabel);

                    if (displayLabel !== yVal) {
                        this.addTooltip(label as any, [{ displayName: "Category", value: yVal }]);
                    }
                });
            }

            // X-axis (only on last panel)
            if (settings.showXAxis && groupIndex === groups.length - 1) {
                const xAxisGroup = panelGroup.append("g")
                    .attr("class", "x-axis")
                    .attr("transform", `translate(0, ${groupHeight + 5})`);

                // Use smart rotation result
                const shouldRotate = needsRotation;
                const skipInterval = labelSkipInterval;

                xValues.forEach((xVal, i) => {
                    // Skip labels based on calculated interval
                    if (skipInterval > 1 && i % skipInterval !== 0 && i !== xValues.length - 1) {
                        return;
                    }

                    const x = Math.round(xScale(xVal) ?? 0);
                    const text = xAxisGroup.append("text")
                        .attr("x", x)
                        .attr("y", shouldRotate ? 5 : 12)
                        .attr("font-size", `${xAxisFontSize}px`)
                        .attr("fill", "#666")
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

            currentY += groupHeight + settings.smallMultiples.spacing;
        });

        // Legend at bottom if configured
        if (settings.showLegend && !legendAtTop) {
            const bottomY = this.context.height - legendLayout.height - 5;
            this.renderBumpLegend(colorScale, legendLayout, margin.left, bottomY);
        }
    }

    private buildLegendLayout(
        categories: string[],
        availableWidth: number,
        fontSize: number
    ): { items: Array<{ category: string; displayText: string; x: number; y: number }>; height: number; rowHeight: number } {
        const boxSize = 12;
        const gapAfterBox = 6;
        const itemGap = 14;
        const rowGap = 8;
        const rowHeight = Math.max(14, fontSize + 4);

        let x = 0;
        let y = 0;
        const items: Array<{ category: string; displayText: string; x: number; y: number }> = [];

        for (const category of categories) {
            const maxTextWidth = Math.max(0, availableWidth - (boxSize + gapAfterBox));
            const displayText = formatLabel(category, maxTextWidth, fontSize);
            const textWidth = measureTextWidth(displayText, fontSize, "Inter, sans-serif");
            const itemWidth = boxSize + gapAfterBox + textWidth + itemGap;

            if (x > 0 && (x + itemWidth) > availableWidth) {
                x = 0;
                y += rowHeight + rowGap;
            }

            items.push({ category, displayText, x, y });
            x += itemWidth;
        }

        const height = items.length === 0 ? 0 : (y + rowHeight);
        return { items, height, rowHeight };
    }

    private renderBumpLegend(
        colorScale: d3.ScaleOrdinal<string, string, never>,
        layout: { items: Array<{ category: string; displayText: string; x: number; y: number }>; height: number; rowHeight: number },
        x: number,
        y: number
    ): void {
        const legendGroup = this.context.container.append("g")
            .attr("class", "bump-legend")
            .attr("transform", `translate(${Math.round(x)}, ${Math.round(y)})`);

        const fontSize = this.getResponsiveFontSize(this.settings.legendFontSize || 11, 9, 16);

        layout.items.forEach(item => {
            const itemGroup = legendGroup.append("g")
                .attr("class", "bump-legend-item")
                .attr("transform", `translate(${Math.round(item.x)}, ${Math.round(item.y)})`);

            itemGroup.append("rect")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", 12)
                .attr("height", 12)
                .attr("rx", 2)
                .attr("fill", colorScale(item.category));

            itemGroup.append("text")
                .attr("x", 16)
                .attr("y", 10)
                .attr("font-size", `${fontSize}px`)
                .attr("fill", "#555")
                .text(item.displayText);

            if (item.displayText !== item.category) {
                this.addTooltip(itemGroup as any, [{ displayName: "Category", value: item.category }], { title: item.category, color: colorScale(item.category) });
            }
        });
    }
}
