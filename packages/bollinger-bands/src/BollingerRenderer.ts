"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, calculateLabelRotation, formatLabel, formatMeasureValue, measureMaxLabelWidth } from "@pbi-visuals/shared";
import { IBollingerVisualSettings } from "./settings";
import { BollingerChartData, BollingerDataPoint } from "./BollingerTransformer";

export class BollingerRenderer extends BaseRenderer<IBollingerVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IBollingerVisualSettings): void {
        this.settings = settings;
        const bollingerData = data as BollingerChartData;

        if (data.dataPoints.length === 0) {
            this.renderNoData();
            return;
        }

        const { xValues, groups, bollingerPoints, minValue, maxValue } = bollingerData;
        const bollinger = settings.bollinger;

        const hasLegendRoleData = bollingerData.hasLegendRoleData;
        const seriesKeys = hasLegendRoleData ? (bollingerData.yValues ?? []) : [];
        const legendReserve = hasLegendRoleData
            ? this.getLegendReservation({ isOrdinal: true, categories: seriesKeys })
            : { top: 0, right: 0, bottom: 0, left: 0 };

        const titleSpacing = settings.smallMultiples.titleSpacing || 25;
        const panelTitleFontSize = this.getEffectiveFontSize(
            settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize,
            6,
            40
        );
        const hasPanelTitles = Boolean(settings.smallMultiples.showTitle && groups.length > 1 && groups.some(g => g !== "All" && g !== "(Blank)"));
        const titleReserve = hasPanelTitles ? Math.round(titleSpacing + panelTitleFontSize + 8) : 0;
        const interPanelGap = groups.length > 1
            ? (hasPanelTitles ? Math.max(settings.smallMultiples.spacing, titleReserve) : settings.smallMultiples.spacing)
            : 0;

        // Calculate margins
        const yAxisWidth = settings.showYAxis ? 60 : 10;
        const margin = {
            top: 12 + legendReserve.top + titleReserve,
            right: 12 + legendReserve.right,
            bottom: (settings.showXAxis ? 45 : 12) + legendReserve.bottom,
            left: yAxisWidth + legendReserve.left
        };

        const groupCount = groups.length;
        const totalSpacing = (groupCount - 1) * interPanelGap;
        const availableHeight = this.context.height - margin.top - margin.bottom - totalSpacing;
        const chartWidth = this.context.width - margin.left - margin.right;

        const parseXDate = (val: string): Date | null => {
            const ms = Number(val);
            if (Number.isFinite(ms)) {
                const d = new Date(ms);
                if (!isNaN(d.getTime())) return d;
            }
            const d = new Date(val);
            return isNaN(d.getTime()) ? null : d;
        };

        // Format x-axis labels
        const formatXLabel = (val: string): string => {
            const date = parseXDate(val);
            if (date) {
                return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
            }
            return val;
        };
        const xDisplayLabels = xValues.map(formatXLabel);
        const xValueOrder = new Map(xValues.map((x, idx) => [x, idx]));

        let currentY = margin.top;

