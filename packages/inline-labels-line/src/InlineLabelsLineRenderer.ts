"use strict";

import powerbi from "powerbi-visuals-api";
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import {
    d3,
    BaseRenderer,
    RenderContext,
    ChartData,
    calculateLabelRotation,
    formatLabel,
    formatMeasureValue,
    measureMaxLabelWidth,
    measureTextWidth
} from "@pbi-visuals/shared";
import { IInlineLabelsLineVisualSettings } from "./settings";
import { InlineLabelsLineChartData } from "./InlineLabelsLineTransformer";

type DensePoint = {
    xValue: string;
    value: number; // primary measure (NaN allowed)
    value2: number; // secondary measure (NaN allowed)
};

type LabelNode = {
    key: string;
    seriesKey: string;
    color: string;
    targetY: number;
    y: number;
    height: number;
    width: number;
    nameText: string;
    valueText: string;
    deltaText: string;
    lastXValue: string;
    lastX: number;
    lastY: number;
};

export class InlineLabelsLineRenderer extends BaseRenderer<IInlineLabelsLineVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IInlineLabelsLineVisualSettings): void {
        this.settings = settings;
        const lineData = data as InlineLabelsLineChartData;

        if (!data.dataPoints.length || !data.xValues.length) {
            this.renderNoData();
            return;
        }

        const { xValues, yValues, groups } = lineData;

        const showLegend = Boolean(settings.showLegend && lineData.hasLegendRoleData && yValues.length > 0);
        const legendReserve = showLegend
            ? this.getLegendReservation({ isOrdinal: true, categories: yValues })
            : { top: 0, right: 0, bottom: 0, left: 0 };

        const titleSpacing = settings.smallMultiples.titleSpacing || 25;
        const panelTitleFontSize = this.getEffectiveFontSize(
            (settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize) as number,
            6,
            40
        );
        const hasPanelTitles = Boolean(settings.smallMultiples.showTitle && groups.length > 1 && groups.some(g => g !== "All" && g !== "(Blank)"));
        const titleReserve = hasPanelTitles ? Math.round(titleSpacing + panelTitleFontSize + 8) : 0;
        const interPanelGap = groups.length > 1
            ? (hasPanelTitles ? Math.max(settings.smallMultiples.spacing, titleReserve) : settings.smallMultiples.spacing)
            : 0;

        const xAxisFontSize = this.getEffectiveFontSize(
            (settings.textSizes.xAxisFontSize || settings.xAxisFontSize) as number,
            6,
            40
        );
        const yAxisFontSize = this.getEffectiveFontSize(
            (settings.textSizes.yAxisFontSize || settings.yAxisFontSize) as number,
            6,
            40
        );
        const yAxis2FontSize = this.getEffectiveFontSize(
            settings.yAxis2FontSize as number,
            6,
            40
        );

        const MIN_MS_TIMESTAMP_FOR_DATE_AXIS = 1000 * 1000 * 1000 * 100; // < ~1973 in ms
        const isDateAxisForLabels = Boolean(lineData.xIsDateAxis && lineData.xMsByValue && lineData.xMsByValue.size > 0);

        const formatXLabel = (xVal: string): string => {
            if (!isDateAxisForLabels) return xVal;

            // Prefer the transformer's ms map (it knows which values are true dates).
            const msFromMap = lineData.xMsByValue?.get(xVal);
            const ms = (typeof msFromMap === "number" && Number.isFinite(msFromMap))
                ? msFromMap
                : Number(xVal);

            if (!Number.isFinite(ms) || ms < MIN_MS_TIMESTAMP_FOR_DATE_AXIS) return xVal;

            const d = new Date(ms);
            if (Number.isNaN(d.getTime())) return xVal;
            return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        };

        const xDisplayLabels = xValues.map(formatXLabel);
        const xValueOrder = new Map<string, number>(xValues.map((x, idx) => [x, idx]));
        const xLabelByValue = new Map<string, string>();
        xValues.forEach((x, i) => xLabelByValue.set(x, xDisplayLabels[i]));

        const dateLogic = settings.dateLogic;
        const dateLogicEnabled = Boolean(
            dateLogic?.enabled
            && lineData.xIsDateAxis
            && lineData.xMsByValue
            && lineData.xMsByValue.size > 0
        );
        const cutoffMs = (() => {
            if (!dateLogicEnabled) return null;
            if (dateLogic.cutoff === "now") return Date.now();
            if (dateLogic.cutoff === "custom") {
                const raw = String(dateLogic.customDate ?? "").trim();
                if (raw) {
                    const d = new Date(raw);
                    const ms = d.getTime();
                    if (!Number.isNaN(ms)) return ms;
                }
                // Fallback
            }
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
        })();

        const isFutureX = (xVal: string): boolean => {
            if (!dateLogicEnabled || cutoffMs === null) return false;
            const ms = lineData.xMsByValue?.get(xVal);
            if (typeof ms === "number" && Number.isFinite(ms)) {
                return ms > cutoffMs;
            }
            const n = Number(xVal);
            return Number.isFinite(n) ? (n > cutoffMs) : false;
        };

        const applyTo = dateLogic?.applyTo ?? "lineArea";
        const applyLine = dateLogicEnabled && (applyTo === "lineArea" || applyTo === "lineOnly" || applyTo === "everything");
        const applyArea = dateLogicEnabled && (applyTo === "lineArea" || applyTo === "everything");
        const applyMarks = dateLogicEnabled && (applyTo === "everything");

        const inlineEnabled = Boolean(settings.inlineLabelSettings.enabled && yValues.length > 0);
        const labelFontFamily = "Segoe UI";
        const labelPadding = Math.max(2, Math.min(24, settings.inlineLabelSettings.labelPadding || 8));
        const labelGap = Math.max(0, Math.min(24, settings.inlineLabelSettings.labelGap || 6));

        const labelFontSize = this.getEffectiveFontSize(settings.inlineLabelSettings.labelFontSize, 6, 40);
        const valueFontSize = this.getEffectiveFontSize(settings.inlineLabelSettings.valueFontSize, 6, 40);
        const deltaFontSize = this.getEffectiveFontSize(settings.inlineLabelSettings.deltaFontSize, 6, 40);
        const lineGap = 2;

