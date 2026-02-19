"use strict";

import {
    d3,
    BaseRenderer,
    RenderContext,
    ChartData,
    formatLabel,
    measureTextWidth,
    formatMeasureValue
} from "@pbi-visuals/shared";
import { IDonutVisualSettings } from "./settings";
import { DonutChartData } from "./DonutChartTransformer";

type Segment = { category: string; value: number };
type OutsideLabelCandidate = {
    arc: d3.PieArcDatum<Segment>;
    primary: string;
    secondary: string | null;
    includeSecondary: boolean;
    color: string;
};

export class DonutChartRenderer extends BaseRenderer<IDonutVisualSettings> {
    private valueFormatString?: string;
    private valueDisplayName?: string;

    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IDonutVisualSettings): void {
        this.settings = settings;
        const donutData = data as DonutChartData;
        this.valueFormatString = donutData.valueFormatString;
        this.valueDisplayName = donutData.valueDisplayName;

        if (!donutData.groups?.length || !donutData.xValues?.length) {
            this.renderNoData();
            return;
        }

        const groups = donutData.groups.length ? donutData.groups : ["All"];
        const categories = donutData.xValues;
        const groupCount = groups.length;

        const showLegend = donutData.hasLegendRoleData;
        const legendReserve = showLegend
            ? this.getLegendReservation({ isOrdinal: true, categories })
            : { top: 0, right: 0, bottom: 0, left: 0 };

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
            bottom: 12 + legendReserve.bottom,
            left: 12 + legendReserve.left
        };

        const totalSpacing = (groupCount - 1) * interPanelGap;
        const availableHeight = this.context.height - margin.top - margin.bottom - totalSpacing;
        const chartWidth = this.context.width - margin.left - margin.right;

        if (availableHeight <= 0 || chartWidth <= 0) {
            return;
        }

        const colorScale = this.getCategoryColors(categories, donutData.categoryColorMap);
        const sliceStrokeColor = this.isHighContrastMode() ? this.getThemeBackground("#ffffff") : "#ffffff";
        const labelTextColor = this.getThemeForeground("#111827");
        const connectorStrokeColor = this.isHighContrastMode() ? this.getThemeForeground("#111827") : "rgba(17,24,39,0.35)";
        const sliceFontSize = this.getEffectiveFontSize(
            settings.textSizes.sliceLabelFontSize > 0 ? settings.textSizes.sliceLabelFontSize : 11,
            6,
            40
        );
        const centerLabelFontSize = this.getEffectiveFontSize(
            settings.textSizes.centerLabelFontSize > 0 ? settings.textSizes.centerLabelFontSize : 11,
            6,
            40
        );
        const centerValueFontSize = this.getEffectiveFontSize(
            settings.textSizes.centerValueFontSize > 0 ? settings.textSizes.centerValueFontSize : 20,
            6,
            120
        );

        let currentY = margin.top;

        groups.forEach((groupName, groupIndex) => {
            const groupHeight = availableHeight / groupCount;
            const panelGroup = this.context.container.append("g")
                .attr("class", "donut-panel")
                .attr("transform", `translate(${Math.round(margin.left)}, ${Math.round(currentY)})`);

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
                    this.addTooltip(title as any, [{ displayName: "Group", value: groupName }], { title: groupName });
                }
            }

            const centerX = chartWidth / 2;
            const centerY = groupHeight / 2;
            const radius = Math.max(10, Math.min(chartWidth, groupHeight) / 2 - 8);
            const innerRadius = Math.max(0, radius * settings.donut.innerRadiusRatio);

            const allSegments = donutData.segmentsByGroup.get(groupName) ?? [];
            const segments: Segment[] = settings.donut.showZeroSlices
                ? allSegments
                : allSegments.filter(s => s.value > 0);

            const total = donutData.totalsByGroup.get(groupName) ?? d3.sum(segments, d => d.value);

            // Keep empty panels blank when a group has no plottable values.
            if (!segments.length || total <= 0) {
                currentY += groupHeight + interPanelGap;
                return;
            }

            const pie = d3.pie<Segment>()
                .padAngle(settings.donut.padAngle)
                .sort(null)
                .value(d => d.value);

            const effectiveCornerRadius = settings.donut.roundedCorners ? settings.donut.cornerRadius : 0;

            const arc = d3.arc<d3.PieArcDatum<Segment>>()
                .innerRadius(innerRadius)
                .outerRadius(radius - 1)
                .cornerRadius(effectiveCornerRadius);

            const arcHover = d3.arc<d3.PieArcDatum<Segment>>()
                .innerRadius(innerRadius)
                .outerRadius(radius + 6)
                .cornerRadius(effectiveCornerRadius);

            const labelArc = d3.arc<d3.PieArcDatum<Segment>>()
                .innerRadius(settings.donutLabels.labelPosition === "inside" ? (innerRadius + (radius - innerRadius) * 0.55) : (radius + 14))
                .outerRadius(settings.donutLabels.labelPosition === "inside" ? (innerRadius + (radius - innerRadius) * 0.55) : (radius + 14));

            const g = panelGroup.append("g")
                .attr("transform", `translate(${Math.round(centerX)}, ${Math.round(centerY)})`);

            const arcs = pie(segments);

            // SVG rendering
            const paths = g.append("g")
                .selectAll("path")
                .data(arcs)
                .join("path")
                .attr("class", "donut-slice")
                .attr("data-selection-key", d => d.data.category)
                .attr("fill", d => colorScale(d.data.category))
                .attr("d", arc as any)
                .attr("stroke", sliceStrokeColor)
                .attr("stroke-width", 1);

            paths.each((d, i, nodes) => {
                const color = colorScale(d.data.category);
                const percent = total > 0 ? (d.data.value / total) : 0;
                const tooltipData = [
                    { displayName: this.valueDisplayName || "Value", value: formatMeasureValue(d.data.value, this.valueFormatString), color },
                    { displayName: "Percent", value: `${(percent * 100).toFixed(1)}%`, color },
                    ...(groupName !== "All" && groupName !== "(Blank)" ? [{ displayName: "Group", value: groupName }] : [])
                ];
                const subtitle = `${(percent * 100).toFixed(1)}%`;
                this.addTooltip(d3.select(nodes[i]) as any, tooltipData, { title: d.data.category, subtitle, color });
            });

            if (settings.donut.enableHover) {
                paths
                    .on("mouseenter", function (_event, _d) {
                        d3.select(this)
                            .attr("d", arcHover as any);
                    })
                    .on("mouseleave", function (_event, _d) {
                        d3.select(this)
                            .attr("d", arc as any);
                    });
            }

            // Labels
            if (settings.donutLabels.showLabels) {
                const minAngle = settings.donutLabels.minLabelAngle;

                const labelGroup = g.append("g")
                    .attr("font-size", `${sliceFontSize}px`)
                    .attr("text-anchor", "middle");

                const labelData = arcs.filter(a => (a.endAngle - a.startAngle) >= minAngle);

                const outsideCandidates: OutsideLabelCandidate[] = [];

                const renderOutsideLabels = (): void => {
                    if (outsideCandidates.length === 0) return;

                    const pad = 16;
                    const columnX = radius + pad;
                    const elbowX = radius + 8;

                    const maxLabelWidth = Math.max(0, (chartWidth / 2) - radius - (pad + 10));

                    const line = d3.line<[number, number]>().curve(d3.curveLinear);
                    const pOuter = d3.arc<d3.PieArcDatum<Segment>>().innerRadius(radius + 1).outerRadius(radius + 1);
                    const pRadial = d3.arc<d3.PieArcDatum<Segment>>().innerRadius(radius + 10).outerRadius(radius + 10);

                    type Placed = OutsideLabelCandidate & {
                        side: "left" | "right";
                        targetY: number;
                        y: number;
                        height: number;
                    };

                    const computeHeight = (fontSize: number, includeSecondary: boolean): number => {
                        const lineH = fontSize * 1.18;
                        return includeSecondary ? (lineH * 2.2) : (lineH * 1.2);
                    };

                    const placed: Placed[] = outsideCandidates.map(c => {
                        const p2 = labelArc.centroid(c.arc);
                        const side: "left" | "right" = (p2[0] ?? 0) >= 0 ? "right" : "left";
                        const targetY = p2[1] ?? 0;
                        return {
                            ...c,
                            side,
                            targetY,
                            y: targetY,
                            height: computeHeight(sliceFontSize, c.includeSecondary)
                        };
                    });

                    const placeSide = (side: "left" | "right") => {
                        const items = placed.filter(p => p.side === side).sort((a, b) => a.targetY - b.targetY);
                        if (items.length === 0) return;

                        const spacing = Math.max(4, sliceFontSize * 0.22);
                        const minY = -(radius + 18);
                        const maxY = (radius + 18);

                        const clamp = (v: number, low: number, high: number): number => Math.max(low, Math.min(high, v));

                        // Start at the ideal target positions.
                        for (const item of items) {
                            item.y = clamp(item.targetY, minY + item.height / 2, maxY - item.height / 2);
                        }

                        // Iterative relaxation: enforce spacing but keep close to target (less drift than greedy-from-top).
                        for (let iter = 0; iter < 3; iter++) {
                            // Forward pass
                            for (let i = 1; i < items.length; i++) {
                                const prev = items[i - 1];
                                const cur = items[i];
                                const minGap = (prev.height / 2) + (cur.height / 2) + spacing;
                                if (cur.y - prev.y < minGap) {
                                    cur.y = prev.y + minGap;
                                }
                            }

                            // Backward pass
                            for (let i = items.length - 2; i >= 0; i--) {
                                const next = items[i + 1];
                                const cur = items[i];
                                const minGap = (cur.height / 2) + (next.height / 2) + spacing;
                                if (next.y - cur.y < minGap) {
                                    cur.y = next.y - minGap;
                                }
                            }

                            // Shift into bounds as a block if needed.
                            const first = items[0];
                            const last = items[items.length - 1];
                            const top = (first.y - first.height / 2);
                            const bottom = (last.y + last.height / 2);

                            if (top < minY) {
                                const delta = minY - top;
                                for (const item of items) item.y += delta;
                            }

                            if (bottom > maxY) {
                                const delta = bottom - maxY;
                                for (const item of items) item.y -= delta;
                            }

                            // Clamp per-item (best-effort).
                            for (const item of items) {
                                item.y = clamp(item.y, minY + item.height / 2, maxY - item.height / 2);
                            }
                        }
                    };

                    placeSide("left");
                    placeSide("right");

                    placed.forEach(p => {
                        const p1 = pOuter.centroid(p.arc);
                        const p2 = pRadial.centroid(p.arc);
                        const anchor = p.side === "right" ? "start" : "end";
                        const labelX = p.side === "right" ? columnX : -columnX;
                        const elbow = p.side === "right" ? elbowX : -elbowX;

                        g.append("path")
                            .attr("d", line([p1 as any, p2 as any, [elbow, p.y] as any, [labelX, p.y] as any]) as any)
                            .attr("fill", "none")
                            .attr("stroke", connectorStrokeColor)
                            .attr("stroke-width", 1);

                        const text = labelGroup.append("text")
                            .attr("x", Math.round(labelX + (p.side === "right" ? 2 : -2)))
                            .attr("y", Math.round(p.y))
                            .attr("text-anchor", anchor)
                            .attr("fill", labelTextColor);

                        const primaryText = formatLabel(p.primary, maxLabelWidth, sliceFontSize);
                        text.append("tspan")
                            .attr("class", "donut-label")
                            .attr("x", Math.round(labelX + (p.side === "right" ? 2 : -2)))
                            .attr("dy", p.includeSecondary ? "-0.1em" : "0.35em")
                            .text(primaryText);

                        if (p.includeSecondary && p.secondary) {
                            text.append("tspan")
                                .attr("class", "donut-label-secondary")
                                .attr("x", Math.round(labelX + (p.side === "right" ? 2 : -2)))
                                .attr("dy", "1.15em")
                                .text(p.secondary);
                        }

                        if (primaryText !== p.primary) {
                            this.addTooltip(text as any, [{ displayName: "Category", value: p.arc.data.category }], { title: p.arc.data.category, color: p.color });
                        }
                    });
                };

                const tryRenderInsideLabel = (a: d3.PieArcDatum<Segment>): boolean => {
                    const color = colorScale(a.data.category);
                    const primary = this.getLabelPrimary(a, total);
                    const secondary = this.getLabelSecondary(a, total);

                    const thickness = Math.max(1, radius - innerRadius);
                    const labelRadius = innerRadius + thickness * 0.55;
                    const angle = Math.max(0, a.endAngle - a.startAngle);
                    const chord = 2 * labelRadius * Math.sin(angle / 2);

                    // Be conservative: inside text has to fit a curved wedge, not a perfect rectangle.
                    const availableWidth = Math.max(0, (chord - 12) * 0.68);
                    const availableHeight = Math.max(0, (thickness * 0.74));

                    const minFont = Math.max(4, Math.min(sliceFontSize, settings.donutLabels.minFontSize || 9));

                    // We render primary labels at font-weight:600 which tends to measure slightly wider.
                    // Use a conservative multiplier to avoid "almost fits" labels overflowing their slice.
                    const measurePrimary = (text: string, fontSize: number): number =>
                        measureTextWidth(text, fontSize, "Segoe UI") * 1.10;
                    const measureSecondary = (text: string, fontSize: number): number =>
                        measureTextWidth(text, fontSize, "Segoe UI") * 1.04;

                    const fit = (fontSize: number, includeSecondary: boolean): boolean => {
                        const lineHeight = fontSize * 1.15;
                        const heightNeeded = includeSecondary ? (lineHeight * 2.15) : (lineHeight * 1.2);
                        if (heightNeeded > availableHeight) return false;

                        const primaryW = measurePrimary(primary, fontSize);
                        if (primaryW > availableWidth) return false;

                        if (includeSecondary && secondary) {
                            const secondarySize = Math.max(minFont, Math.round(fontSize * 0.9));
                            const secondaryW = measureSecondary(secondary, secondarySize);
                            if (secondaryW > availableWidth) return false;
                        }
                        return true;
                    };

                    const canShowSecondary = Boolean(secondary);
                    let includeSecondary = canShowSecondary;
                    let fontSize = sliceFontSize;

                    if (settings.donutLabels.autoFit) {
                        // Drop secondary early on small slices.
                        if (includeSecondary && angle < 0.55) {
                            includeSecondary = false;
                        }

                        const computeFontSize = (includeSec: boolean): number => {
                            const basePrimaryW = measurePrimary(primary, sliceFontSize);
                            const widthRatio = basePrimaryW > 0 ? (availableWidth / basePrimaryW) : 1;

                            let ratio = widthRatio;

                            if (includeSec && secondary) {
                                const baseSecondaryW = measureSecondary(secondary, sliceFontSize * 0.9);
                                const secondaryRatio = baseSecondaryW > 0 ? (availableWidth / baseSecondaryW) : 1;
                                ratio = Math.min(ratio, secondaryRatio);
                            }

                            const baseLineHeight = sliceFontSize * 1.15;
                            const baseHeightNeeded = includeSec ? (baseLineHeight * 2.15) : (baseLineHeight * 1.2);
                            const heightRatio = baseHeightNeeded > 0 ? (availableHeight / baseHeightNeeded) : 1;
                            ratio = Math.min(ratio, heightRatio);

                            // Extra safety margin inside curved wedges.
                            ratio *= 0.92;

                            const next = Math.floor(sliceFontSize * Math.min(1, ratio));
                            return Math.max(minFont, Math.min(sliceFontSize, next));
                        };

                        // First try with secondary, then fall back to primary-only.
                        let candidate = computeFontSize(includeSecondary);
                        if (includeSecondary && !fit(candidate, includeSecondary)) {
                            includeSecondary = false;
                            candidate = computeFontSize(includeSecondary);
                        }

                        fontSize = candidate;

                        // Final small adjustment if rounding still overflows.
                        let guard = 0;
                        while (guard++ < 8 && fontSize > minFont && !fit(fontSize, includeSecondary)) {
                            fontSize -= 1;
                        }
                    }

                    const fitsNow = settings.donutLabels.autoFit ? fit(fontSize, includeSecondary) : true;
                    if (!fitsNow) {
                        return false;
                    }

                    const p = labelArc.centroid(a);
                    const text = labelGroup.append("text")
                        .attr("transform", `translate(${p})`)
                        .attr("text-anchor", "middle");

                    // Inside labels should never ellipsize; if it doesn't fit, it should go outside.
                    const primaryText = primary;
                    text.append("tspan")
                        .attr("class", "donut-label")
                        .attr("x", 0)
                        .attr("y", includeSecondary ? "-0.35em" : "0.35em")
                        .attr("font-size", `${fontSize}px`)
                        .attr("fill", this.getContrastColor(color))
                        .text(primaryText);

                    if (includeSecondary && secondary) {
                        const secondarySize = Math.max(minFont, Math.round(fontSize * 0.9));
                        text.append("tspan")
                            .attr("class", "donut-label-secondary")
                            .attr("x", 0)
                            .attr("y", "0.85em")
                            .attr("font-size", `${secondarySize}px`)
                            .attr("fill", this.getContrastColor(color))
                            .text(secondary);
                    }

                    return true;
                };

                if (settings.donutLabels.labelPosition === "outside") {
                    labelData.forEach(a => {
                        const color = colorScale(a.data.category);
                        outsideCandidates.push({
                            arc: a,
                            primary: this.getLabelPrimary(a, total),
                            secondary: this.getLabelSecondary(a, total),
                            includeSecondary: Boolean(this.getLabelSecondary(a, total)),
                            color
                        });
                    });
                    renderOutsideLabels();
                } else {
                    labelData.forEach(a => {
                        const renderedInside = tryRenderInsideLabel(a);
                        if (!renderedInside && settings.donutLabels.overflowToOutside) {
                            const color = colorScale(a.data.category);
                            outsideCandidates.push({
                                arc: a,
                                primary: this.getLabelPrimary(a, total),
                                secondary: this.getLabelSecondary(a, total),
                                includeSecondary: Boolean(this.getLabelSecondary(a, total)),
                                color
                            });
                        }
                    });
                    renderOutsideLabels();
                }
            }

            // Center label
            if (settings.donut.showCenter) {
                const label = formatLabel(settings.donut.centerLabel || "", innerRadius * 1.8, centerLabelFontSize);
                g.append("text")
                    .attr("class", "donut-center-label")
                    .attr("text-anchor", "middle")
                    .attr("y", settings.donut.centerValueMode === "total" ? -4 : 4)
                    .attr("font-size", `${centerLabelFontSize}px`)
                    .attr("fill", this.getThemeForeground("#111827"))
                    .text(label);

                if (settings.donut.centerValueMode === "total") {
                    g.append("text")
                        .attr("class", "donut-center-value")
                        .attr("text-anchor", "middle")
                        .attr("y", centerValueFontSize * 0.9)
                        .attr("font-size", `${centerValueFontSize}px`)
                        .attr("fill", this.getThemeForeground("#111827"))
                        .text(formatMeasureValue(total, this.valueFormatString));
                }
            }

            currentY += groupHeight + interPanelGap;
        });

        // Legend (categorical)
        if (showLegend) {
            this.renderLegend(colorScale, donutData.maxValue, true, categories, undefined, undefined, {
                alignFrame: {
                    x: margin.left,
                    y: margin.top,
                    width: chartWidth,
                    height: Math.max(0, this.context.height - margin.top - margin.bottom)
                }
            });
        }
    }

    private getLabelPrimary(d: d3.PieArcDatum<Segment>, total: number): string {
        const percent = total > 0 ? (d.data.value / total) : 0;
        switch (this.settings.donutLabels.labelMode) {
            case "category":
                return d.data.category;
            case "value":
                return formatMeasureValue(d.data.value, this.valueFormatString);
            case "percent":
                return `${Math.round(percent * 100)}%`;
            case "categoryPercent":
            default:
                return d.data.category;
        }
    }

    private getLabelSecondary(d: d3.PieArcDatum<Segment>, total: number): string | null {
        const percent = total > 0 ? (d.data.value / total) : 0;
        switch (this.settings.donutLabels.labelMode) {
            case "categoryPercent":
                return `${Math.round(percent * 100)}%`;
            default:
                return null;
        }
    }
}
