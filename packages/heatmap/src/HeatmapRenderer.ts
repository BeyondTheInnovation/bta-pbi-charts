"use strict";

import * as d3 from "d3";
import { BaseRenderer, RenderContext, ChartData, calculateLabelRotation, formatLabel, measureMaxLabelWidth } from "@pbi-visuals/shared";
import { IHeatmapVisualSettings } from "./settings";
import { AxisHierarchy, HeatmapMatrixData } from "./HeatmapTransformer";

export class HeatmapRenderer extends BaseRenderer<IHeatmapVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    private getAxisLevelWidths(axis: AxisHierarchy, fontSize: number, maxPerLevel: number): number[] {
        const widths: number[] = [];
        for (let level = 0; level < axis.depth; level++) {
            const labels = axis.spansByLevel[level]?.map(s => s.label) ?? [];
            const w = labels.length ? measureMaxLabelWidth(labels, fontSize) : 0;
            widths.push(Math.min(maxPerLevel, Math.ceil(w + 12)));
        }
        return widths;
    }

    private sumWidths(widths: number[], gap: number): number {
        if (widths.length === 0) return 0;
        return widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * gap;
    }

    public render(data: ChartData, settings: IHeatmapVisualSettings): void {
        this.settings = settings;

        if (data.dataPoints.length === 0) {
            this.renderNoData();
            return;
        }

        const heatmapData = data as HeatmapMatrixData;
        const { dataPoints, groups, maxValue } = heatmapData;
        const xAxis = heatmapData.xAxis;
        const xLeafKeys = xAxis.leafKeys;

        const yAxisFontSize = this.getEffectiveFontSize(
            settings.textSizes.yAxisFontSize,
            settings.yAxisFontSize,
            8, 18
        );
        const xAxisFontSize = this.getEffectiveFontSize(
            settings.textSizes.xAxisFontSize,
            settings.xAxisFontSize,
            8, 18
        );

        const headerGap = 8;
        const maxYHeaderPerLevel = 160;
        const maxYHeaderWidthAcrossGroups = settings.showYAxis
            ? Math.max(
                0,
                ...groups.map(g => {
                    const yAxis = heatmapData.yAxisByGroup.get(g);
                    if (!yAxis) return 0;
                    const widths = this.getAxisLevelWidths(yAxis, yAxisFontSize, maxYHeaderPerLevel);
                    return this.sumWidths(widths, headerGap);
                })
            )
            : 0;

        const legendNeedsBottomSpace = settings.showLegend && settings.legendPosition === "bottom";

        const topLegendPadding = settings.showLegend && settings.legendPosition !== "bottom" ? 36 : 0;

        const xAxisLineHeight = Math.max(10, Math.round(xAxisFontSize * 1.15));
        const xAxisHierarchyHeight = settings.showXAxis ? (xAxis.depth * xAxisLineHeight + 18) : 0;

        const margin = {
            top: 40 + topLegendPadding + settings.heatmap.marginTop,
            right: 20 + settings.heatmap.marginRight,
            bottom: (legendNeedsBottomSpace ? 60 : 20) + xAxisHierarchyHeight + settings.heatmap.marginBottom,
            left: 20 + settings.heatmap.marginLeft
        };

        const chartWidth = this.context.width - margin.left - margin.right;
        const groupCount = groups.length;
        const totalSpacing = (groupCount - 1) * settings.smallMultiples.spacing;
        const availableHeight = this.context.height - margin.top - margin.bottom - totalSpacing;

        // Use custom min/max colors from settings
        const colorScale = d3.scaleSequential()
            .domain([0, maxValue])
            .interpolator(d3.interpolate(settings.heatmap.minColor, settings.heatmap.maxColor));

        let currentY = margin.top;

        groups.forEach((groupName, groupIndex) => {
            const groupData = dataPoints.filter(d => d.groupValue === groupName);
            const yAxis = heatmapData.yAxisByGroup.get(groupName);
            const groupYLeafKeys = yAxis?.leafKeys ?? [...new Set(groupData.map(d => d.yValue))];
            const groupHeight = availableHeight / groupCount;

            const yHeaderWidths = settings.showYAxis && yAxis
                ? this.getAxisLevelWidths(yAxis, yAxisFontSize, maxYHeaderPerLevel)
                : [];
            const yHeaderWidth = settings.showYAxis ? maxYHeaderWidthAcrossGroups : 0;

            const gridAvailableWidth = Math.max(40, chartWidth - yHeaderWidth);
            const cellWidth = Math.max(26, gridAvailableWidth / Math.max(1, xLeafKeys.length) - settings.heatmap.cellPadding);
            const cellHeight = Math.max(18, groupHeight / Math.max(1, groupYLeafKeys.length) - settings.heatmap.cellPadding);
            const stepX = cellWidth + settings.heatmap.cellPadding;
            const stepY = cellHeight + settings.heatmap.cellPadding;

            // Calculate chart actual dimensions for alignment
            const gridActualWidth = xLeafKeys.length * stepX;
            const gridActualHeight = groupYLeafKeys.length * stepY;
            const chartActualWidth = yHeaderWidth + gridActualWidth;
            const chartActualHeight = gridActualHeight;

            // Compute horizontal offset based on alignment setting
            let offsetX = 0;
            if (settings.heatmap.horizontalAlignment === "center") {
                offsetX = Math.max(0, (chartWidth - chartActualWidth) / 2);
            } else if (settings.heatmap.horizontalAlignment === "right") {
                offsetX = Math.max(0, chartWidth - chartActualWidth);
            }

            // Compute vertical offset based on alignment setting
            let offsetY = 0;
            if (settings.heatmap.verticalAlignment === "center") {
                offsetY = Math.max(0, (groupHeight - chartActualHeight) / 2);
            } else if (settings.heatmap.verticalAlignment === "bottom") {
                offsetY = Math.max(0, groupHeight - chartActualHeight);
            }

            const panelGroup = this.context.container.append("g")
                .attr("class", "panel")
                .attr("transform", `translate(${Math.round(margin.left + offsetX)}, ${Math.round(currentY + offsetY)})`);

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

            // Data lookup
            const dataLookup = new Map<string, typeof dataPoints[0]>();
            groupData.forEach(d => {
                dataLookup.set(`${d.xValue}\u001e${d.yValue}`, d);
            });

            // Compute font size for value labels
            const cellFontSize = settings.textSizes.valueLabelFontSize > 0
                ? settings.textSizes.valueLabelFontSize
                : this.getProportionalFontSize(
                    Math.min(cellWidth, cellHeight),
                    0.4,
                    8,
                    16
                );

            // Render cells and value labels as SVG (crisp at any DPI, native rendering)
            for (let yIndex = 0; yIndex < groupYLeafKeys.length; yIndex++) {
                const yKey = groupYLeafKeys[yIndex];
                for (let xIndex = 0; xIndex < xLeafKeys.length; xIndex++) {
                    const xKey = xLeafKeys[xIndex];
                    const key = `${xKey}\u001e${yKey}`;
                    const dataPoint = dataLookup.get(key);
                    const value = dataPoint?.value ?? 0;

                    const x = Math.round(yHeaderWidth + xIndex * stepX);
                    const y = Math.round(yIndex * stepY);
                    const fill = value === 0 ? "#f0f0f0" : (colorScale(value) as string);

                    // Cell rectangle
                    const cell = panelGroup.append("rect")
                        .attr("class", "heatmap-cell")
                        .attr("x", x)
                        .attr("y", y)
                        .attr("width", Math.round(cellWidth))
                        .attr("height", Math.round(cellHeight))
                        .attr("rx", 3)
                        .attr("fill", fill)
                        .attr("stroke", "#ffffff")
                        .attr("stroke-width", 1);

                    // Tooltip for cell
                    const yPath = yAxis?.keyToPath.get(yKey) ?? [yKey];
                    const xPath = xAxis.keyToPath.get(xKey) ?? [xKey];
                    const yDisplay = yPath.join(" • ");
                    const xDisplay = xPath.join(" • ");

                    this.addTooltip(cell as any, [
                        { displayName: "Value", value: value.toLocaleString() },
                        { displayName: "Row", value: yDisplay },
                        { displayName: "Column", value: xDisplay },
                        ...(groupName !== "All" ? [{ displayName: "Group", value: groupName }] : [])
                    ], {
                        title: yPath[yPath.length - 1] ?? yKey,
                        subtitle: xDisplay,
                        color: fill
                    });

                    // Value label inside cell
                    if (settings.heatmap.showValues && value > 0) {
                        const textColor = this.getContrastColor(fill);

                        panelGroup.append("text")
                            .attr("class", "cell-value")
                            .attr("x", Math.round(x + cellWidth / 2))
                            .attr("y", Math.round(y + cellHeight / 2))
                            .attr("dy", "0.35em")
                            .attr("text-anchor", "middle")
                            .attr("font-size", `${cellFontSize}px`)
                            .attr("font-weight", "600")
                            .attr("fill", textColor)
                            .attr("pointer-events", "none")
                            .text(String(value));
                    }
                }
            }

            // Hierarchical Y-axis headers (span labels)
            if (settings.showYAxis && yAxis && yAxis.depth > 0) {
                const columnStarts: number[] = [];
                let acc = 0;
                for (let i = 0; i < yHeaderWidths.length; i++) {
                    columnStarts.push(acc);
                    acc += yHeaderWidths[i] + (i === yHeaderWidths.length - 1 ? 0 : headerGap);
                }

                for (let level = 0; level < yAxis.depth; level++) {
                    const colX = columnStarts[level] ?? 0;
                    const colW = yHeaderWidths[level] ?? 0;
                    const spans = yAxis.spansByLevel[level] ?? [];

                    spans.forEach(span => {
                        const yTop = span.startLeafIndex * stepY;
                        const yBottom = span.endLeafIndex * stepY + cellHeight;
                        const yCenter = Math.round((yTop + yBottom) / 2);
                        const textValue = formatLabel(span.label, Math.max(0, colW - 8), yAxisFontSize);

                        const t = panelGroup.append("text")
                            .attr("class", "y-axis-label")
                            .attr("x", Math.round(colX + 4))
                            .attr("y", yCenter)
                            .attr("dy", "0.35em")
                            .attr("text-anchor", "start")
                            .attr("font-size", `${yAxisFontSize}px`)
                            .attr("fill", "#333")
                            .text(textValue);

                        if (textValue !== span.label) {
                            this.addTooltip(t as any, [{ displayName: "Row", value: span.label }]);
                        }
                    });
                }
            }

            // Hierarchical X-axis headers (only on last group)
            if (settings.showXAxis && groupIndex === groups.length - 1 && xAxis.depth > 0) {
                const axisBaseY = Math.round(gridActualHeight + 12);
                const depth = xAxis.depth;

                // Smart rotation/skip for leaf level only (deepest)
                const leafLabels = xAxis.leafPaths.map(p => p[p.length - 1] ?? "");
                const rotationResult = calculateLabelRotation({
                    mode: settings.rotateXLabels,
                    labels: leafLabels,
                    availableWidth: gridActualWidth,
                    fontSize: xAxisFontSize
                });
                const shouldRotate = rotationResult.shouldRotate;
                const skipInterval = rotationResult.skipInterval;

                for (let level = 0; level < depth; level++) {
                    const y = axisBaseY + level * xAxisLineHeight;
                    const spans = xAxis.spansByLevel[level] ?? [];
                    const isLeafLevel = level === depth - 1;

                    spans.forEach((span) => {
                        if (isLeafLevel && skipInterval > 1) {
                            // leaf spans are 1:1 with leaves
                            const leafIndex = span.startLeafIndex;
                            if (leafIndex !== xLeafKeys.length - 1 && leafIndex % skipInterval !== 0) {
                                return;
                            }
                        }

                        const x1 = yHeaderWidth + span.startLeafIndex * stepX + cellWidth / 2;
                        const x2 = yHeaderWidth + span.endLeafIndex * stepX + cellWidth / 2;
                        const x = Math.round((x1 + x2) / 2);

                        const spanWidth = Math.max(0, (span.endLeafIndex - span.startLeafIndex + 1) * stepX - 6);
                        const displayText = formatLabel(span.label, spanWidth, xAxisFontSize);

                        const t = panelGroup.append("text")
                            .attr("class", "x-axis-label")
                            .attr("x", x)
                            .attr("y", y)
                            .attr("dy", "0.8em")
                            .attr("text-anchor", "middle")
                            .attr("font-size", `${xAxisFontSize}px`)
                            .attr("fill", "#666")
                            .text(displayText);

                        if (displayText !== span.label) {
                            this.addTooltip(t as any, [{ displayName: "Column", value: span.label }]);
                        }

                        if (isLeafLevel && shouldRotate) {
                            t.attr("transform", `rotate(-45, ${x}, ${y})`).attr("text-anchor", "end");
                        }
                    });
                }
            }

            currentY += groupHeight + settings.smallMultiples.spacing;
        });

        // Color legend with custom gradient colors
        this.renderLegend(colorScale, maxValue, false, undefined, undefined, {
            min: settings.heatmap.minColor,
            max: settings.heatmap.maxColor
        });
    }
}
