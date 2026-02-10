"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, calculateLabelRotation, formatLabel, measureMaxLabelWidth, formatMeasureValue } from "@pbi-visuals/shared";
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
        const totalRowKey = heatmapData.totalRowKey;
        const totalColKey = heatmapData.totalColumnKey;
        const hasTotalRow = Boolean(settings.heatmap.showRowTotals);
        const hasTotalCol = Boolean(settings.heatmap.showColumnTotals);
        const showGrandTotalCell = Boolean(settings.heatmap.showGrandTotalCell);
        const showOverallTotalHeader = Boolean(settings.heatmap.showOverallTotalHeader);
        const yAxisColor = this.isHighContrastMode() ? this.getThemeForeground(settings.yAxisColor || "#111827") : settings.yAxisColor;
        const xAxisColor = this.isHighContrastMode() ? this.getThemeForeground(settings.xAxisColor || "#111827") : settings.xAxisColor;

        const yAxisFontSize = this.getEffectiveFontSize(
            settings.textSizes.yAxisFontSize || settings.yAxisFontSize,
            6, 40
        );
        const xAxisFontSize = this.getEffectiveFontSize(
            settings.textSizes.xAxisFontSize || settings.xAxisFontSize,
            6, 40
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

        const legendReserve = { top: 0, right: 0, bottom: 0, left: 0 };

        const titleSpacing = settings.smallMultiples.titleSpacing || 25;
        const panelTitleFontSize = this.getEffectiveFontSize(
            settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize,
            6, 40
        );
        const hasPanelTitles = Boolean(settings.smallMultiples.showTitle && groups.length > 1 && groups.some(g => g !== "All" && g !== "(Blank)"));
        // Reserve just enough room: font ascent (≈fontSize) + a small gap below the title
        const titleReserve = hasPanelTitles ? Math.round(panelTitleFontSize + 6) : 0;
        const interPanelGap = groups.length > 1
            ? (hasPanelTitles ? Math.max(settings.smallMultiples.spacing, titleReserve) : settings.smallMultiples.spacing)
            : 0;

        const xAxisLineHeight = Math.max(10, Math.round(xAxisFontSize * 1.15));
        const xAxisHierarchyHeight = settings.showXAxis ? (xAxis.depth * xAxisLineHeight + 18) : 0;

        const overallHeaderFontSize = this.getEffectiveFontSize(
            Math.max(11, Math.round((settings.textSizes.yAxisFontSize || settings.yAxisFontSize) * 1.05)),
            8, 24
        );
        const overallHeaderReserve = showOverallTotalHeader ? Math.round(overallHeaderFontSize + 14) : 0;

        const margin = {
            top: 12 + legendReserve.top + overallHeaderReserve + settings.heatmap.marginTop + titleReserve,
            right: 12 + legendReserve.right + settings.heatmap.marginRight,
            bottom: 12 + legendReserve.bottom + xAxisHierarchyHeight + settings.heatmap.marginBottom,
            left: (settings.heatmap.enableHorizontalScroll ? 0 : 12) + legendReserve.left + (settings.heatmap.enableHorizontalScroll ? 0 : settings.heatmap.marginLeft)
        };

        const viewportWidth = this.context.width;
        const viewportHeight = this.context.height;
        const baseChartWidth = Math.max(40, viewportWidth - margin.left - margin.right);
        const requestedMinCellWidth = Math.max(0, settings.heatmap.minCellWidth);
        const hasMinCellWidth = requestedMinCellWidth > 0;
        const minCellWidth = hasMinCellWidth ? Math.max(26, requestedMinCellWidth) : 0;
        const minColumnStep = hasMinCellWidth ? (minCellWidth + settings.heatmap.cellPadding) : 0;
        const requiredPanelWidth = maxYHeaderWidthAcrossGroups + Math.max(1, xLeafKeys.length) * minColumnStep;
        const chartWidth = settings.heatmap.enableHorizontalScroll && hasMinCellWidth
            ? Math.max(baseChartWidth, requiredPanelWidth)
            : baseChartWidth;
        const renderWidth = Math.max(viewportWidth, Math.ceil(margin.left + chartWidth + margin.right));

        const groupCount = groups.length;
        const totalSpacing = (groupCount - 1) * interPanelGap;
        const baseAvailableHeight = Math.max(40, viewportHeight - margin.top - margin.bottom - totalSpacing);
        const baseGroupHeight = baseAvailableHeight / Math.max(1, groupCount);

        const minCellHeight = 18;
        const groupHeights = groups.map((groupName) => {
            const yAxis = heatmapData.yAxisByGroup.get(groupName);
            const rowCount = yAxis?.leafKeys?.length
                ? yAxis.leafKeys.length
                : Math.max(1, new Set(dataPoints.filter(d => d.groupValue === groupName).map(d => d.yValue)).size);
            if (!settings.heatmap.enableVerticalScroll) {
                return baseGroupHeight;
            }
            const requiredHeight = rowCount * (minCellHeight + settings.heatmap.cellPadding);
            return Math.max(baseGroupHeight, requiredHeight);
        });
        const plotHeight = groupHeights.reduce((sum, h) => sum + h, 0) + totalSpacing;
        const renderHeight = Math.max(viewportHeight, Math.ceil(margin.top + plotHeight + margin.bottom));

        this.context.svg
            .attr("width", renderWidth)
            .attr("height", renderHeight)
            .attr("viewBox", `0 0 ${renderWidth} ${renderHeight}`);

        // Use custom min/max colors from settings
        const colorScale = d3.scaleSequential()
            .domain([0, maxValue])
            .interpolator(d3.interpolate(settings.heatmap.minColor, settings.heatmap.maxColor));

        let currentY = margin.top;

        groups.forEach((groupName, groupIndex) => {
            const groupData = dataPoints.filter(d => d.groupValue === groupName);
            const groupTotals = heatmapData.totalsByGroup.get(groupName);
            const yAxis = heatmapData.yAxisByGroup.get(groupName);
            const groupYLeafKeys = yAxis?.leafKeys ?? [...new Set(groupData.map(d => d.yValue))];
            const groupHeight = groupHeights[groupIndex] ?? baseGroupHeight;

            const yHeaderWidths = settings.showYAxis && yAxis
                ? this.getAxisLevelWidths(yAxis, yAxisFontSize, maxYHeaderPerLevel)
                : [];
            const yHeaderWidth = settings.showYAxis ? maxYHeaderWidthAcrossGroups : 0;

            const gridAvailableWidth = Math.max(40, chartWidth - yHeaderWidth);
            const minRenderedCellWidth = settings.heatmap.enableHorizontalScroll && hasMinCellWidth ? minCellWidth : 26;
            const cellWidth = Math.max(minRenderedCellWidth, gridAvailableWidth / Math.max(1, xLeafKeys.length) - settings.heatmap.cellPadding);
            // Keep a stable inter-panel gap by ensuring each panel's grid fits inside `groupHeight`.
            // When vertical scroll is OFF, shrink cells (and padding if needed) rather than letting
            // a min cell height overflow into the inter-group spacing.
            const rowCount = Math.max(1, groupYLeafKeys.length);
            const baseStepY = groupHeight / rowCount;
            let padY = settings.heatmap.cellPadding;
            let cellHeight = baseStepY - padY;
            if (settings.heatmap.enableVerticalScroll) {
                // With vertical scroll enabled, we allow the visual to grow and the container to scroll.
                // Keep a readable minimum.
                cellHeight = Math.max(18, cellHeight);
            } else {
                // If padding would make the cell negative, drop padding to preserve the panel gap.
                if (cellHeight < 0) {
                    padY = 0;
                    cellHeight = baseStepY;
                }
                // Allow fractional/tiny cells when height is very constrained; better than overlap.
                cellHeight = Math.max(0, cellHeight);
            }
            const stepX = cellWidth + settings.heatmap.cellPadding;
            const stepY = cellHeight + padY;

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

            const panelBaseX = Math.round(margin.left + offsetX);
            const panelBaseY = Math.round(currentY + offsetY);
            const pinnedLeftX = settings.heatmap.enableHorizontalScroll ? 0 : panelBaseX;

            const panelGroup = this.context.container.append("g")
                .attr("class", "panel panel-scroll-layer")
                .attr("transform", `translate(${panelBaseX}, ${panelBaseY})`);

            const pinnedLayer = this.context.container.append("g")
                .attr("class", "panel panel-fixed pinned-y-layer")
                .attr("data-pin-left", `${pinnedLeftX}`)
                .attr("data-base-y", `${panelBaseY}`)
                .attr("transform", `translate(${pinnedLeftX}, ${panelBaseY})`);

            // Group title — placed just above the grid with a small gap
            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All" && groupName !== "(Blank)") {
                const titleFontSize = this.getEffectiveFontSize(
                    settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize,
                    6, 40
                );
                const displayTitle = formatLabel(groupName, chartWidth, titleFontSize);
                // Position the text baseline so the title sits a few px above the grid
                const title = pinnedLayer.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", -6)
                    .attr("font-size", `${titleFontSize}px`)
                    .attr("font-weight", "600")
                    .attr("fill", this.getTitleTextColor("#333"))
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
                    6,
                    16
                );
            const canRenderValueLabel = cellWidth >= 16 && cellHeight >= 12;

            // Render cells and value labels as SVG (crisp at any DPI, native rendering)
            for (let yIndex = 0; yIndex < groupYLeafKeys.length; yIndex++) {
                const yKey = groupYLeafKeys[yIndex];
                const isTotalRow = hasTotalRow && yKey === totalRowKey;
                for (let xIndex = 0; xIndex < xLeafKeys.length; xIndex++) {
                    const xKey = xLeafKeys[xIndex];
                    const isTotalCol = hasTotalCol && xKey === totalColKey;
                    const isTotalCell = isTotalRow || isTotalCol;
                    const isGrandCorner = isTotalRow && isTotalCol;

                    const key = `${xKey}\u001e${yKey}`;
                    const dataPoint = dataLookup.get(key);
                    let value = dataPoint?.value ?? 0;
                    let showValueLabel = canRenderValueLabel && settings.heatmap.showValues && value > 0;

                    if (isTotalCell && groupTotals) {
                        if (isGrandCorner) {
                            value = showGrandTotalCell ? groupTotals.grandTotal : 0;
                            showValueLabel = canRenderValueLabel && showGrandTotalCell;
                        } else if (isTotalRow) {
                            value = groupTotals.rowTotalsByX.get(xKey) ?? 0;
                            showValueLabel = canRenderValueLabel;
                        } else if (isTotalCol) {
                            value = groupTotals.colTotalsByY.get(yKey) ?? 0;
                            showValueLabel = canRenderValueLabel;
                        }
                    }

                    const x = this.snapToPixelInt(yHeaderWidth + xIndex * stepX);
                    const y = this.snapToPixelInt(yIndex * stepY);
                    const totalsFill = this.isHighContrastMode()
                        ? this.getThemeBackground("#e5e7eb")
                        : "#f3f4f6";
                    const fill = isTotalCell
                        ? totalsFill
                        : (
                            value === 0
                                ? (this.isHighContrastMode() ? this.getThemeBackground("#f0f0f0") : "#f0f0f0")
                                : (colorScale(value) as string)
                        );

                    // Cell rectangle
                    const cell = panelGroup.append("rect")
                        .attr("class", isTotalCell ? "heatmap-cell heatmap-total-cell" : "heatmap-cell")
                        .attr("data-selection-key", `${xKey}\u001e${yKey}`)
                        .attr("x", x)
                        .attr("y", y)
                        .attr("width", this.snapToPixelInt(cellWidth))
                        .attr("height", this.snapToPixelInt(cellHeight))
                        .attr("rx", 3)
                        .attr("fill", fill)
                        .attr("stroke", this.getThemeBackground("#ffffff"))
                        .attr("stroke-width", 1);

                    // Tooltip for cell
                    const valueLabel = heatmapData.valueDisplayName || "Value";

                    if (isTotalCell) {
                        const totalKind = isGrandCorner
                            ? "Grand total"
                            : (isTotalRow ? "Total (all rows)" : "Total (all columns)");
                        const xDisplay = (xAxis.keyToPath.get(xKey) ?? [xKey]).filter(Boolean).join(" • ") || "Total";
                        const yDisplay = (yAxis?.keyToPath.get(yKey) ?? [yKey]).filter(Boolean).join(" • ") || "Total";

                        this.addTooltip(cell as any, [
                            { displayName: totalKind, value: formatMeasureValue(value, heatmapData.valueFormatString), color: fill },
                            ...(isTotalRow ? [] : [{ displayName: "Row", value: yDisplay }]),
                            ...(isTotalCol ? [] : [{ displayName: "Column", value: xDisplay }]),
                            ...(groupName !== "All" && groupName !== "(Blank)" ? [{ displayName: "Group", value: groupName }] : [])
                        ], {
                            title: totalKind,
                            subtitle: `${isTotalRow ? xDisplay : yDisplay}`,
                            color: fill
                        });
                    } else {
                        const yPath = yAxis?.keyToPath.get(yKey) ?? [yKey];
                        const xPath = xAxis.keyToPath.get(xKey) ?? [xKey];
                        const yPathFiltered = yPath.filter(Boolean);
                        const xPathFiltered = xPath.filter(Boolean);
                        const yDisplay = yPathFiltered.join(" • ");
                        const xDisplay = xPathFiltered.join(" • ");

                        this.addTooltip(cell as any, [
                            { displayName: valueLabel, value: formatMeasureValue(value, heatmapData.valueFormatString), color: fill },
                            { displayName: "Row", value: yDisplay },
                            { displayName: "Column", value: xDisplay },
                            ...(groupName !== "All" && groupName !== "(Blank)" ? [{ displayName: "Group", value: groupName }] : [])
                        ], {
                            title: yPathFiltered[yPathFiltered.length - 1] ?? yKey,
                            subtitle: xDisplay,
                            color: fill
                        });
                    }

                    // Value label inside cell
                    if (showValueLabel) {
                        const textColor = this.getContrastColor(fill);

                        panelGroup.append("text")
                            .attr("class", isTotalCell ? "cell-value total-value" : "cell-value")
                            .attr("x", this.snapToPixelInt(x + cellWidth / 2))
                            .attr("y", this.snapToPixelInt(y + cellHeight / 2))
                            .attr("dy", "0.35em")
                            .attr("text-anchor", "middle")
                            .attr("font-size", `${cellFontSize}px`)
                            .attr("font-weight", isTotalCell ? "700" : "600")
                            .attr("fill", textColor)
                            .attr("pointer-events", "none")
                            .text(formatMeasureValue(value, heatmapData.valueFormatString));
                    }
                }
            }

            // Hierarchical Y-axis headers (span labels)
            if (settings.showYAxis && yAxis && yAxis.depth > 0) {
                if (settings.heatmap.enableHorizontalScroll && yHeaderWidth > 0) {
                    pinnedLayer.append("rect")
                        .attr("class", "pinned-y-background")
                        .attr("x", 0)
                        .attr("y", 0)
                        .attr("width", Math.round(yHeaderWidth + 1))
                        .attr("height", Math.max(0, Math.round(gridActualHeight)))
                        .attr("fill", this.getThemeBackground("#ffffff"))
                        .attr("pointer-events", "none");
                }

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

                        const t = pinnedLayer.append("text")
                            .attr("class", "y-axis-label")
                            .attr("x", Math.round(colX + 4))
                            .attr("y", yCenter)
                            .attr("dy", "0.35em")
                            .attr("text-anchor", "start")
                            .attr("font-size", `${yAxisFontSize}px`)
                            .attr("font-family", settings.yAxisFontFamily)
                            .style("font-weight", settings.yAxisBold ? "700" : "400")
                            .style("font-style", settings.yAxisItalic ? "italic" : "normal")
                            .style("text-decoration", settings.yAxisUnderline ? "underline" : "none")
                            .attr("fill", yAxisColor)
                            .text(textValue);

                        if (textValue !== span.label) {
                            this.addTooltip(t as any, [{ displayName: "Row", value: span.label }]);
                        }
                    });
                }
            }

            // Hierarchical X-axis headers (only on last group)
            if (settings.showXAxis && groupIndex === groups.length - 1 && xAxis.depth > 0) {
                const renderXAxisHeaders = (
                    axisLayer: d3.Selection<SVGGElement, unknown, null, undefined>,
                    axisStartY: number
                ) => {
                    const depth = xAxis.depth;

                    // Smart rotation/skip for leaf level only (deepest)
                    const leafLabels = xAxis.leafPaths.map(p => p[p.length - 1] ?? "");
                    const rotationResult = calculateLabelRotation({
                        mode: settings.rotateXLabels,
                        labels: leafLabels,
                        availableWidth: gridActualWidth,
                        fontSize: xAxisFontSize,
                        fontFamily: settings.xAxisFontFamily
                    });
                    const shouldRotate = rotationResult.shouldRotate;
                    const skipInterval = rotationResult.skipInterval;

                    for (let level = 0; level < depth; level++) {
                        const y = axisStartY + level * xAxisLineHeight;
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

                            const t = axisLayer.append("text")
                                .attr("class", "x-axis-label")
                                .attr("x", x)
                                .attr("y", y)
                                .attr("dy", "0.8em")
                                .attr("text-anchor", "middle")
                                .attr("font-size", `${xAxisFontSize}px`)
                                .attr("font-family", settings.xAxisFontFamily)
                                .style("font-weight", settings.xAxisBold ? "700" : "400")
                                .style("font-style", settings.xAxisItalic ? "italic" : "normal")
                                .style("text-decoration", settings.xAxisUnderline ? "underline" : "none")
                                .attr("fill", xAxisColor)
                                .text(displayText);

                            if (displayText !== span.label) {
                                this.addTooltip(t as any, [{ displayName: "Column", value: span.label }]);
                            }

                            if (isLeafLevel && shouldRotate) {
                                t.attr("transform", `rotate(-45, ${x}, ${y})`).attr("text-anchor", "end");
                            }
                        });
                    }
                };

                if (settings.heatmap.enableVerticalScroll) {
                    const pinnedAxisY = Math.round(this.context.height - margin.bottom + 12);
                    const pinnedXAxisLayer = this.context.container.append("g")
                        .attr("class", "panel pinned-x-layer")
                        .attr("data-base-x", `${panelBaseX}`)
                        .attr("data-pin-y", `${pinnedAxisY}`)
                        .attr("transform", `translate(${panelBaseX}, ${pinnedAxisY})`);

                    pinnedXAxisLayer.append("rect")
                        .attr("class", "pinned-x-background")
                        .attr("x", 0)
                        .attr("y", -4)
                        .attr("width", Math.max(0, Math.round(chartActualWidth + 2)))
                        .attr("height", Math.max(0, xAxisHierarchyHeight + 8))
                        .attr("fill", this.getThemeBackground("#ffffff"))
                        .attr("pointer-events", "none");

                    renderXAxisHeaders(pinnedXAxisLayer, 0);
                } else {
                    const axisBaseY = Math.round(gridActualHeight + 12);
                    renderXAxisHeaders(panelGroup, axisBaseY);
                }
            }

            // Visible separator centered in the inter-panel gap (keeps panels distinct).
            if (groups.length > 1 && groupIndex < groups.length - 1) {
                const gapTopY = Math.round(currentY + groupHeight);
                const gapH = Math.max(0, Math.round(interPanelGap));
                // Place the separator in the upper portion of the gap so the next panel's title
                // has breathing room below it.
                const sepOffset = gapH ? Math.round(gapH * 0.25) : 0;
                const sepY = gapTopY + sepOffset;
                const sepStroke = this.isHighContrastMode()
                    ? this.getThemeForeground("#6b7280")
                    : "#eef2f7";

                this.context.container.append("line")
                    .attr("class", "group-separator")
                    .attr("x1", Math.round(margin.left))
                    .attr("x2", Math.round(margin.left + chartWidth))
                    .attr("y1", sepY)
                    .attr("y2", sepY)
                    .attr("stroke", sepStroke)
                    .attr("stroke-width", 1)
                    .attr("stroke-opacity", this.isHighContrastMode() ? 1 : 0.9)
                    .attr("pointer-events", "none");
            }

            currentY += groupHeight + interPanelGap;
        });

        // Pinned overall header (stays visible while scrolling) - add last so it stays on top.
        if (showOverallTotalHeader) {
            const pinnedUi = this.context.container.append("g")
                .attr("class", "pinned-ui-layer")
                .attr("data-base-x", "0")
                .attr("data-base-y", "0")
                .attr("transform", "translate(0, 0)");

            pinnedUi.append("rect")
                .attr("class", "pinned-ui-background")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", Math.max(0, Math.round(this.context.width)))
                .attr("height", Math.max(0, Math.round(overallHeaderReserve)))
                .attr("fill", this.getThemeBackground("#ffffff"))
                .attr("pointer-events", "none");

            const overallLabel = `Overall total: ${formatMeasureValue(heatmapData.overallGrandTotal, heatmapData.valueFormatString)}`;
            pinnedUi.append("text")
                .attr("class", "overall-total-label")
                .attr("x", 12)
                .attr("y", Math.max(0, Math.round(overallHeaderReserve - 6)))
                .attr("font-size", `${overallHeaderFontSize}px`)
                .attr("font-weight", "600")
                .attr("fill", this.getTitleTextColor("#111827"))
                .text(overallLabel);
        }

        // Heatmap has no legend by design (tooltips carry the details).
    }
}