        const computeLabelZoneWidth = (): number => {
            if (!inlineEnabled) return 0;
            if (yValues.length === 0) return 0;

            const nameW = measureMaxLabelWidth(yValues, labelFontSize, labelFontFamily);
            const sampleValue = formatMeasureValue(lineData.maxValue, lineData.valueFormatString);
            const valueW = measureTextWidth(sampleValue, valueFontSize, labelFontFamily);
            const deltaW = measureTextWidth("+100.0%", deltaFontSize, labelFontFamily);
            const contentW = Math.max(nameW, valueW, deltaW);

            const w = Math.ceil(contentW + labelPadding * 2 + 14);
            const cap = Math.round(this.context.width * 0.4);
            return Math.max(120, Math.min(cap, w));
        };

        const labelZoneWidth = computeLabelZoneWidth();

        const showYAxis2 = Boolean(settings.showYAxis2 && lineData.hasValue2);
        const computeYAxis2Width = (): number => {
            if (!showYAxis2) return 0;
            const min2 = lineData.minValue2 ?? 0;
            const max2 = lineData.maxValue2 ?? 1;
            const fmt = lineData.secondaryValueFormatString || lineData.valueFormatString;
            const samples = [
                formatMeasureValue(min2, fmt),
                formatMeasureValue(max2, fmt),
                formatMeasureValue(0, fmt)
            ];
            const maxW = Math.max(0, ...samples.map(s => measureTextWidth(String(s), yAxis2FontSize, settings.yAxis2FontFamily)));
            return Math.max(36, Math.min(120, Math.ceil(maxW + 14)));
        };
        const yAxis2Width = computeYAxis2Width();

        // Left margin: reserve enough room for numeric tick labels.
        const yAxisWidth = settings.showYAxis ? 62 : 10;

        // Rotation decision based on plot width (after legend + label zone)
        const baseMargin = {
            top: 12 + titleReserve,
            right: 12 + (inlineEnabled ? labelZoneWidth : 0) + (showYAxis2 ? yAxis2Width : 0),
            bottom: settings.showXAxis ? 28 : 12,
            left: yAxisWidth
        };
        const prePlotWidth = Math.max(0, this.context.width - (baseMargin.left + legendReserve.left) - (baseMargin.right + legendReserve.right));

        const rotationResult = calculateLabelRotation({
            mode: settings.rotateXLabels,
            labels: xDisplayLabels,
            availableWidth: prePlotWidth,
            fontSize: xAxisFontSize,
            fontFamily: settings.xAxisFontFamily
        });
        const needsRotation = rotationResult.shouldRotate;
        const labelSkipInterval = rotationResult.skipInterval;

        baseMargin.bottom = settings.showXAxis ? (needsRotation ? 45 : 28) : 12;

        const margin = {
            top: baseMargin.top + legendReserve.top,
            right: baseMargin.right + legendReserve.right,
            bottom: baseMargin.bottom + legendReserve.bottom,
            left: baseMargin.left + legendReserve.left
        };

        const groupCount = groups.length || 1;
        const totalSpacing = (groupCount - 1) * interPanelGap;
        const availableHeight = this.context.height - margin.top - margin.bottom - totalSpacing;
        const plotWidth = this.context.width - margin.left - margin.right;

        if (availableHeight <= 0 || plotWidth <= 0) {
            return;
        }

        const groupHeight = availableHeight / groupCount;

        // Use global y range (consistent across panels).
        const yMin = lineData.minValue;
        const yMax = lineData.maxValue;
        const safeYSpan = (yMax - yMin) || (Math.abs(yMax) || 1);
        const yPadding = safeYSpan * 0.05;

        const colorScale = (() => {
            if (this.isHighContrastMode()) {
                return this.getCategoryColors(yValues, lineData.categoryColorMap);
            }

            // Make initial line colors match the Data Colors formatting defaults.
            // If the user has explicitly set a series color (dataView object), that wins.
            const base = (settings.useCustomColors && settings.customColors?.length)
                ? settings.customColors
                : this.getSchemeColors();

            const overrides = new Map<string, string>(lineData.categoryColorMap ? Array.from(lineData.categoryColorMap.entries()) : []);
            yValues.forEach((k, i) => {
                if (!overrides.has(k)) {
                    overrides.set(k, base[i % base.length]);
                }
            });
            return this.getCategoryColors(yValues, overrides);
        })();

        let currentY = margin.top;

