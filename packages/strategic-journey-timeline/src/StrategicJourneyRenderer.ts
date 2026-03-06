"use strict";

import powerbi from "powerbi-visuals-api";
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import { d3, BaseRenderer, ChartData, RenderContext, formatLabel } from "@pbi-visuals/shared";
import { IStrategicJourneyVisualSettings } from "./settings";
import { JourneyChartData, JourneyItem, JourneyLane } from "./StrategicJourneyTransformer";

interface LanePlacement {
    item: JourneyItem;
    x: number;
    y: number;
    width: number;
    height: number;
    slot: number;
}

interface LaneLayoutResult {
    placements: LanePlacement[];
    usedWidth: number;
}

interface ViewportWindow {
    left: number;
    right: number;
    width: number;
}

type NumericScale = ReturnType<typeof d3.scaleLinear>;
type TickMode = "month" | "week" | "day";

interface CalendarTickResult {
    ticks: number[];
    mode: TickMode;
}

interface LaneVisualSpec {
    cardHeight: number;
    maxSlots: number;
    slotGap: number;
}

function startOfUtcDay(timestamp: number): number {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function addUtcDays(timestamp: number, days: number): number {
    return timestamp + (days * 24 * 60 * 60 * 1000);
}

function startOfUtcWeek(timestamp: number): number {
    const date = new Date(startOfUtcDay(timestamp));
    const day = date.getUTCDay();
    const diff = (day + 6) % 7;
    return addUtcDays(date.getTime(), -diff);
}

function startOfUtcMonth(timestamp: number): number {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function addUtcMonths(timestamp: number, months: number): number {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
}

export class StrategicJourneyRenderer extends BaseRenderer<IStrategicJourneyVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IStrategicJourneyVisualSettings): void {
        this.settings = settings;
        const chartData = data as JourneyChartData;

        if (!chartData.items.length) {
            this.renderNoData();
            return;
        }

        const statuses = chartData.statuses.length > 0 ? chartData.statuses : ["(Blank)"];
        const legendReservation = settings.showLegend
            ? this.getLegendReservation({
                isOrdinal: true,
                categories: statuses,
                legendFontSize: settings.legendFontSize,
                availableWidth: this.context.width,
                availableHeight: this.context.height
            })
            : { top: 0, right: 0, bottom: 0, left: 0 };

        const margin = {
            top: 18 + legendReservation.top,
            right: 18 + legendReservation.right,
            bottom: 26 + legendReservation.bottom,
            left: 18 + legendReservation.left
        };

        const chartWidth = this.context.width - margin.left - margin.right;
        const chartHeight = this.context.height - margin.top - margin.bottom;
        if (chartWidth <= 0 || chartHeight <= 0) {
            return;
        }

        const minDateMs = chartData.minDateMs;
        const maxDateMs = chartData.maxDateMs;

        const xScale = d3.scaleLinear()
            .domain([minDateMs, maxDateMs])
            .range([margin.left, margin.left + chartWidth]);

        const axisReserve = settings.showXAxis ? Math.max(24, settings.xAxisFontSize + 16) : 10;
        const laneGap = Math.max(8, Math.min(settings.timeline.laneGap, Math.floor(chartHeight * 0.14)));
        const availableBandBudget = Math.max(48, chartHeight - axisReserve - (laneGap * 2));
        const topBandHeight = Math.max(24, Math.min(settings.timeline.cardBandHeight, Math.floor(availableBandBudget / 2)));
        const bottomBandHeight = Math.max(24, availableBandBudget - topBandHeight);
        const topBandY = margin.top;
        const spineY = topBandY + topBandHeight + laneGap + axisReserve;
        const bottomBandY = spineY + laneGap;

        const topItems = chartData.items.filter((item) => item.lane === "top");
        const bottomItems = chartData.items.filter((item) => item.lane === "bottom");
        const topLaneSpec = this.resolveLaneVisualSpec(topBandHeight, topItems.length);
        const bottomLaneSpec = this.resolveLaneVisualSpec(bottomBandHeight, bottomItems.length);
        const viewport = this.getViewportWindow();

        const topLayout = this.layoutLane(topItems, "top", {
            xScale,
            chartLeft: margin.left,
            chartRight: margin.left + chartWidth,
            spineY,
            laneGap,
            cardBandHeight: topBandHeight,
            minWidth: settings.card.minWidth,
            maxWidth: settings.card.maxWidth,
            cardHeight: topLaneSpec.cardHeight,
            maxSlots: topLaneSpec.maxSlots,
            slotGap: topLaneSpec.slotGap
        });

        const bottomLayout = this.layoutLane(bottomItems, "bottom", {
            xScale,
            chartLeft: margin.left,
            chartRight: margin.left + chartWidth,
            spineY,
            laneGap,
            cardBandHeight: bottomBandHeight,
            minWidth: settings.card.minWidth,
            maxWidth: settings.card.maxWidth,
            cardHeight: bottomLaneSpec.cardHeight,
            maxSlots: bottomLaneSpec.maxSlots,
            slotGap: bottomLaneSpec.slotGap
        });

        const statusColorScale = this.getCategoryColors(statuses, chartData.categoryColorMap);

        const panel = this.context.container.append("g")
            .attr("class", "journey-panel");

        panel.append("rect")
            .attr("x", margin.left)
            .attr("y", topBandY)
            .attr("width", chartWidth)
            .attr("height", topBandHeight)
            .attr("class", "journey-band journey-band-top");

        panel.append("rect")
            .attr("x", margin.left)
            .attr("y", bottomBandY)
            .attr("width", chartWidth)
            .attr("height", bottomBandHeight)
            .attr("class", "journey-band journey-band-bottom");

        this.renderAxisAndSpine(panel, xScale, spineY, minDateMs, maxDateMs, chartWidth, chartHeight);

        if (settings.timeline.showTodayLine) {
            this.renderTodayLine(panel, xScale, spineY, topBandY, margin.top + chartHeight);
        }

        this.renderLaneItems(panel, topLayout, "top", xScale, spineY, statusColorScale, chartData.hasIncomingHighlights, viewport);
        this.renderLaneItems(panel, bottomLayout, "bottom", xScale, spineY, statusColorScale, chartData.hasIncomingHighlights, viewport);

        if (settings.showLegend && statuses.length > 0) {
            this.renderLegend(statusColorScale, chartData.maxValue, true, statuses, undefined, undefined, {
                alignFrame: {
                    x: margin.left,
                    y: 0,
                    width: chartWidth,
                    height: Math.max(0, margin.top - 6)
                },
                availableWidth: chartWidth,
                availableHeight: Math.max(0, margin.top - 6)
            });
        }
    }

    private renderAxisAndSpine(
        panel: d3.Selection<SVGGElement, unknown, null, undefined>,
        xScale: NumericScale,
        spineY: number,
        minDateMs: number,
        maxDateMs: number,
        chartWidth: number,
        chartHeight: number
    ): void {
        const axisColor = this.isHighContrastMode() ? this.getThemeForeground("#1f2937") : "#cbd5e1";
        const axisTextColor = this.isHighContrastMode() ? this.getThemeForeground(this.settings.xAxisColor) : this.settings.xAxisColor;
        const x = (value: number): number => Number((xScale as any)(value));

        panel.append("line")
            .attr("class", "journey-spine")
            .attr("x1", x(minDateMs))
            .attr("x2", x(maxDateMs))
            .attr("y1", spineY)
            .attr("y2", spineY)
            .attr("stroke", axisColor)
            .attr("stroke-width", this.settings.timeline.spineThickness);

        if (!this.settings.showXAxis) {
            return;
        }

        const { ticks, mode } = this.buildCalendarTicks(minDateMs, maxDateMs, chartWidth);
        const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });
        const monthYearFormatter = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
        const dayMonthFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
        const dayMonthYearFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

        const axisFontSize = Math.max(8, this.settings.xAxisFontSize);
        const textDecoration = this.settings.xAxisUnderline ? "underline" : null;

        const tickGroup = panel.append("g").attr("class", "journey-axis");

        tickGroup.selectAll("line.journey-tick")
            .data(ticks)
            .join("line")
            .attr("class", "journey-tick")
            .attr("x1", (tick) => this.snapToPixelInt(x(tick)))
            .attr("x2", (tick) => this.snapToPixelInt(x(tick)))
            .attr("y1", spineY - 6)
            .attr("y2", spineY + 6)
            .attr("stroke", axisColor)
            .attr("stroke-width", 1);

        tickGroup.selectAll("text.journey-axis-label")
            .data(ticks)
            .join("text")
            .attr("class", "journey-axis-label")
            .attr("x", (tick) => this.snapToPixelInt(x(tick)))
            .attr("y", spineY - 10)
            .attr("text-anchor", "middle")
            .attr("font-size", `${axisFontSize}px`)
            .attr("font-family", this.settings.xAxisFontFamily)
            .attr("font-weight", this.settings.xAxisBold ? "700" : "500")
            .attr("font-style", this.settings.xAxisItalic ? "italic" : "normal")
            .attr("text-decoration", textDecoration)
            .attr("fill", axisTextColor)
            .text((tick, index) => {
                const value = Number(tick);
                const date = new Date(value);
                const previous = index > 0 ? new Date(Number(ticks[index - 1])) : null;

                if (mode === "month") {
                    return !previous || previous.getUTCFullYear() !== date.getUTCFullYear()
                        ? monthYearFormatter.format(date)
                        : monthFormatter.format(date);
                }

                return !previous || previous.getUTCFullYear() !== date.getUTCFullYear()
                    ? dayMonthYearFormatter.format(date)
                    : dayMonthFormatter.format(date);
            });

        if (chartHeight < 150) {
            tickGroup.selectAll("text.journey-axis-label")
                .attr("transform", (tick) => {
                    const tickX = this.snapToPixelInt(x(Number(tick)));
                    return `rotate(-24 ${tickX} ${spineY - 10})`;
                })
                .attr("text-anchor", "end");
        }
    }

    private renderTodayLine(
        panel: d3.Selection<SVGGElement, unknown, null, undefined>,
        xScale: NumericScale,
        spineY: number,
        topY: number,
        bottomY: number
    ): void {
        const todayMs = Date.now();
        const domain = xScale.domain().map((value) => Number(value));
        if (todayMs < domain[0] || todayMs > domain[1]) {
            return;
        }

        const todayX = this.snapToPixelInt(Number((xScale as any)(todayMs)));
        const color = this.isHighContrastMode() ? this.getThemeForegroundSelected("#dc2626") : "#ef4444";

        panel.append("line")
            .attr("class", "journey-today-line")
            .attr("x1", todayX)
            .attr("x2", todayX)
            .attr("y1", topY)
            .attr("y2", bottomY)
            .attr("stroke", color)
            .attr("stroke-dasharray", "7 5")
            .attr("stroke-width", 2);

        panel.append("text")
            .attr("class", "journey-today-label")
            .attr("x", todayX + 6)
            .attr("y", Math.max(topY + 14, spineY - 10))
            .attr("font-size", "11px")
            .attr("font-weight", "700")
            .attr("fill", color)
            .text("Today");
    }

    private renderLaneItems(
        panel: d3.Selection<SVGGElement, unknown, null, undefined>,
        layout: LaneLayoutResult,
        lane: JourneyLane,
        xScale: NumericScale,
        spineY: number,
        statusColorScale: d3.ScaleOrdinal<string, string, never>,
        hasIncomingHighlights: boolean,
        viewport: ViewportWindow
    ): void {
        const cardStroke = this.isHighContrastMode() ? this.getThemeForeground("#1f2937") : "#dbe2ea";
        const cardFill = this.isHighContrastMode() ? this.getThemeBackground("#ffffff") : "#f8fafc";
        const visibleCardKeys = this.selectRenderableCardKeys(layout.placements, viewport);

        layout.placements.forEach((placement) => {
            const item = placement.item;
            const color = statusColorScale(item.statusKey);
            const anchorX = this.snapToPixelInt(Number((xScale as any)(item.anchorDateMs)));
            const shouldRenderCard = visibleCardKeys.has(item.selectionKey);
            const connectorEndY = lane === "top" ? placement.y + placement.height : placement.y;

            const itemGroup = panel.append("g")
                .attr("class", "journey-item")
                .attr("data-selection-key", item.selectionKey)
                .attr("opacity", hasIncomingHighlights ? (item.isHighlighted ? 1 : 0.32) : 1);

            if (shouldRenderCard) {
                itemGroup.append("line")
                    .attr("class", "journey-connector")
                    .attr("x1", anchorX)
                    .attr("x2", anchorX)
                    .attr("y1", spineY)
                    .attr("y2", connectorEndY)
                    .attr("stroke", color)
                    .attr("stroke-width", 1.4)
                    .attr("opacity", this.settings.marker.connectorOpacity)
                    .attr("data-selection-key", item.selectionKey);
            }

            if (item.kind === "span" && item.startDateMs !== null && item.endDateMs !== null) {
                const x1 = this.snapToPixelInt(Number((xScale as any)(item.startDateMs)));
                const x2 = this.snapToPixelInt(Number((xScale as any)(item.endDateMs)));
                itemGroup.append("line")
                    .attr("class", "journey-span")
                    .attr("x1", Math.min(x1, x2))
                    .attr("x2", Math.max(x1, x2))
                    .attr("y1", spineY)
                    .attr("y2", spineY)
                    .attr("stroke", color)
                    .attr("stroke-width", this.settings.marker.spanThickness)
                    .attr("stroke-linecap", "round")
                    .attr("opacity", 0.94)
                    .attr("data-selection-key", item.selectionKey);
            }

            const marker = itemGroup.append("circle")
                .attr("class", "journey-marker")
                .attr("cx", anchorX)
                .attr("cy", spineY)
                .attr("r", this.settings.marker.milestoneRadius)
                .attr("fill", item.kind === "milestone" ? "#ffffff" : color)
                .attr("stroke", color)
                .attr("stroke-width", item.kind === "milestone" ? 3 : 2)
                .attr("data-selection-key", item.selectionKey)
                .style("pointer-events", "all") as any;

            if (!shouldRenderCard) {
                const tooltipData: VisualTooltipDataItem[] = item.tooltipItems.map((row) => ({
                    displayName: row.displayName,
                    value: row.value
                }));

                this.addTooltip(marker, tooltipData, {
                    title: item.title,
                    subtitle: item.statusKey,
                    color
                });
                return;
            }

            const cardGroup = itemGroup.append("g")
                .attr("class", "journey-card-group")
                .attr("transform", `translate(${Math.round(placement.x)}, ${Math.round(placement.y)})`);

            cardGroup.append("rect")
                .attr("class", "journey-card")
                .attr("width", placement.width)
                .attr("height", placement.height)
                .attr("rx", this.settings.card.cornerRadius)
                .attr("ry", this.settings.card.cornerRadius)
                .attr("fill", cardFill)
                .attr("stroke", cardStroke)
                .attr("stroke-width", this.settings.card.borderWidth)
                .style("filter", this.settings.card.shadow ? "drop-shadow(0 2px 5px rgba(15, 23, 42, 0.12))" : null)
                .attr("data-selection-key", item.selectionKey);

            cardGroup.append("rect")
                .attr("class", "journey-card-status")
                .attr("width", placement.width)
                .attr("height", 4)
                .attr("rx", this.settings.card.cornerRadius)
                .attr("ry", this.settings.card.cornerRadius)
                .attr("fill", color)
                .attr("data-selection-key", item.selectionKey);

            const titlePaddingX = 10;
            const titleWidth = Math.max(20, placement.width - (titlePaddingX * 2));
            const titleText = formatLabel(item.title, titleWidth, this.settings.text.titleFontSize);
            const subtitlePrimary = item.subtitle || (item.group !== "(Blank)" ? item.group : "");
            const subtitleSecondary = item.subtitle && item.group !== "(Blank)" ? item.group : "";

            cardGroup.append("text")
                .attr("class", "journey-card-title")
                .attr("x", titlePaddingX)
                .attr("y", 22)
                .attr("font-size", `${this.settings.text.titleFontSize}px`)
                .attr("font-weight", "700")
                .attr("fill", this.settings.text.titleColor)
                .text(titleText)
                .attr("data-selection-key", item.selectionKey);

            if (subtitlePrimary) {
                cardGroup.append("text")
                    .attr("class", "journey-card-subtitle")
                    .attr("x", titlePaddingX)
                    .attr("y", 40)
                    .attr("font-size", `${this.settings.text.subtitleFontSize}px`)
                    .attr("fill", this.settings.text.subtitleColor)
                    .text(formatLabel(subtitlePrimary, titleWidth, this.settings.text.subtitleFontSize))
                    .attr("data-selection-key", item.selectionKey);
            }

            if (subtitleSecondary) {
                cardGroup.append("text")
                    .attr("class", "journey-card-group")
                    .attr("x", titlePaddingX)
                    .attr("y", 56)
                    .attr("font-size", `${Math.max(8, this.settings.text.subtitleFontSize - 1)}px`)
                    .attr("fill", this.settings.text.subtitleColor)
                    .text(formatLabel(subtitleSecondary, titleWidth, Math.max(8, this.settings.text.subtitleFontSize - 1)))
                    .attr("data-selection-key", item.selectionKey);
            }

            const tooltipData: VisualTooltipDataItem[] = item.tooltipItems.map((row) => ({
                displayName: row.displayName,
                value: row.value
            }));

            this.addTooltip(marker, tooltipData, {
                title: item.title,
                subtitle: item.statusKey,
                color
            });

            this.addTooltip(cardGroup.select("rect.journey-card") as any, tooltipData, {
                title: item.title,
                subtitle: item.statusKey,
                color
            });
        });
    }

    private layoutLane(
        laneItems: JourneyItem[],
        lane: JourneyLane,
        config: {
            xScale: NumericScale;
            chartLeft: number;
            chartRight: number;
            spineY: number;
            laneGap: number;
            cardBandHeight: number;
            minWidth: number;
            maxWidth: number;
            cardHeight: number;
            maxSlots: number;
            slotGap: number;
        }
    ): LaneLayoutResult {
        if (!laneItems.length) {
            return { placements: [], usedWidth: config.maxWidth };
        }

        const sorted = [...laneItems].sort((a, b) => a.anchorDateMs - b.anchorDateMs);
        const slotGap = config.slotGap;
        const cardGap = 8;
        const maxSlots = Math.max(1, config.maxSlots);

        const placeWithWidth = (cardWidth: number): { placements: LanePlacement[]; forcedOverlap: boolean } => {
            const slotsEnd = Array.from({ length: maxSlots }, () => Number.NEGATIVE_INFINITY);
            const placements: LanePlacement[] = [];
            let forcedOverlap = false;

            sorted.forEach((item) => {
                const anchorX = Number((config.xScale as any)(item.anchorDateMs));
                const unclampedX = anchorX - (cardWidth / 2);
                const x = Math.max(config.chartLeft, Math.min(config.chartRight - cardWidth, unclampedX));

                let targetSlot = -1;
                for (let slot = 0; slot < maxSlots; slot++) {
                    if (x >= (slotsEnd[slot] + cardGap)) {
                        targetSlot = slot;
                        break;
                    }
                }

                if (targetSlot < 0) {
                    forcedOverlap = true;
                    targetSlot = slotsEnd.reduce((best, current, slot) => current < slotsEnd[best] ? slot : best, 0);
                }

                slotsEnd[targetSlot] = Math.max(slotsEnd[targetSlot], x + cardWidth);

                const y = lane === "top"
                    ? config.spineY - config.laneGap - ((targetSlot + 1) * (config.cardHeight + slotGap))
                    : config.spineY + config.laneGap + (targetSlot * (config.cardHeight + slotGap));

                placements.push({
                    item,
                    x,
                    y,
                    width: cardWidth,
                    height: config.cardHeight,
                    slot: targetSlot
                });
            });

            return { placements, forcedOverlap };
        };

        let selectedWidth = config.maxWidth;
        let selectedPlacements: LanePlacement[] = [];

        for (let width = config.maxWidth; width >= config.minWidth; width -= 10) {
            const layout = placeWithWidth(width);
            selectedWidth = width;
            selectedPlacements = layout.placements;
            if (!layout.forcedOverlap) {
                break;
            }
        }

        return {
            placements: selectedPlacements,
            usedWidth: selectedWidth
        };
    }

    private buildCalendarTicks(minDateMs: number, maxDateMs: number, chartWidth: number): CalendarTickResult {
        const dayMs = 24 * 60 * 60 * 1000;
        const spanDays = Math.max(1, Math.round((maxDateMs - minDateMs) / dayMs));
        const maxTicks = Math.max(2, Math.floor(chartWidth / 90));

        if (spanDays > 70) {
            const monthStart = startOfUtcMonth(minDateMs);
            const monthCount = Math.max(
                1,
                ((new Date(maxDateMs).getUTCFullYear() - new Date(monthStart).getUTCFullYear()) * 12)
                    + (new Date(maxDateMs).getUTCMonth() - new Date(monthStart).getUTCMonth())
                    + 1
            );
            const stepMonths = Math.max(1, Math.ceil(monthCount / maxTicks));
            const ticks: number[] = [];

            let cursor = monthStart;
            while (cursor <= maxDateMs) {
                if (cursor >= minDateMs) {
                    ticks.push(cursor);
                }
                cursor = addUtcMonths(cursor, stepMonths);
            }

            if (!ticks.length) {
                ticks.push(minDateMs, maxDateMs);
            }

            return { ticks, mode: "month" };
        }

        if (spanDays > 21) {
            const stepWeeks = Math.max(1, Math.ceil((spanDays / 7) / maxTicks));
            const ticks: number[] = [];
            let cursor = startOfUtcWeek(minDateMs);

            while (cursor < minDateMs) {
                cursor = addUtcDays(cursor, stepWeeks * 7);
            }

            while (cursor <= maxDateMs) {
                ticks.push(cursor);
                cursor = addUtcDays(cursor, stepWeeks * 7);
            }

            return { ticks: ticks.length ? ticks : [minDateMs, maxDateMs], mode: "week" };
        }

        const stepDays = Math.max(1, Math.ceil(spanDays / maxTicks));
        const ticks: number[] = [];
        let cursor = startOfUtcDay(minDateMs);

        while (cursor < minDateMs) {
            cursor = addUtcDays(cursor, stepDays);
        }

        while (cursor <= maxDateMs) {
            ticks.push(cursor);
            cursor = addUtcDays(cursor, stepDays);
        }

        return { ticks: ticks.length ? ticks : [minDateMs, maxDateMs], mode: "day" };
    }

    private resolveLaneVisualSpec(bandHeight: number, itemCount: number): LaneVisualSpec {
        const slotGap = 12;
        const desiredSlots = itemCount > 12 ? 3 : itemCount > 5 ? 2 : 1;
        const maxSlotsByHeight = Math.max(1, Math.floor((bandHeight + slotGap) / (44 + slotGap)));
        const maxSlots = Math.max(1, Math.min(3, desiredSlots, maxSlotsByHeight));
        const availableHeight = bandHeight - (slotGap * (maxSlots - 1));
        const cardHeight = Math.max(40, Math.min(72, Math.floor(availableHeight / maxSlots)));

        return {
            cardHeight,
            maxSlots,
            slotGap
        };
    }

    private getViewportWindow(): ViewportWindow {
        const root = this.context.root;
        const left = Math.max(0, root?.scrollLeft ?? 0);
        const width = Math.max(1, root?.clientWidth ?? this.context.width);
        return {
            left,
            right: left + width,
            width
        };
    }

    private selectRenderableCardKeys(placements: LanePlacement[], viewport: ViewportWindow): Set<string> {
        if (placements.length <= 18) {
            return new Set(placements.map((placement) => placement.item.selectionKey));
        }

        const overscan = Math.max(180, Math.round(viewport.width * 0.18));
        const candidates = placements.filter((placement) =>
            (placement.x + placement.width) >= (viewport.left - overscan)
            && placement.x <= (viewport.right + overscan)
        );

        if (candidates.length <= 12) {
            return new Set(candidates.map((placement) => placement.item.selectionKey));
        }

        const selected = new Set<string>();
        const minGap = candidates.length > 26 ? 170 : candidates.length > 18 ? 145 : 120;
        let lastCenter = Number.NEGATIVE_INFINITY;

        candidates.forEach((placement, index) => {
            const center = placement.x + (placement.width / 2);
            const isBoundary = index === 0 || index === candidates.length - 1;
            if (isBoundary || center - lastCenter >= minGap) {
                selected.add(placement.item.selectionKey);
                lastCenter = center;
            }
        });

        return selected;
    }
}
