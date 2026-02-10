"use strict";

import {
    d3,
    BaseRenderer,
    RenderContext,
    ChartData,
    calculateLabelRotation,
    formatLabel,
    measureMaxLabelWidth,
    formatMeasureValue
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
        const yAxisColor = this.isHighContrastMode() ? this.getThemeForeground(settings.yAxisColor || "#111827") : settings.yAxisColor;
        const xAxisColor = this.isHighContrastMode() ? this.getThemeForeground(settings.xAxisColor || "#111827") : settings.xAxisColor;

        // Safety check
        if (!xValues || xValues.length === 0 || !yValues || yValues.length === 0) {
            this.renderNoData();
            return;
        }

        const yAxisFontSize = this.getEffectiveFontSize(
            settings.textSizes.yAxisFontSize > 0 ? settings.textSizes.yAxisFontSize : settings.yAxisFontSize,
            6,
            40
        );
        const xAxisFontSize = this.getEffectiveFontSize(
            settings.textSizes.xAxisFontSize > 0 ? settings.textSizes.xAxisFontSize : settings.xAxisFontSize,
            6,
            40
        );
        const legendFontSize = this.getEffectiveFontSize(
            settings.textSizes.legendFontSize > 0 ? settings.textSizes.legendFontSize : (settings.legendFontSize || 11),
            6,
            40
        );
        const endLabelFontSize = this.getEffectiveFontSize(
            settings.textSizes.endLabelFontSize > 0 ? settings.textSizes.endLabelFontSize : yAxisFontSize,
            6,
            40
        );

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
        const maxYLabelWidth = measureMaxLabelWidth(yValues, yAxisFontSize, settings.yAxisFontFamily);
        const leftLabelWidth = settings.showYAxis
            ? Math.min(
                Math.max(60, Math.round(this.context.width * 0.35)),
                Math.max(60, Math.ceil(maxYLabelWidth + 18))
            )
            : 20;

        const showLegend = bumpData.hasLegendRoleData;
        const legendCategories = showLegend ? yValues : [];
        const legendReserve = showLegend
            ? this.getLegendReservation({ isOrdinal: true, categories: legendCategories, legendFontSize })
            : { top: 0, right: 0, bottom: 0, left: 0 };

        // Smart rotation detection using the actual plot width (after legend docking)
        const availableWidthForLabels = Math.max(
            0,
            this.context.width - (leftLabelWidth + legendReserve.left) - (12 + legendReserve.right)
        );
        const rotationResult = calculateLabelRotation({
            mode: settings.rotateXLabels,
            labels: xDisplayLabels,
            availableWidth: availableWidthForLabels,
            fontSize: xAxisFontSize,
            fontFamily: settings.xAxisFontFamily
        });
        let needsRotation = rotationResult.shouldRotate;
        const labelSkipInterval = rotationResult.skipInterval;

        // If auto-rotation decided to rotate, but we are already skipping labels,
        // re-check whether the remaining visible labels can fit without rotation.
        if (settings.rotateXLabels === "auto" && needsRotation && labelSkipInterval > 1 && xValues.length > 1) {
            const fontFamily = settings.xAxisFontFamily;
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

        const baseMargin = {
            top: 12 + titleReserve,
            right: 12,
            bottom: settings.showXAxis ? (needsRotation ? 45 : 28) : 12,
            left: leftLabelWidth
        };

        const margin = {
            top: baseMargin.top + legendReserve.top,
            right: baseMargin.right + legendReserve.right,
            bottom: baseMargin.bottom + legendReserve.bottom,
            left: baseMargin.left + legendReserve.left
        };

        const chartWidth = this.context.width - margin.left - margin.right;

        // Safety check for valid dimensions
        if (chartWidth <= 0) {
            return;
        }

        const groupCount = groups.length || 1;
        const totalSpacing = (groupCount - 1) * interPanelGap;
        const colorScale = this.getCategoryColors(yValues, bumpData.categoryColorMap);

        const availableHeight = this.context.height - margin.top - margin.bottom - totalSpacing;

        // Safety check for valid dimensions
        if (availableHeight <= 0) {
            return;
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
                    const y = this.snapToPixel(yScale(rank));
                    panelGroup.append("line")
                        .attr("class", "grid-line")
                        .attr("x1", 0)
                        .attr("x2", chartWidth)
                        .attr("y1", y)
                        .attr("y2", y)
                        .attr("stroke", this.getGridStroke("#f0f0f0"))
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
                    .attr("data-selection-key", yVal)
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
                        const valueLabel = bumpData.valueDisplayName || "Value";

                        const marker = panelGroup.append("circle")
                            .attr("class", "bump-marker")
                            .attr("data-selection-key", yVal)
                            .attr("cx", cx)
                            .attr("cy", cy)
                            .attr("r", settings.bumpChart.markerSize / 2)
                            .attr("fill", color)
                            .attr("stroke", color)
                            .attr("stroke-width", 1);

                        this.addTooltip(marker as any, [
                            { displayName: "Rank", value: `#${point.rank}`, color },
                            { displayName: valueLabel, value: formatMeasureValue(point.value, bumpData.valueFormatString), color },
                            ...(groupName !== "All" && groupName !== "(Blank)" ? [{ displayName: "Group", value: groupName }] : [])
                        ], { title: yVal, subtitle: periodLabel, color });
                    });
                });
            }

            const defaultYAxisColor = "#333333";
            const overrideYAxisColor = (settings.yAxisColor || "").toLowerCase() !== defaultYAxisColor;

            // Y-axis: Category labels on LEFT (colored to match lines)
            if (settings.showYAxis) {
                // Get the first data point for each category to find their starting rank
                groupYValues.forEach(yVal => {
                    const seriesData = rankedData.get(yVal);
                    if (!seriesData || seriesData.length === 0) return;

                    const points = seriesData.filter(d => d.groupValue === groupName);
                    if (points.length === 0) return;

                    const firstPoint = points[0];
                    const seriesColor = colorScale(yVal);
                    const maxLabelWidth = Math.max(0, baseMargin.left - 18);
                    const displayLabel = formatLabel(yVal, maxLabelWidth, yAxisFontSize);

                    const label = panelGroup.append("text")
                        .attr("class", "y-axis-label")
                        .attr("x", -8)
                        .attr("y", Math.round(yScale(firstPoint.rank)))
                        .attr("dy", "0.35em")
                        .attr("text-anchor", "end")
                        .attr("font-size", `${yAxisFontSize}px`)
                        .attr("font-family", settings.yAxisFontFamily)
                        .style("font-weight", settings.yAxisBold ? "700" : "400")
                        .style("font-style", settings.yAxisItalic ? "italic" : "normal")
                        .style("text-decoration", settings.yAxisUnderline ? "underline" : "none")
                        .attr("fill", overrideYAxisColor ? yAxisColor : seriesColor)
                        .text(displayLabel);

                    if (displayLabel !== yVal) {
                        this.addTooltip(label as any, [{ displayName: "Category", value: yVal }]);
                    }
                });
            } else {
                // End labels (only when Y-axis labels are hidden)
                groupYValues.forEach(yVal => {
                    const seriesData = rankedData.get(yVal);
                    if (!seriesData || seriesData.length === 0) return;

                    const points = seriesData.filter(d => d.groupValue === groupName);
                    if (points.length === 0) return;

                    const lastPoint = points[points.length - 1];
                    const color = colorScale(yVal);
                    const maxLabelWidth = Math.max(40, Math.round(chartWidth * 0.35));
                    const displayLabel = formatLabel(yVal, maxLabelWidth, endLabelFontSize);

                    const label = panelGroup.append("text")
                        .attr("class", "end-label")
                        .attr("x", Math.round(chartWidth - 8))
                        .attr("y", Math.round(yScale(lastPoint.rank)))
                        .attr("dy", "0.35em")
                        .attr("text-anchor", "end")
                        .attr("font-size", `${endLabelFontSize}px`)
                        .attr("font-family", settings.yAxisFontFamily)
                        .style("font-weight", settings.yAxisBold ? "700" : "400")
                        .style("font-style", settings.yAxisItalic ? "italic" : "normal")
                        .style("text-decoration", settings.yAxisUnderline ? "underline" : "none")
                        .attr("fill", overrideYAxisColor ? yAxisColor : color)
                        .text(displayLabel);

                    if (displayLabel !== yVal) {
                        this.addTooltip(label as any, [{ displayName: "Category", value: yVal }], { title: yVal, color });
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
                    const prevX = xScale(xValues[prevIdx]) ?? 0;
                    const lastX = xScale(xValues[lastIdx]) ?? 0;
                    const gap = Math.abs(lastX - prevX);
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

                xValues.forEach((xVal, i) => {
                    if (!visibleSet.has(i)) return;

                    const x = Math.round(xScale(xVal) ?? 0);

                    const text = xAxisGroup.append("text")
                        .attr("x", x)
                        .attr("y", shouldRotate ? 5 : 12)
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

        // Legend (data-driven; docked, never overlaps content)
        if (showLegend) {
            this.renderLegend(colorScale, data.maxValue, true, legendCategories, undefined, undefined, {
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