        groups.forEach((groupName, groupIndex) => {
            const panelGroup = this.context.container.append("g")
                .attr("class", "inline-labels-line-panel")
                .attr("transform", `translate(${margin.left}, ${currentY})`);

            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All" && groupName !== "(Blank)") {
                const displayTitle = formatLabel(groupName, plotWidth, panelTitleFontSize);
                const title = panelGroup.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", -Math.round(titleSpacing))
                    .attr("font-size", `${panelTitleFontSize}px`)
                    .attr("font-weight", "600")
                    .attr("fill", this.getTitleTextColor("#111827"))
                    .text(displayTitle);

                if (displayTitle !== groupName) {
                    this.addTooltip(title as any, [{ displayName: "Group", value: groupName }]);
                }
            }

            const xInset = Math.max(4, Math.min(16, plotWidth * 0.02));
            const xScale = d3.scaleLinear()
                .domain([0, xValues.length - 1])
                .range([xInset, Math.max(xInset, plotWidth - xInset)]);

            const yScale = d3.scaleLinear()
                .domain([yMin - yPadding, yMax + yPadding])
                .range([groupHeight, 0]);

            const yScale2 = showYAxis2
                ? d3.scaleLinear()
                    .domain([
                        (lineData.minValue2 ?? 0) - (((lineData.maxValue2 ?? 1) - (lineData.minValue2 ?? 0)) || 1) * 0.05,
                        (lineData.maxValue2 ?? 1) + (((lineData.maxValue2 ?? 1) - (lineData.minValue2 ?? 0)) || 1) * 0.05
                    ])
                    .range([groupHeight, 0])
                : null;

            // Horizontal grid + y ticks
            const yTicks = yScale.ticks(5);
            yTicks.forEach(t => {
                const y = this.snapToPixel(yScale(t));
                panelGroup.append("line")
                    .attr("class", "grid-line")
                    .attr("x1", 0)
                    .attr("x2", plotWidth)
                    .attr("y1", y)
                    .attr("y2", y)
                    .attr("stroke", this.getGridStroke("#e5e7eb"))
                    .attr("stroke-width", 1)
                    .attr("stroke-dasharray", "3,3");
            });

            if (settings.showYAxis) {
                const yAxisGroup = panelGroup.append("g").attr("class", "y-axis");
                const yAxisColor = this.isHighContrastMode() ? this.getThemeForeground(settings.yAxisColor || "#374151") : settings.yAxisColor;
                yTicks.forEach(t => {
                    const y = Math.round(yScale(t));
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
                        .text(formatMeasureValue(t, lineData.valueFormatString));
                });
            }

            if (showYAxis2 && yScale2) {
                const y2Ticks = yScale2.ticks(5);
                const yAxis2Group = panelGroup.append("g").attr("class", "y-axis-2");
                const yAxis2Color = this.isHighContrastMode() ? this.getThemeForeground(settings.yAxis2Color || "#6b7280") : settings.yAxis2Color;
                const axisX = plotWidth + yAxis2Width - 2;
                const x = plotWidth + yAxis2Width - 8;

                // Axis line + tick marks (makes the 2nd axis obvious).
                yAxis2Group.append("line")
                    .attr("x1", axisX)
                    .attr("x2", axisX)
                    .attr("y1", 0)
                    .attr("y2", groupHeight)
                    .attr("stroke", yAxis2Color || this.getThemeForeground("#6b7280"))
                    .attr("stroke-width", 1)
                    .attr("opacity", 0.65);

                y2Ticks.forEach(t => {
                    const y = Math.round(yScale2(t));
                    yAxis2Group.append("line")
                        .attr("x1", axisX - 4)
                        .attr("x2", axisX)
                        .attr("y1", y)
                        .attr("y2", y)
                        .attr("stroke", yAxis2Color || this.getThemeForeground("#6b7280"))
                        .attr("stroke-width", 1)
                        .attr("opacity", 0.65);
                    yAxis2Group.append("text")
                        .attr("x", x)
                        .attr("y", y)
                        .attr("dy", "0.32em")
                        .attr("text-anchor", "end")
                        .attr("font-size", `${yAxis2FontSize}px`)
                        .attr("font-family", settings.yAxis2FontFamily)
                        .style("font-weight", settings.yAxis2Bold ? "700" : "400")
                        .style("font-style", settings.yAxis2Italic ? "italic" : "normal")
                        .style("text-decoration", settings.yAxis2Underline ? "underline" : "none")
                        .attr("fill", yAxis2Color)
                        .text(formatMeasureValue(t, lineData.secondaryValueFormatString || lineData.valueFormatString));
                });
            }

            // Build series -> dense points (all x values, with NaN for missing)
            const groupPoints = lineData.dataPoints.filter(p => p.groupValue === groupName);
            const pointsBySeriesByX = new Map<string, Map<string, number>>();
            const points2BySeriesByX = new Map<string, Map<string, number>>();
            yValues.forEach(k => {
                pointsBySeriesByX.set(k, new Map());
                points2BySeriesByX.set(k, new Map());
            });

            for (const p of groupPoints) {
                if (!pointsBySeriesByX.has(p.yValue)) {
                    pointsBySeriesByX.set(p.yValue, new Map());
                    points2BySeriesByX.set(p.yValue, new Map());
                }
                pointsBySeriesByX.get(p.yValue)!.set(p.xValue, p.value);
                points2BySeriesByX.get(p.yValue)!.set(p.xValue, (p as any).value2 ?? NaN);
            }

            const seriesDense = new Map<string, DensePoint[]>();
            yValues.forEach(seriesKey => {
                const map = pointsBySeriesByX.get(seriesKey) ?? new Map();
                const map2 = points2BySeriesByX.get(seriesKey) ?? new Map();
                const pts = xValues.map(x => ({
                    xValue: x,
                    value: map.get(x) ?? NaN,
                    value2: map2.get(x) ?? NaN
                }));
                seriesDense.set(seriesKey, pts);
            });

            const curve = settings.lineSettings.curve === "linear" ? d3.curveLinear : d3.curveMonotoneX;
            const lineGen = d3.line<DensePoint>()
                .defined(d => Number.isFinite(d.value))
                .x(d => xScale(xValueOrder.get(d.xValue) ?? 0))
                .y(d => yScale(d.value))
                .curve(curve);

            const baseline = (yMin <= 0 && yMax >= 0) ? 0 : yMin;
            const areaGen = d3.area<DensePoint>()
                .defined(d => Number.isFinite(d.value))
                .x(d => xScale(xValueOrder.get(d.xValue) ?? 0))
                .y0(yScale(baseline))
                .y1(d => yScale(d.value))
                .curve(curve);

            // Areas (back)
            if (settings.lineSettings.showAreaFill && !this.isHighContrastMode()) {
                yValues.forEach(seriesKey => {
                    const pts = seriesDense.get(seriesKey);
                    if (!pts) return;
                    const color = colorScale(seriesKey);
                    if (!applyArea) {
                        panelGroup.append("path")
                            .datum(pts)
                            .attr("class", "area-path")
                            .attr("data-selection-key", seriesKey)
                            .attr("d", areaGen)
                            .attr("fill", color)
                            .attr("opacity", settings.lineSettings.areaOpacity)
                            .attr("stroke", "none");
                        return;
                    }

                    // Past style "grey" should look intentionally grey, but the line stroke/marks
                    // should not feel too heavy against the light fill.
                    const pastGrey = this.getThemeForeground("#9ca3af");
                    const pastFill = (dateLogic.pastStyle === "grey")
                        ? pastGrey
                        : color;
                    const pastOpacity = (dateLogic.pastStyle === "grey")
                        ? settings.lineSettings.areaOpacity
                        : (settings.lineSettings.areaOpacity * Math.max(0, Math.min(1, dateLogic.dimOpacity ?? 0.35)));

                    const futureOpacity = settings.lineSettings.areaOpacity;

                    const pastArea = d3.area<DensePoint>()
                        .defined(d => Number.isFinite(d.value) && !isFutureX(d.xValue))
                        .x(d => xScale(xValueOrder.get(d.xValue) ?? 0))
                        .y0(yScale(baseline))
                        .y1(d => yScale(d.value))
                        .curve(curve);

                    const futureArea = d3.area<DensePoint>()
                        .defined(d => Number.isFinite(d.value) && isFutureX(d.xValue))
                        .x(d => xScale(xValueOrder.get(d.xValue) ?? 0))
                        .y0(yScale(baseline))
                        .y1(d => yScale(d.value))
                        .curve(curve);

                    panelGroup.append("path")
                        .datum(pts)
                        .attr("class", "area-path past-area")
                        .attr("data-selection-key", seriesKey)
                        .attr("d", pastArea)
                        .attr("fill", pastFill)
                        .attr("opacity", pastOpacity)
                        .attr("stroke", "none");

                    panelGroup.append("path")
                        .datum(pts)
                        .attr("class", "area-path future-area")
                        .attr("data-selection-key", seriesKey)
                        .attr("d", futureArea)
                        .attr("fill", color)
                        .attr("opacity", futureOpacity)
                        .attr("stroke", "none");
                });
            }

            // Lines
            yValues.forEach(seriesKey => {
                const pts = seriesDense.get(seriesKey);
                if (!pts) return;
                const color = colorScale(seriesKey);
                if (!applyLine) {
                    panelGroup.append("path")
                        .datum(pts)
                        .attr("class", "line-path")
                        .attr("data-selection-key", seriesKey)
                        .attr("d", lineGen)
                        .attr("stroke", color)
                        .attr("stroke-width", settings.lineSettings.lineWidth)
                        .attr("opacity", 1);
                    return;
                }

                // Include the last past defined point as an anchor in the future path so the dotted
                // segment visually continues from the last actual point.
                let anchorX: string | null = null;
                let firstFutureIdx = -1;
                for (let i = 0; i < pts.length; i++) {
                    if (!Number.isFinite(pts[i].value)) continue;
                    if (isFutureX(pts[i].xValue)) { firstFutureIdx = i; break; }
                }
                if (firstFutureIdx >= 0) {
                    for (let i = firstFutureIdx - 1; i >= 0; i--) {
                        if (Number.isFinite(pts[i].value)) { anchorX = pts[i].xValue; break; }
                    }
                }

                const dimOpacity = Math.max(0, Math.min(1, dateLogic.dimOpacity ?? 0.35));
                const pastGrey = this.getThemeForeground("#9ca3af");
                const pastStroke = (dateLogic.pastStyle === "grey")
                    ? pastGrey
                    : color;
                const pastOpacity = (dateLogic.pastStyle === "grey") ? 1 : dimOpacity;

                const pastLine = d3.line<DensePoint>()
                    .defined(d => Number.isFinite(d.value) && !isFutureX(d.xValue))
                    .x(d => xScale(xValueOrder.get(d.xValue) ?? 0))
                    .y(d => yScale(d.value))
                    .curve(curve);

                const futureLine = d3.line<DensePoint>()
                    .defined(d => {
                        if (!Number.isFinite(d.value)) return false;
                        if (isFutureX(d.xValue)) return true;
                        return anchorX !== null && d.xValue === anchorX;
                    })
                    .x(d => xScale(xValueOrder.get(d.xValue) ?? 0))
                    .y(d => yScale(d.value))
                    .curve(curve);

                panelGroup.append("path")
                    .datum(pts)
                    .attr("class", "line-path past-line")
                    .attr("data-selection-key", seriesKey)
                    .attr("d", pastLine)
                    .attr("stroke", pastStroke)
                    .attr("stroke-width", settings.lineSettings.lineWidth)
                    .attr("opacity", pastOpacity);

                const futurePath = panelGroup.append("path")
                    .datum(pts)
                    .attr("class", "line-path future-line")
                    .attr("data-selection-key", seriesKey)
                    .attr("d", futureLine)
                    .attr("stroke", color)
                    .attr("stroke-width", settings.lineSettings.lineWidth)
                    .attr("opacity", 1);

                if (dateLogic.futureStyle === "dotted") {
                    futurePath.attr("stroke-dasharray", "4,4");
                }
            });

            // Markers: last / last2
            const markerMode = settings.markerSettings.mode;
            const showLast = markerMode === "last" || markerMode === "last2";
            const showPrev = markerMode === "last2";
            const bgStroke = this.getThemeBackground("#ffffff");

            yValues.forEach(seriesKey => {
                const pts = seriesDense.get(seriesKey);
                if (!pts) return;
                const color = colorScale(seriesKey);

                const lastIdx = (() => {
                    for (let i = pts.length - 1; i >= 0; i--) {
                        if (Number.isFinite(pts[i].value)) return i;
                    }
                    return -1;
                })();
                if (lastIdx < 0) return;
                const prevIdx = (() => {
                    for (let i = lastIdx - 1; i >= 0; i--) {
                        if (Number.isFinite(pts[i].value)) return i;
                    }
                    return -1;
                })();

                const drawMarker = (idx: number, cls: string, size: number) => {
                    const p = pts[idx];
                    const cx = xScale(xValueOrder.get(p.xValue) ?? 0);
                    const cy = yScale(p.value);
                    const future = applyMarks ? isFutureX(p.xValue) : false;
                    const dimOpacity = Math.max(0, Math.min(1, dateLogic?.dimOpacity ?? 0.35));
                    const pastFill = (dateLogic?.pastStyle === "grey")
                        ? this.getThemeForeground("#9ca3af")
                        : color;
                    const fill = applyMarks && !future ? pastFill : color;
                    const opacity = applyMarks && !future && dateLogic?.pastStyle !== "grey" ? dimOpacity : 1;
                    panelGroup.append("circle")
                        .attr("class", `line-marker ${cls}`)
                        .attr("data-selection-key", seriesKey)
                        .attr("cx", cx)
                        .attr("cy", cy)
                        .attr("r", Math.max(0, size / 2))
                        .attr("fill", fill)
                        .attr("stroke", bgStroke)
                        .attr("stroke-width", 2)
                        .attr("opacity", opacity);
                };

                if (showPrev && prevIdx >= 0 && settings.markerSettings.prevMarkerSize > 0) {
                    drawMarker(prevIdx, "prev-marker", settings.markerSettings.prevMarkerSize);
                }
                if (showLast && settings.markerSettings.lastMarkerSize > 0) {
                    drawMarker(lastIdx, "last-marker", settings.markerSettings.lastMarkerSize);
                }
            });

            // Point value labels (at each stop)
            const pointLabels = settings.pointValueLabels;
            if (pointLabels?.enabled) {
                const fontSize = this.getEffectiveFontSize(pointLabels.fontSize, 6, 40);
                const value2FontSize = this.getEffectiveFontSize((pointLabels as any).value2FontSize ?? fontSize, 6, 40);
                const offset = Math.max(0, Math.min(24, pointLabels.offset ?? 8));
                const insideOffset = Math.max(0, Math.min(24, pointLabels.insideOffset ?? 2));
                const haloWidth = Math.max(0, Math.min(12, pointLabels.haloWidth ?? 3));
                const valueLineGap = Math.max(0, Math.min(24, (pointLabels as any).valueLineGap ?? 2));
                const labelColor = this.isHighContrastMode()
                    ? this.getThemeForeground(pointLabels.color || "#111827")
                    : (pointLabels.color || "#111827");
                const value2Color = this.isHighContrastMode()
                    ? this.getThemeForeground((pointLabels as any).value2Color || labelColor)
                    : ((pointLabels as any).value2Color || labelColor);
                const bgColor = this.isHighContrastMode()
                    ? this.getThemeBackground(pointLabels.backgroundColor || "#ffffff")
                    : (pointLabels.backgroundColor || "#ffffff");
                const bgOpacity = Math.max(0, Math.min(1, Number(pointLabels.backgroundOpacity ?? 0.85)));
                const haloColor = this.getThemeBackground("#ffffff");

                const padX = 4;
                const padY = 2;

                // For auto density, compute a skip interval based on available x step and typical label width.
                const step = plotWidth / Math.max(1, xValues.length - 1);
                const sample = formatMeasureValue(lineData.maxValue, lineData.valueFormatString);
                const sampleW = measureTextWidth(sample, fontSize, "Segoe UI");
                const sample2 = lineData.secondaryValueFormatString
                    ? formatMeasureValue(lineData.maxValue, lineData.secondaryValueFormatString)
                    : sample;
                const sampleW2 = measureTextWidth(sample2, value2FontSize, "Segoe UI");
                const needed = Math.max(sampleW, sampleW2) + padX * 2 + 6;
                const autoSkip = step > 0 ? Math.max(1, Math.ceil(needed / step)) : 1;

                yValues.forEach(seriesKey => {
                    const pts = seriesDense.get(seriesKey);
                    if (!pts) return;

                    const seriesColor = colorScale(seriesKey);
                    const skip = pointLabels.density === "all" ? 1 : autoSkip;
                    const placement = pointLabels.placement || "floating";
                    const showValue2 = Boolean(pointLabels.showValue2);
                    const value2Position = pointLabels.value2Position || "below";

                    // Always include last defined point even if skipping.
                    let lastDefined = -1;
                    for (let i = pts.length - 1; i >= 0; i--) {
                        if (Number.isFinite(pts[i].value)) { lastDefined = i; break; }
                    }

                    for (let i = 0; i < pts.length; i++) {
                        const p = pts[i];
                        if (!Number.isFinite(p.value)) continue;

                        if (skip > 1 && i % skip !== 0 && i !== lastDefined) continue;

                        const cx = xScale(xValueOrder.get(p.xValue) ?? 0);
                        const cy = yScale(p.value);
                        const valueText = formatMeasureValue(p.value, lineData.valueFormatString);
                        const value2Text = (showValue2 && Number.isFinite(p.value2))
                            ? formatMeasureValue(p.value2, lineData.secondaryValueFormatString || lineData.valueFormatString)
                            : "";
                        const lines: Array<{ text: string; fontSize: number; kind: "primary" | "secondary" }> = (() => {
                            if (!value2Text) return [{ text: valueText, fontSize, kind: "primary" }];
                            if (value2Position === "above") return [
                                { text: value2Text, fontSize: value2FontSize, kind: "secondary" },
                                { text: valueText, fontSize, kind: "primary" }
                            ];
                            return [
                                { text: valueText, fontSize, kind: "primary" },
                                { text: value2Text, fontSize: value2FontSize, kind: "secondary" }
                            ];
                        })();
                        const future = applyMarks ? isFutureX(p.xValue) : false;
                        const dimOpacity = Math.max(0, Math.min(1, dateLogic?.dimOpacity ?? 0.35));
                        const pastTextColor = (dateLogic?.pastStyle === "grey")
                            ? this.getThemeForeground("#9ca3af")
                            : seriesColor;
                        const pointOpacity = applyMarks && !future && dateLogic?.pastStyle !== "grey" ? dimOpacity : 1;

                        if (placement === "insideLine") {
                            const primaryFill = applyMarks
                                ? (future ? seriesColor : pastTextColor)
                                : labelColor;
                            const secondaryFill = applyMarks ? primaryFill : value2Color;

                            // Estimate local stroke direction and offset label along the normal so it reads
                            // like it sits "in" the line rather than floating above it.
                            const findPrevDefined = (): number => {
                                for (let j = i - 1; j >= 0; j--) if (Number.isFinite(pts[j].value)) return j;
                                return -1;
                            };
                            const findNextDefined = (): number => {
                                for (let j = i + 1; j < pts.length; j++) if (Number.isFinite(pts[j].value)) return j;
                                return -1;
                            };
                            const prev = findPrevDefined();
                            const next = findNextDefined();

                            const aIdx = prev >= 0 ? prev : i;
                            const bIdx = next >= 0 ? next : i;
                            const ax = xScale(xValueOrder.get(pts[aIdx].xValue) ?? aIdx);
                            const ay = yScale(pts[aIdx].value);
                            const bx = xScale(xValueOrder.get(pts[bIdx].xValue) ?? bIdx);
                            const by = yScale(pts[bIdx].value);
                            const dx = bx - ax;
                            const dy = by - ay;
                            const len = Math.hypot(dx, dy) || 1;
                            const nx = (-dy / len);
                            const ny = (dx / len);

                            const tx = cx + nx * insideOffset;
                            const ty = cy + ny * insideOffset;

                            const g = panelGroup.append("g")
                                .attr("class", "point-value-label inside-line")
                                .attr("transform", `translate(${Math.round(tx)}, ${Math.round(ty)})`)
                                .style("opacity", String(0.92 * pointOpacity));

                            // Make the stroke wide enough to actually "cut" the line underneath.
                            const cutStrokeWidth = Math.max(haloWidth, (settings.lineSettings.lineWidth || 2.5) + haloWidth * 2);

                            const totalH = lines.reduce((s, l) => s + l.fontSize, 0) + Math.max(0, lines.length - 1) * valueLineGap;
                            let cursor = -totalH / 2;
                            lines.forEach((l, idx2) => {
                                const fill = l.kind === "primary" ? primaryFill : secondaryFill;
                                const y = cursor + l.fontSize;
                                cursor += l.fontSize + valueLineGap;

                                g.append("text")
                                    .attr("x", 0)
                                    .attr("y", y)
                                    .attr("text-anchor", "middle")
                                    .attr("font-size", `${l.fontSize}px`)
                                    .attr("font-family", "Segoe UI")
                                    .attr("fill", fill)
                                    .style("font-weight", "700")
                                    .style("paint-order", "stroke")
                                    .attr("stroke", haloColor)
                                    .attr("stroke-linecap", "round")
                                    .attr("stroke-linejoin", "round")
                                    .attr("stroke-width", cutStrokeWidth)
                                    .text(l.text);
                            });
                        } else {
                            const measuredW = Math.max(0, ...lines.map(l => measureTextWidth(l.text, l.fontSize, "Segoe UI")));
                            const boxW = Math.ceil(measuredW + padX * 2);
                            const textH = Math.ceil(lines.reduce((s, l) => s + l.fontSize, 0) + Math.max(0, lines.length - 1) * valueLineGap);
                            const boxH = Math.ceil(textH + padY * 2);

                            // Keep label inside plot: above unless too close to the top.
                            const placeAbove = (cy - offset - boxH) >= 0;
                            const boxTop = placeAbove ? (cy - offset - boxH) : (cy + offset);

                            const gx = Math.round(cx - boxW / 2);
                            const gy = Math.round(boxTop);

                            const g = panelGroup.append("g")
                                .attr("class", "point-value-label floating")
                                .attr("transform", `translate(${gx}, ${gy})`)
                                .style("opacity", String(0.92 * pointOpacity));

                            if (pointLabels.showBackground) {
                                g.append("rect")
                                    .attr("class", "point-value-bg")
                                    .attr("x", 0)
                                    .attr("y", 0)
                                    .attr("width", boxW)
                                    .attr("height", boxH)
                                    .attr("rx", 4)
                                    .attr("ry", 4)
                                    .attr("fill", bgColor)
                                    .attr("opacity", bgOpacity);
                            }

                            const primaryFloatingFill = (() => {
                                if (pointLabels.showBackground) return labelColor;
                                return applyMarks && !future ? pastTextColor : seriesColor;
                            })();
                            const secondaryFloatingFill = pointLabels.showBackground ? value2Color : value2Color;

                            let yCursor = padY;
                            lines.forEach((l, idx2) => {
                                const fill = l.kind === "primary" ? primaryFloatingFill : secondaryFloatingFill;
                                g.append("text")
                                    .attr("x", Math.round(boxW / 2))
                                    .attr("y", Math.round(yCursor + l.fontSize - 2))
                                    .attr("text-anchor", "middle")
                                    .attr("font-size", `${l.fontSize}px`)
                                    .attr("font-family", "Segoe UI")
                                    .attr("fill", fill)
                                    .style("font-weight", "600")
                                    .text(l.text);
                                yCursor += l.fontSize + valueLineGap;
                            });
                        }
                    }
                });
            }

            // Inline end labels (right zone)
            const nodes: LabelNode[] = [];
            if (inlineEnabled) {
                const labelX = Math.round(plotWidth + (showYAxis2 ? yAxis2Width : 0) + 12);
                const maxLabelWidth = Math.max(80, labelZoneWidth - 24);
                const maxTextW = Math.max(20, maxLabelWidth - labelPadding * 2);

                const valueLabel = lineData.valueDisplayName || "Value";

                const computeDelta = (last: number, prev: number | null): { text: string; positive?: boolean } => {
                    const mode = settings.inlineLabelSettings.deltaMode;
                    if (mode === "none") return { text: "" };
                    if (prev === null || !Number.isFinite(prev)) return { text: "N/A" };

                    const deltaAbs = last - prev;
                    const pct = prev === 0 ? null : (deltaAbs / prev) * 100;

                    const fmtAbs = (): string => {
                        const v = formatMeasureValue(deltaAbs, lineData.valueFormatString);
                        const sign = deltaAbs > 0 ? "+" : "";
                        return `${sign}${v}`;
                    };
                    const fmtPct = (): string => {
                        if (pct === null || !Number.isFinite(pct)) return "N/A";
                        const sign = pct > 0 ? "+" : "";
                        return `${sign}${pct.toFixed(1)}%`;
                    };

                    if (mode === "absolute") return { text: fmtAbs(), positive: deltaAbs > 0 };
                    if (mode === "percent") return { text: fmtPct(), positive: (pct ?? 0) > 0 };
                    return { text: `${fmtAbs()} (${fmtPct()})`, positive: deltaAbs > 0 };
                };

                yValues.forEach(seriesKey => {
                    const pts = seriesDense.get(seriesKey);
                    if (!pts) return;

                    let lastIdx = -1;
                    for (let i = pts.length - 1; i >= 0; i--) {
                        if (Number.isFinite(pts[i].value)) { lastIdx = i; break; }
                    }
                    if (lastIdx < 0) return;
                    let prevIdx = -1;
                    for (let i = lastIdx - 1; i >= 0; i--) {
                        if (Number.isFinite(pts[i].value)) { prevIdx = i; break; }
                    }

                    const last = pts[lastIdx];
                    const prevVal = prevIdx >= 0 ? pts[prevIdx].value : null;
                    const lastX = xScale(xValueOrder.get(last.xValue) ?? 0);
                    const lastY = yScale(last.value);

                    const color = colorScale(seriesKey);

                    const nameText = (() => {
                        if (settings.inlineLabelSettings.content === "value_delta") return "";
                        return formatLabel(seriesKey, maxTextW, labelFontSize);
                    })();
                    const valueText = (() => {
                        const content = settings.inlineLabelSettings.content;
                        if (content === "name_only") return "";
                        const v = formatMeasureValue(last.value, lineData.valueFormatString);
                        // When showing value-only, use measure label for tooltip meta; inline value stays numeric.
                        return v;
                    })();
                    const delta = computeDelta(last.value, prevVal);
                    const deltaText = (() => {
                        const content = settings.inlineLabelSettings.content;
                        if (content === "name_only" || content === "name_value") return "";
                        if (settings.inlineLabelSettings.deltaMode === "none") return "";
                        return delta.text;
                    })();

                    const lines: Array<{ text: string; fontSize: number }> = [];
                    if (nameText) lines.push({ text: nameText, fontSize: labelFontSize });
                    if (valueText) lines.push({ text: valueText, fontSize: valueFontSize });
                    if (deltaText) lines.push({ text: deltaText, fontSize: deltaFontSize });

                    const measuredW = Math.max(
                        0,
                        ...lines.map(l => measureTextWidth(l.text, l.fontSize, labelFontFamily))
                    );
                    const width = Math.min(maxLabelWidth, Math.ceil(measuredW + labelPadding * 2));
                    const height = Math.ceil(labelPadding * 2 + lines.reduce((sum, l) => sum + l.fontSize, 0) + Math.max(0, lines.length - 1) * lineGap);

                    nodes.push({
                        key: `${groupName}||${seriesKey}`,
                        seriesKey,
                        color,
                        targetY: lastY,
                        y: lastY,
                        height,
                        width,
                        nameText,
                        valueText,
                        deltaText,
                        lastXValue: last.xValue,
                        lastX,
                        lastY
                    });
                });

                // Collision avoidance layout
                if (nodes.length > 1) {
                    const sim = d3.forceSimulation(nodes as any)
                        .alpha(1)
                        .alphaDecay(0.10)
                        .force("y", d3.forceY((d: any) => d.targetY).strength(0.65))
                        .force("collide", d3.forceCollide((d: any) => (d.height / 2) + labelGap).iterations(2))
                        .stop();

                    sim.tick(130);
                }

                // Draw label groups + leader lines
                nodes.forEach(n => {
                    const half = n.height / 2;
                    const clampedY = Math.max(half, Math.min(groupHeight - half, n.y));
                    const g = panelGroup.append("g")
                        .attr("class", "end-label-group")
                        .attr("data-selection-key", n.seriesKey)
                        .attr("transform", `translate(${labelX}, ${Math.round(clampedY - half)})`);

                    // Optional leader line from last point to label edge.
                    if (settings.inlineLabelSettings.showLeaderLines) {
                        const targetY = clampedY;
                        const x1 = n.lastX;
                        const y1 = n.lastY;
                        const x2 = labelX - 6;
                        const y2 = targetY;
                        panelGroup.append("path")
                            .attr("class", "leader-line")
                            .attr("d", `M ${Math.round(x1)} ${Math.round(y1)} L ${Math.round(x2)} ${Math.round(y2)}`);
                    }

                    g.append("rect")
                        .attr("class", "end-label-bg")
                        .attr("x", 0)
                        .attr("y", 0)
                        .attr("width", n.width)
                        .attr("height", n.height)
                        .attr("rx", 8)
                        .attr("ry", 8);

                    let ty = labelPadding;
                    const addLine = (cls: string, text: string, fontSize: number, fill?: string) => {
                        const t = g.append("text")
                            .attr("class", cls)
                            .attr("x", labelPadding)
                            .attr("y", ty + fontSize - 2)
                            .attr("font-size", `${fontSize}px`)
                            .attr("font-family", labelFontFamily)
                            .attr("fill", fill || null)
                            .text(text);
                        ty += fontSize + lineGap;
                        return t;
                    };

                    if (n.nameText) addLine("end-label-name", n.nameText, labelFontSize, n.color);
                    if (n.valueText) addLine("end-label-value", n.valueText, valueFontSize);
                    if (n.deltaText) addLine("end-label-delta", n.deltaText, deltaFontSize);

                    // Tooltip on label: show series + last x + value, plus delta.
                    const subtitle = xLabelByValue.get(n.lastXValue) ?? n.lastXValue;
                    const tipRows: VisualTooltipDataItem[] = [
                        { displayName: valueLabel, value: n.valueText, color: n.color } as any
                    ];
                    if (n.deltaText) {
                        tipRows.push({ displayName: "Change", value: n.deltaText } as any);
                    }
                    if (groupName !== "All" && groupName !== "(Blank)") {
                        tipRows.push({ displayName: "Group", value: groupName } as any);
                    }
                    this.addTooltip(g as any, tipRows, { title: n.seriesKey, subtitle, color: n.color });
                });
            }

            // Tooltip overlay + crosshair
            const overlay = panelGroup.append("rect")
                .attr("class", "tooltip-overlay")
                .attr("width", plotWidth)
                .attr("height", groupHeight)
                .attr("fill", "transparent")
                .attr("cursor", "crosshair");

            const hoverLine = panelGroup.append("line")
                .attr("class", "hover-line")
                .attr("y1", 0)
                .attr("y2", groupHeight)
                .attr("stroke", this.getThemeForeground("#64748b"))
                .attr("stroke-width", 1)
                .attr("stroke-dasharray", "4,4")
                .style("opacity", 0);

            const hoverDotsGroup = panelGroup.append("g")
                .attr("class", "hover-dots")
                .style("opacity", 0);

            const hoverDots = hoverDotsGroup.selectAll("circle")
                .data(yValues)
                .enter()
                .append("circle")
                .attr("r", 3.5)
                .attr("stroke", this.getThemeBackground("#ffffff"))
                .attr("stroke-width", 2)
                .attr("fill", d => colorScale(d));

            const showTooltip = (event: MouseEvent, xIdx: number) => {
                const xVal = xValues[xIdx];
                const xLabel = xDisplayLabels[xIdx] ?? xVal;

                const rows: VisualTooltipDataItem[] = [];
                yValues.forEach(seriesKey => {
                    const v = pointsBySeriesByX.get(seriesKey)?.get(xVal);
                    const formatted = Number.isFinite(v) ? formatMeasureValue(v!, lineData.valueFormatString) : "(Blank)";
                    rows.push({ displayName: seriesKey, value: formatted, color: colorScale(seriesKey) } as any);

                    const v2 = points2BySeriesByX.get(seriesKey)?.get(xVal);
                    if (lineData.secondaryValueFormatString || lineData.secondaryValueDisplayName) {
                        const formatted2 = Number.isFinite(v2)
                            ? formatMeasureValue(v2!, lineData.secondaryValueFormatString || lineData.valueFormatString)
                            : "(Blank)";
                        rows.push({
                            displayName: `${seriesKey} (${lineData.secondaryValueDisplayName || "Value 2"})`,
                            value: formatted2,
                            color: colorScale(seriesKey)
                        } as any);
                    }
                });
                if (groupName !== "All" && groupName !== "(Blank)") {
                    rows.push({ displayName: "Group", value: groupName } as any);
                }

                if (!settings.tooltip?.enabled) return;

                if (settings.tooltip.style === "custom" && typeof document !== "undefined" && this.context.htmlTooltip) {
                    this.context.htmlTooltip.show({ meta: { title: xLabel }, rows: rows.map(r => ({ label: String(r.displayName), value: String(r.value), color: (r as any).color })) }, event.clientX, event.clientY);
                } else {
                    this.context.tooltipService.show({
                        dataItems: rows,
                        identities: [],
                        coordinates: [event.clientX, event.clientY],
                        isTouchEvent: false
                    });
                }
            };

            overlay
                .on("mousemove", (event: MouseEvent) => {
                    const node = panelGroup.node() as any;
                    const [mx] = d3.pointer(event, node);
                    const rawIdx = Math.round(xScale.invert(mx));
                    const xIdx = Math.max(0, Math.min(xValues.length - 1, rawIdx));

                    const x = xScale(xIdx);
                    hoverLine.attr("x1", x).attr("x2", x).style("opacity", 1);
                    hoverDotsGroup.style("opacity", 1);
                    hoverDots
                        .attr("cx", x)
                        .attr("cy", d => {
                            const v = pointsBySeriesByX.get(d)?.get(xValues[xIdx]);
                            return Number.isFinite(v) ? yScale(v!) : -9999;
                        })
                        .style("opacity", d => {
                            const v = pointsBySeriesByX.get(d)?.get(xValues[xIdx]);
                            return Number.isFinite(v) ? 1 : 0;
                        });

                    showTooltip(event, xIdx);
                })
                .on("mouseout", () => {
                    hoverLine.style("opacity", 0);
                    hoverDotsGroup.style("opacity", 0);
                    if (settings.tooltip.style === "custom" && this.context.htmlTooltip) {
                        this.context.htmlTooltip.hide();
                    }
                    this.context.tooltipService.hide({ immediately: true, isTouchEvent: false });
                });

            // X axis (only last panel)
            if (settings.showXAxis && groupIndex === groups.length - 1) {
                const xAxisGroup = panelGroup.append("g")
                    .attr("class", "x-axis")
                    .attr("transform", `translate(0, ${groupHeight + 5})`);

                const shouldRotate = needsRotation;
                const skip = labelSkipInterval;

                const visibleIdx: number[] = [];
                for (let i = 0; i < xValues.length; i++) {
                    if (skip <= 1 || i % skip === 0) visibleIdx.push(i);
                }
                const lastIdx = xValues.length - 1;
                if (visibleIdx.length && visibleIdx[visibleIdx.length - 1] !== lastIdx) {
                    visibleIdx.push(lastIdx);
                }
                const visibleSet = new Set(visibleIdx);

                const xAxisColor = this.isHighContrastMode() ? this.getThemeForeground(settings.xAxisColor || "#6b7280") : settings.xAxisColor;

                xValues.forEach((xVal, i) => {
                    if (!visibleSet.has(i)) return;
                    const x = Math.round(xScale(i));

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
                        text.attr("transform", `rotate(-45, ${x}, 5)`).attr("text-anchor", "end");
                    } else {
                        text.attr("text-anchor", "middle");
                    }
                });
            }

            currentY += groupHeight + interPanelGap;
        });

        if (showLegend) {
            this.renderLegend(colorScale, data.maxValue, true, yValues, undefined, undefined, {
                alignFrame: {
                    x: margin.left,
                    y: margin.top,
                    width: plotWidth,
                    height: Math.max(0, this.context.height - margin.top - margin.bottom)
                }
            });
        }
    }
}