        groups.forEach((groupName, groupIndex) => {
            const groupHeight = availableHeight / groupCount;

            // Filter points for this group
            const groupPoints = bollingerPoints.filter(p => p.groupValue === groupName);
            const pointsBySeries = new Map<string, BollingerDataPoint[]>();
            const pointBySeriesByX = new Map<string, Map<string, BollingerDataPoint>>();

            if (hasLegendRoleData) {
                seriesKeys.forEach(k => {
                    pointsBySeries.set(k, []);
                    pointBySeriesByX.set(k, new Map());
                });
                groupPoints.forEach(p => {
                    const key = p.seriesKey || "";
                    if (!pointsBySeries.has(key)) {
                        pointsBySeries.set(key, []);
                        pointBySeriesByX.set(key, new Map());
                    }
                    pointsBySeries.get(key)!.push(p);
                    pointBySeriesByX.get(key)!.set(String(p.date), p);
                });
            }

            // Sort by x-axis order
            groupPoints.sort((a, b) =>
                (xValueOrder.get(String(a.date)) ?? 0) - (xValueOrder.get(String(b.date)) ?? 0)
            );

            const panelGroup = this.context.container.append("g")
                .attr("class", "bollinger-panel")
                .attr("transform", `translate(${margin.left}, ${currentY})`);

            // Panel title
            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All" && groupName !== "(Blank)") {
                const titleSpacing = settings.smallMultiples.titleSpacing || 25;
                const titleFontSize = this.getEffectiveFontSize(
                    settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize,
                    6, 40
                );
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
            const xInset = Math.max(4, Math.min(16, chartWidth * 0.02));
            const xScale = d3.scaleLinear()
                .domain([0, xValues.length - 1])
                .range([xInset, Math.max(xInset, chartWidth - xInset)]);

            // Add 5% padding to y-axis
            const yPadding = (maxValue - minValue) * 0.05;
            const yScale = d3.scaleLinear()
                .domain([minValue - yPadding, maxValue + yPadding])
                .range([groupHeight, 0]);

            const seriesColorScale = hasLegendRoleData
                ? this.getCategoryColors(seriesKeys, bollingerData.categoryColorMap)
                : null;

            // Line generators
            const priceLineGenerator = d3.line<BollingerDataPoint>()
                .x(d => xScale(xValueOrder.get(String(d.date)) ?? 0))
                .y(d => yScale(d.value));

            const smaLineGenerator = d3.line<BollingerDataPoint>()
                .defined(d => d.sma !== null)
                .x(d => xScale(xValueOrder.get(String(d.date)) ?? 0))
                .y(d => yScale(d.sma!));

            const upperLineGenerator = d3.line<BollingerDataPoint>()
                .defined(d => d.upper !== null)
                .x(d => xScale(xValueOrder.get(String(d.date)) ?? 0))
                .y(d => yScale(d.upper!));

            const lowerLineGenerator = d3.line<BollingerDataPoint>()
                .defined(d => d.lower !== null)
                .x(d => xScale(xValueOrder.get(String(d.date)) ?? 0))
                .y(d => yScale(d.lower!));

            // Area generator for band fill
            const areaGenerator = d3.area<BollingerDataPoint>()
                .defined(d => d.upper !== null && d.lower !== null)
                .x(d => xScale(xValueOrder.get(String(d.date)) ?? 0))
                .y0(d => yScale(d.lower!))
                .y1(d => yScale(d.upper!));

            // Render order (back to front):
            // 1. Band fill area
            if (bollinger.showBandFill && bollinger.showBands) {
                if (hasLegendRoleData && seriesColorScale) {
                    seriesKeys.forEach(seriesKey => {
                        const pts = pointsBySeries.get(seriesKey) ?? [];
                        if (!pts.length) return;
                        const baseOpacity = Math.max(0, Math.min(0.22, bollinger.bandFillOpacity * 0.35));
                        panelGroup.append("path")
                            .datum(pts)
                            .attr("class", "band-fill")
                            .attr("data-selection-key", seriesKey)
                            .attr("d", areaGenerator)
                            .attr("fill", seriesColorScale(seriesKey))
                            .attr("opacity", baseOpacity)
                            .attr("stroke", "none");
                    });
                } else {
                    panelGroup.append("path")
                        .datum(groupPoints)
                        .attr("class", "band-fill")
                        .attr("d", areaGenerator)
                        .attr("fill", bollinger.bandFillColor)
                        .attr("opacity", bollinger.bandFillOpacity)
                        .attr("stroke", "none");
                }
            }

            // 2. Grid lines (horizontal)
            const yTicks = yScale.ticks(5);
            panelGroup.selectAll(".grid-line")
                .data(yTicks)
                .enter()
                .append("line")
                .attr("class", "grid-line")
                .attr("x1", 0)
                .attr("x2", chartWidth)
                .attr("y1", d => this.snapToPixel(yScale(d)))
                .attr("y2", d => this.snapToPixel(yScale(d)))
                .attr("stroke", this.getGridStroke("#e5e7eb"))
                .attr("stroke-width", 1)
                .attr("stroke-dasharray", "3,3");

            const renderSeries = (pts: BollingerDataPoint[], stroke: string, seriesKey?: string) => {
                // 3. Lower band line
                if (bollinger.showBands) {
                    const lower = panelGroup.append("path")
                        .datum(pts)
                        .attr("class", "lower-band")
                        .attr("d", lowerLineGenerator)
                        .attr("fill", "none")
                        .attr("stroke", stroke)
                        .attr("opacity", hasLegendRoleData ? 0.35 : 1)
                        .attr("stroke-width", bollinger.lineWidth);
                    if (seriesKey) lower.attr("data-selection-key", seriesKey);
                }

                // 4. Upper band line
                if (bollinger.showBands) {
                    const upper = panelGroup.append("path")
                        .datum(pts)
                        .attr("class", "upper-band")
                        .attr("d", upperLineGenerator)
                        .attr("fill", "none")
                        .attr("stroke", stroke)
                        .attr("opacity", hasLegendRoleData ? 0.35 : 1)
                        .attr("stroke-width", bollinger.lineWidth);
                    if (seriesKey) upper.attr("data-selection-key", seriesKey);
                }

                // 5. Middle band / SMA line
                if (bollinger.showMiddleBand) {
                    const middle = panelGroup.append("path")
                        .datum(pts)
                        .attr("class", "middle-band")
                        .attr("d", smaLineGenerator)
                        .attr("fill", "none")
                        .attr("stroke", stroke)
                        .attr("opacity", hasLegendRoleData ? 0.7 : 1)
                        .attr("stroke-dasharray", hasLegendRoleData ? "3,2" : null)
                        .attr("stroke-width", bollinger.lineWidth);
                    if (seriesKey) middle.attr("data-selection-key", seriesKey);
                }

                // 6. Price line
                if (bollinger.showPriceLine) {
                    const price = panelGroup.append("path")
                        .datum(pts)
                        .attr("class", "price-line")
                        .attr("d", priceLineGenerator)
                        .attr("fill", "none")
                        .attr("stroke", stroke)
                        .attr("stroke-width", bollinger.lineWidth + 0.5);
                    if (seriesKey) price.attr("data-selection-key", seriesKey);
                }
            };

            if (hasLegendRoleData && seriesColorScale) {
                seriesKeys.forEach(seriesKey => {
                    const pts = pointsBySeries.get(seriesKey) ?? [];
                    if (!pts.length) return;
                    renderSeries(pts, seriesColorScale(seriesKey), seriesKey);
                });
            } else {
                // Single-series defaults
                if (bollinger.showBands) {
                    panelGroup.append("path")
                        .datum(groupPoints)
                        .attr("class", "lower-band")
                        .attr("d", lowerLineGenerator)
                        .attr("fill", "none")
                        .attr("stroke", bollinger.lowerBandColor)
                        .attr("stroke-width", bollinger.lineWidth);

                    panelGroup.append("path")
                        .datum(groupPoints)
                        .attr("class", "upper-band")
                        .attr("d", upperLineGenerator)
                        .attr("fill", "none")
                        .attr("stroke", bollinger.upperBandColor)
                        .attr("stroke-width", bollinger.lineWidth);
                }

                if (bollinger.showMiddleBand) {
                    panelGroup.append("path")
                        .datum(groupPoints)
                        .attr("class", "middle-band")
                        .attr("d", smaLineGenerator)
                        .attr("fill", "none")
                        .attr("stroke", bollinger.middleBandColor)
                        .attr("stroke-width", bollinger.lineWidth);
                }

                if (bollinger.showPriceLine) {
                    panelGroup.append("path")
                        .datum(groupPoints)
                        .attr("class", "price-line")
                        .attr("d", priceLineGenerator)
                        .attr("fill", "none")
                        .attr("stroke", bollinger.priceLineColor)
                        .attr("stroke-width", bollinger.lineWidth + 0.5);
                }
            }

            // 7. Tooltip overlay
            const overlay = panelGroup.append("rect")
                .attr("class", "tooltip-overlay")
                .attr("width", chartWidth)
                .attr("height", groupHeight)
                .attr("fill", "transparent")
                .attr("cursor", "crosshair");

            // Vertical hover line
            const hoverLine = panelGroup.append("line")
                .attr("class", "hover-line")
                .attr("y1", 0)
                .attr("y2", groupHeight)
                .attr("stroke", this.getThemeForeground("#666"))
                .attr("stroke-width", 1)
                .attr("stroke-dasharray", "4,4")
                .style("opacity", 0);

            // Hover dot
            const hoverDot = panelGroup.append("circle")
                .attr("class", "hover-dot")
                .attr("r", 4)
                .attr("fill", bollinger.priceLineColor)
                .attr("stroke", this.getThemeBackground("#fff"))
                .attr("stroke-width", 2)
                .style("opacity", 0);

            const hoverDotsGroup = panelGroup.append("g")
                .attr("class", "hover-dots")
                .style("opacity", 0);

            const hoverDots = (hasLegendRoleData && seriesColorScale)
                ? hoverDotsGroup.selectAll("circle")
                    .data(seriesKeys)
                    .enter()
                    .append("circle")
                    .attr("r", 3.5)
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 2)
                    .attr("fill", d => seriesColorScale(d))
                : null;

            if (hasLegendRoleData) {
                hoverDot.style("display", "none");
            }

            const getClosestXValue = (mx: number): string | null => {
                if (xValues.length === 0) return null;
                const rawIndex = Math.round(xScale.invert(mx));
                const clampedIndex = Math.max(0, Math.min(xValues.length - 1, rawIndex));
                return xValues[clampedIndex] ?? null;
            };

            const renderHoverAtX = (targetXValue: string): {
                x: number;
                points: Array<{ seriesKey: string; point: BollingerDataPoint | null }>;
            } => {
                const xIdx = xValueOrder.get(String(targetXValue)) ?? 0;
                const x = xScale(xIdx);

                hoverLine.attr("x1", x).attr("x2", x).style("opacity", 1);

                if (!hasLegendRoleData) {
                    const point = groupPoints.find(p => String(p.date) === targetXValue) || null;
                    if (point) {
                        hoverDot.attr("cx", x).attr("cy", yScale(point.value)).style("opacity", 1);
                    } else {
                        hoverDot.style("opacity", 0);
                    }
                    return { x, points: [{ seriesKey: "Price", point }] };
                }

                const points = seriesKeys.map(seriesKey => ({
                    seriesKey,
                    point: pointBySeriesByX.get(seriesKey)?.get(String(targetXValue)) ?? null
                }));

                hoverDotsGroup.style("opacity", 1);
                if (hoverDots) {
                    hoverDots
                        .attr("cx", d => x)
                        .attr("cy", d => {
                            const p = pointBySeriesByX.get(d)?.get(String(targetXValue));
                            return p ? yScale(p.value) : -9999;
                        })
                        .style("opacity", d => {
                            const p = pointBySeriesByX.get(d)?.get(String(targetXValue));
                            return p ? 1 : 0;
                        });
                }

                return { x, points };
            };

            // Format number helper
            const formatNumber = (val: number | null): string => {
                if (val === null) return "N/A";
                return formatMeasureValue(val, bollingerData.valueFormatString, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };

            if (settings.tooltip.style === "custom") {
                this.addTooltipDynamic(overlay as any, (event: MouseEvent) => {
                    const node = panelGroup.node() as SVGGElement;
                    const [mx] = d3.pointer(event, node);
                    const targetXValue = getClosestXValue(mx);

                    if (!targetXValue) {
                        hoverLine.style("opacity", 0);
                        hoverDot.style("opacity", 0);
                        hoverDotsGroup.style("opacity", 0);
                        return { tooltipData: [], meta: { title: "" } };
                    }

                    const hover = renderHoverAtX(targetXValue);
                    const dateLabel = formatXLabel(String(targetXValue));

                    if (hasLegendRoleData) {
                        return {
                            meta: { title: dateLabel },
                            tooltipData: hover.points
                                .filter(p => p.point)
                                .map(p => ({
                                    displayName: p.seriesKey,
                                    value: formatNumber(p.point!.value),
                                    color: seriesColorScale ? seriesColorScale(p.seriesKey) : undefined
                                }))
                        };
                    }

                    const point = hover.points[0]?.point;
                    if (!point) {
                        hoverLine.style("opacity", 0);
                        hoverDot.style("opacity", 0);
                        return { tooltipData: [], meta: { title: "" } };
                    }

                    const tooltipRows: { displayName: string; value: string; color?: string }[] = [
                        { displayName: "Price", value: formatNumber(point.value), color: bollinger.priceLineColor }
                    ];
                    if (point.sma !== null) tooltipRows.push({ displayName: "SMA", value: formatNumber(point.sma), color: bollinger.middleBandColor });
                    if (point.upper !== null) tooltipRows.push({ displayName: "Upper Band", value: formatNumber(point.upper), color: bollinger.upperBandColor });
                    if (point.lower !== null) tooltipRows.push({ displayName: "Lower Band", value: formatNumber(point.lower), color: bollinger.lowerBandColor });

                    return {
                        meta: {
                            title: dateLabel,
                            subtitle: (groupName !== "All" && groupName !== "(Blank)") ? groupName : undefined,
                            color: bollinger.priceLineColor
                        },
                        tooltipData: tooltipRows
                    };
                });

                overlay.on("mouseout", () => {
                    hoverLine.style("opacity", 0);
                    hoverDot.style("opacity", 0);
                    hoverDotsGroup.style("opacity", 0);
                });
            } else {
                // Power BI native tooltips
                overlay
                    .on("mousemove", (event: MouseEvent) => {
                        const node = panelGroup.node() as SVGGElement;
                        const [mx] = d3.pointer(event, node);
                        const targetXValue = getClosestXValue(mx);
                        if (!targetXValue) return;

                        const hover = renderHoverAtX(targetXValue);
                        const dateLabel = formatXLabel(String(targetXValue));

                        if (hasLegendRoleData) {
                            const rows = hover.points
                                .filter(p => p.point)
                                .map(p => ({
                                    displayName: p.seriesKey,
                                    value: formatNumber(p.point!.value),
                                    color: seriesColorScale ? seriesColorScale(p.seriesKey) : undefined
                                }));

                            this.context.tooltipService.show({
                                dataItems: [{ displayName: "Date", value: dateLabel }, ...rows],
                                identities: [],
                                coordinates: [event.clientX, event.clientY],
                                isTouchEvent: false
                            });
                            return;
                        }

                        const point = hover.points[0]?.point;
                        if (!point) return;

                        const nativeRows: { displayName: string; value: string; color?: string }[] = [
                            { displayName: "Date", value: dateLabel },
                            { displayName: "Price", value: formatNumber(point.value), color: bollinger.priceLineColor }
                        ];
                        if (point.sma !== null) nativeRows.push({ displayName: "SMA", value: formatNumber(point.sma), color: bollinger.middleBandColor });
                        if (point.upper !== null) nativeRows.push({ displayName: "Upper Band", value: formatNumber(point.upper), color: bollinger.upperBandColor });
                        if (point.lower !== null) nativeRows.push({ displayName: "Lower Band", value: formatNumber(point.lower), color: bollinger.lowerBandColor });

                        this.context.tooltipService.show({
                            dataItems: nativeRows,
                            identities: [],
                            coordinates: [event.clientX, event.clientY],
                            isTouchEvent: false
                        });
                    })
                    .on("mouseout", () => {
                        hoverLine.style("opacity", 0);
                        hoverDot.style("opacity", 0);
                        hoverDotsGroup.style("opacity", 0);
                        this.context.tooltipService.hide({ immediately: true, isTouchEvent: false });
                    });
            }

            // 8. Y-Axis
            if (settings.showYAxis) {
                const yAxisFontSize = this.getEffectiveFontSize(
                    settings.textSizes.yAxisFontSize || settings.yAxisFontSize,
                    6, 40
                );

                const yAxisGroup = panelGroup.append("g")
                    .attr("class", "y-axis");

                yTicks.forEach(tick => {
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
                        .attr("fill", this.isHighContrastMode() ? this.getThemeForeground(settings.yAxisColor || "#111827") : settings.yAxisColor)
                        .text(formatMeasureValue(tick, bollingerData.valueFormatString));
                });
            }

            // 9. X-Axis (only on last group)
            if (settings.showXAxis && groupIndex === groups.length - 1) {
                const xAxisGroup = panelGroup.append("g")
                    .attr("class", "x-axis")
                    .attr("transform", `translate(0, ${Math.round(groupHeight)})`);

                const xAxisFontSize = this.getEffectiveFontSize(
                    settings.textSizes.xAxisFontSize || settings.xAxisFontSize,
                    6, 40
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
                // Add the last index only if it has enough room
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
                        .attr("fill", this.isHighContrastMode() ? this.getThemeForeground(settings.xAxisColor || "#111827") : settings.xAxisColor)
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

        if (hasLegendRoleData) {
            const legendColorScale = this.getCategoryColors(seriesKeys, bollingerData.categoryColorMap);
            this.renderLegend(legendColorScale, data.maxValue, true, seriesKeys, undefined, undefined, {
                alignFrame: {
                    x: margin.left,
                    y: margin.top,
                    width: chartWidth,
                    height: Math.max(0, this.context.height - margin.top - margin.bottom)
                }
            });
        }
    }

    private getBollingerLegendItems(
        data: BollingerChartData,
        settings: IBollingerVisualSettings
    ): Array<{ label: string; color: string }> {
        const { bollingerPoints } = data;
        const bollinger = settings.bollinger;

        const hasSma = bollingerPoints.some(p => p.sma !== null);
        const hasUpper = bollingerPoints.some(p => p.upper !== null);
        const hasLower = bollingerPoints.some(p => p.lower !== null);

        const items: Array<{ label: string; color: string }> = [];
        if (bollinger.showPriceLine) items.push({ label: "Price", color: bollinger.priceLineColor });
        if (bollinger.showMiddleBand && hasSma) items.push({ label: "SMA", color: bollinger.middleBandColor });
        if (bollinger.showBands && hasUpper) items.push({ label: "Upper Band", color: bollinger.upperBandColor });
        if (bollinger.showBands && hasLower) items.push({ label: "Lower Band", color: bollinger.lowerBandColor });
        return items;
    }

    private renderBollingerLegend(
        legendItems: Array<{ label: string; color: string }>,
        x: number,
        y: number,
        fontSize: number,
        itemHeight: number
    ): void {
        const legendGroup = this.context.container.append("g")
            .attr("class", "color-legend")
            .attr("transform", `translate(${Math.round(x)}, ${Math.round(y)})`);

        legendItems.forEach((item, i) => {
            const itemGroup = legendGroup.append("g")
                .attr("transform", `translate(0, ${i * itemHeight})`);

            // Line sample
            itemGroup.append("line")
                .attr("x1", 0)
                .attr("x2", 20)
                .attr("y1", itemHeight / 2)
                .attr("y2", itemHeight / 2)
                .attr("stroke", item.color)
                .attr("stroke-width", 2);

            // Label
            itemGroup.append("text")
                .attr("x", 28)
                .attr("y", itemHeight / 2)
                .attr("dy", "0.35em")
                .attr("font-size", `${fontSize}px`)
                .attr("fill", "#555")
                .text(item.label);
        });
    }
}
