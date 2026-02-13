"use strict";

import {
    d3,
    BaseRenderer,
    ChartData,
    RenderContext,
    formatLabel,
    formatMeasureValue
} from "@pbi-visuals/shared";
import { IWorldHistoryTimelineVisualSettings } from "./settings";
import { TimelineTemporalLevel, WorldHistoryTimelineData, WorldHistoryTimelinePoint } from "./WorldHistoryTimelineTransformer";

interface TimelineRow {
    key: string;
    point: WorldHistoryTimelinePoint;
}

type AxisLevel = "year" | "quarter" | "month" | "day";

interface AxisLabelRun {
    label: string;
    startX: number;
    endX: number;
    startValue: number;
    endValue: number;
}

export class WorldHistoryTimelineRenderer extends BaseRenderer<IWorldHistoryTimelineVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IWorldHistoryTimelineVisualSettings): void {
        this.settings = settings;
        const timelineData = data as WorldHistoryTimelineData;

        if (!timelineData.items.length) {
            this.renderNoData();
            return;
        }

        const axisFontSize = this.getEffectiveFontSize(
            settings.textSizes.xAxisFontSize > 0 ? settings.textSizes.xAxisFontSize : settings.xAxisFontSize,
            6,
            40
        );
        const laneFontSize = this.getEffectiveFontSize(
            settings.textSizes.yAxisFontSize > 0 ? settings.textSizes.yAxisFontSize : settings.yAxisFontSize,
            6,
            40
        );
        const labelFontSize = this.getEffectiveFontSize(
            settings.textSizes.endLabelFontSize > 0 ? settings.textSizes.endLabelFontSize : settings.yAxisFontSize,
            6,
            40
        );
        const legendFontSize = this.getEffectiveFontSize(
            settings.textSizes.legendFontSize > 0 ? settings.textSizes.legendFontSize : settings.legendFontSize,
            6,
            40
        );
        const legendAvailableWidth = Math.max(120, (this.context.root?.clientWidth || this.context.width) - 16);
        const legendAvailableHeight = Math.max(80, (this.context.root?.clientHeight || this.context.height) - 16);

        const hasLegend = settings.showLegend && timelineData.hasRegionRoleData && timelineData.regions.length > 0;
        const legendReserve = hasLegend
            ? this.getLegendReservation({
                isOrdinal: true,
                categories: timelineData.regions,
                legendFontSize,
                availableWidth: legendAvailableWidth,
                availableHeight: legendAvailableHeight
            })
            : { top: 0, right: 0, bottom: 0, left: 0 };

        const sortedItems = [...timelineData.items].sort((a, b) => {
            const timeCompare = (): number => {
                const startCmp = a.startYear - b.startYear;
                if (startCmp !== 0) return startCmp;
                return a.endYear - b.endYear;
            };

            switch (settings.timeline.sortBy) {
                case "region": {
                    const regionCmp = a.region.localeCompare(b.region);
                    if (regionCmp !== 0) return regionCmp;
                    break;
                }
                case "category": {
                    const categoryCmp = a.civilization.localeCompare(b.civilization);
                    if (categoryCmp !== 0) return categoryCmp;
                    break;
                }
                case "end": {
                    const endCmp = a.endYear - b.endYear;
                    if (endCmp !== 0) return endCmp;
                    break;
                }
                case "duration": {
                    const durationCmp = b.duration - a.duration;
                    if (durationCmp !== 0) return durationCmp;
                    break;
                }
                default:
                    break;
            }

            return timeCompare();
        });

        const rows: TimelineRow[] = sortedItems.map((point, idx) => ({
            key: `${point.civilization}\u001f${idx}`,
            point
        }));

        // Labels are rendered near bars, so keep the structural left gutter minimal.
        const leftLabelSpace = settings.showYAxis ? 18 : 10;
        const isDateScale = timelineData.timeScaleMode === "date";
        const temporalLevel: TimelineTemporalLevel = timelineData.timeTemporalLevel;
        const hasYearContext = isDateScale && timelineData.timeHasYearContext;
        const missingYearContext = isDateScale && !timelineData.timeHasYearContext;
        const axisLevels: AxisLevel[] = (() => {
            if (!isDateScale) {
                return ["year"];
            }
            switch (temporalLevel) {
                case "quarter":
                    return ["year", "quarter"];
                case "month":
                    return ["year", "quarter", "month"];
                case "day":
                    return ["year", "quarter", "month", "day"];
                default:
                    return ["year"];
            }
        })();
        const showAllYearsBanner = missingYearContext && (temporalLevel === "quarter" || temporalLevel === "month" || temporalLevel === "day");
        const axisHeaderHeightFromSettings = Number((settings.timeline as any).axisHeaderHeightPx ?? 0);
        const calculatedAxisHeaderHeight = (() => {
            if (!settings.showXAxis || !settings.timeline.showTopAxis) {
                return 0;
            }
            const rowCount = Math.max(1, axisLevels.length);
            const headerPadTop = 4;
            const bannerHeight = showAllYearsBanner ? Math.max(11, axisFontSize) : 0;
            const bannerGap = showAllYearsBanner ? 3 : 0;
            const rowHeight = Math.max(12, Math.round(axisFontSize + 6));
            const baselineGap = 6;
            const headerPadBottom = 10;
            return headerPadTop + bannerHeight + bannerGap + (rowCount * rowHeight) + baselineGap + headerPadBottom;
        })();

        const showBottomAxis = false;
        const topAxisHeaderHeightPx = settings.showXAxis && settings.timeline.showTopAxis
            ? Math.max(0, Math.round(axisHeaderHeightFromSettings || calculatedAxisHeaderHeight))
            : 0;
        const bottomAxisReserve = showBottomAxis ? Math.round(axisFontSize + 18) : 0;
        const sortHeightPx = Math.max(
            0,
            Number((settings.timeline as any).sortHeightPx ?? (settings.timeline as any).sortControlReservePx ?? 0)
        );
        const headerTopPaddingPx = Math.max(0, Number((settings.timeline as any).headerTopPaddingPx ?? 6));
        const headerGapPx = 4;
        const contentSeparatorPx = topAxisHeaderHeightPx > 0 ? 1 : 0;
        const legendHeightPx = hasLegend ? Math.max(0, legendReserve.top - 10) : 0;
        const computedContentStartYPx = headerTopPaddingPx
            + (legendHeightPx > 0 ? legendHeightPx + headerGapPx : 0)
            + (sortHeightPx > 0 ? sortHeightPx + headerGapPx : 0)
            + topAxisHeaderHeightPx
            + contentSeparatorPx;
        const contentStartYPx = Math.max(
            0,
            Math.round(Number((settings.timeline as any).contentStartYPx ?? computedContentStartYPx))
        );
        const axisPinTopPx = headerTopPaddingPx
            + (legendHeightPx > 0 ? legendHeightPx + headerGapPx : 0)
            + (sortHeightPx > 0 ? sortHeightPx + headerGapPx : 0);

        const margin = {
            top: contentStartYPx,
            right: 14 + legendReserve.right,
            bottom: 10 + legendReserve.bottom + bottomAxisReserve,
            left: leftLabelSpace + legendReserve.left
        };

        const chartWidth = this.context.width - margin.left - margin.right;
        const chartHeight = this.context.height - margin.top - margin.bottom;

        if (chartWidth <= 0 || chartHeight <= 0) {
            return;
        }

        let minYear = Math.min(timelineData.minYear, timelineData.maxYear);
        let maxYear = Math.max(timelineData.minYear, timelineData.maxYear);
        if (minYear === maxYear) {
            const singlePointPadding = isDateScale ? 24 * 60 * 60 * 1000 : 1;
            minYear -= singlePointPadding;
            maxYear += singlePointPadding;
        }

        const xScale = d3.scaleLinear()
            .domain([minYear, maxYear])
            .range([0, chartWidth]);

        const yScale = d3.scalePoint<string>()
            .domain(rows.map((row) => row.key))
            .range([0, chartHeight])
            .padding(Math.max(0, Math.min(0.95, settings.timeline.lanePadding + 0.04)));
        const laneStep = rows.length > 1
            ? Math.abs((yScale(rows[1].key) ?? 0) - (yScale(rows[0].key) ?? 0))
            : chartHeight;
        const barHeight = Math.max(1, Math.min(16, laneStep * Math.max(0.2, (1 - settings.timeline.lanePadding)) * 0.82));

        const regionDomain = timelineData.regions.length ? timelineData.regions : ["World"];
        const colorScale = this.getCategoryColors(regionDomain, timelineData.categoryColorMap);

        const panel = this.context.container.append("g")
            .attr("class", "timeline-panel")
            .attr("transform", `translate(${margin.left}, ${margin.top})`);

        const formatYear = (value: number): string => {
            const year = Math.round(value);
            return year < 0 ? `${Math.abs(year)} BC` : `${year}`;
        };
        const timeSpanMs = Math.max(1, maxYear - minYear);
        const axisDateFormatter = (() => {
            if (timeSpanMs >= 1000 * 60 * 60 * 24 * 365 * 25) {
                return new Intl.DateTimeFormat(undefined, { year: "numeric", timeZone: "UTC" });
            }
            if (timeSpanMs >= 1000 * 60 * 60 * 24 * 365 * 2) {
                return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
            }
            if (timeSpanMs >= 1000 * 60 * 60 * 24 * 45) {
                return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
            }
            return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
        })();
        const axisMonthFormatter = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });
        const axisMonthDayFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
        const tooltipDateFormatter = new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC"
        });
        const formatQuarter = (value: number, includeYear: boolean): string => {
            const date = new Date(value);
            const month = date.getUTCMonth();
            const quarter = Math.floor(month / 3) + 1;
            const q = `Q${Math.max(1, Math.min(4, quarter))}`;
            return includeYear ? `${date.getUTCFullYear()} ${q}` : q;
        };
        const formatMonth = (value: number, includeYear: boolean): string => {
            const date = new Date(value);
            const month = axisMonthFormatter.format(date);
            return includeYear ? `${date.getUTCFullYear()} ${month}` : month;
        };
        const formatDay = (value: number, includeYear: boolean): string => {
            const date = new Date(value);
            const dayLabel = `${date.getUTCDate()}`;
            return includeYear ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}` : dayLabel;
        };
        const formatTimelineValue = (value: number): string => {
            if (!isDateScale) {
                return formatYear(value);
            }
            if (temporalLevel === "quarter") {
                return formatQuarter(value, hasYearContext);
            }
            if (temporalLevel === "month") {
                return formatMonth(value, hasYearContext);
            }
            if (temporalLevel === "day") {
                return formatDay(value, hasYearContext);
            }
            if (missingYearContext) {
                return axisMonthDayFormatter.format(new Date(value));
            }
            return axisDateFormatter.format(new Date(value));
        };
        const formatTooltipDateValue = (value: number): string => {
            if (!isDateScale) {
                return formatYear(value);
            }
            if (temporalLevel === "quarter") {
                return formatQuarter(value, hasYearContext);
            }
            if (temporalLevel === "month") {
                return formatMonth(value, hasYearContext);
            }
            if (temporalLevel === "day") {
                return formatDay(value, hasYearContext);
            }
            if (missingYearContext) {
                return axisMonthDayFormatter.format(new Date(value));
            }
            return tooltipDateFormatter.format(new Date(value));
        };
        const axisLabelForLevel = (level: AxisLevel, value: number): string => {
            const d = new Date(value);
            if (level === "year") {
                return hasYearContext ? String(d.getUTCFullYear()) : "All years";
            }
            if (level === "quarter") {
                return `Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
            }
            if (level === "month") {
                return axisMonthFormatter.format(d);
            }
            return `${d.getUTCDate()}`;
        };
        const floorToLevelStart = (level: AxisLevel, value: number): number => {
            const d = new Date(value);
            const y = d.getUTCFullYear();
            const m = d.getUTCMonth();
            const day = d.getUTCDate();
            switch (level) {
                case "year":
                    return Date.UTC(y, 0, 1);
                case "quarter":
                    return Date.UTC(y, Math.floor(m / 3) * 3, 1);
                case "month":
                    return Date.UTC(y, m, 1);
                default:
                    return Date.UTC(y, m, day);
            }
        };
        const addLevelStep = (level: AxisLevel, value: number): number => {
            const d = new Date(value);
            const y = d.getUTCFullYear();
            const m = d.getUTCMonth();
            const day = d.getUTCDate();
            switch (level) {
                case "year":
                    return Date.UTC(y + 1, 0, 1);
                case "quarter":
                    return Date.UTC(y, m + 3, 1);
                case "month":
                    return Date.UTC(y, m + 1, 1);
                default:
                    return Date.UTC(y, m, day + 1);
            }
        };
        const formatDuration = (duration: number): string => {
            if (!isDateScale) {
                return formatMeasureValue(duration);
            }

            const milliseconds = Math.max(0, duration);
            const day = 24 * 60 * 60 * 1000;
            const month = day * 30.4375;
            const year = day * 365.25;

            if (milliseconds >= year) {
                const years = milliseconds / year;
                return `${years.toLocaleString(undefined, { maximumFractionDigits: years >= 10 ? 0 : 1 })} years`;
            }
            if (milliseconds >= month) {
                const months = milliseconds / month;
                return `${months.toLocaleString(undefined, { maximumFractionDigits: months >= 10 ? 0 : 1 })} months`;
            }
            if (milliseconds >= day) {
                const days = Math.round(milliseconds / day);
                return `${days.toLocaleString()} days`;
            }

            const hours = milliseconds / (60 * 60 * 1000);
            if (hours >= 1) {
                return `${Math.round(hours).toLocaleString()} hours`;
            }

            const minutes = milliseconds / (60 * 1000);
            if (minutes >= 1) {
                return `${Math.round(minutes).toLocaleString()} minutes`;
            }

            return `${Math.round(milliseconds / 1000).toLocaleString()} seconds`;
        };

        const xTicksToRender: number[] = (() => {
            const minValue = Math.min(minYear, maxYear);
            const maxValue = Math.max(minYear, maxYear);
            const activeAxisLevel: AxisLevel = (() => {
                switch (temporalLevel) {
                    case "day":
                        return "day";
                    case "month":
                        return "month";
                    case "quarter":
                        return "quarter";
                    default:
                        return "year";
                }
            })();

            if (isDateScale && activeAxisLevel !== "year") {
                const ticks: number[] = [];
                let cursor = floorToLevelStart(activeAxisLevel, minValue);
                let guard = 0;
                while (cursor <= maxValue && guard < 500000) {
                    ticks.push(cursor);
                    cursor = addLevelStep(activeAxisLevel, cursor);
                    guard += 1;
                }
                if (!ticks.length || ticks[0] > minValue) {
                    ticks.unshift(minValue);
                }
                if (ticks[ticks.length - 1] < maxValue) {
                    ticks.push(maxValue);
                }
                return ticks;
            }

            const rawTicks = xScale.ticks(Math.max(2, Math.floor(chartWidth / 110)));
            const xTicks: number[] = [];
            const seenTicks = new Set<number>();
            const minTick = Math.floor(minValue);
            const maxTick = Math.ceil(maxValue);
            const pushTick = (value: number) => {
                const rounded = Math.round(value);
                if (rounded < minTick || rounded > maxTick || seenTicks.has(rounded)) {
                    return;
                }
                seenTicks.add(rounded);
                xTicks.push(rounded);
            };
            pushTick(minYear);
            rawTicks.forEach(pushTick);
            pushTick(maxYear);
            xTicks.sort((a, b) => a - b);

            const minTickGapPx = Math.max(42, Math.round(axisFontSize * 4.2));
            const filteredTicks: number[] = [];
            for (const tick of xTicks) {
                if (filteredTicks.length === 0) {
                    filteredTicks.push(tick);
                    continue;
                }
                const prev = filteredTicks[filteredTicks.length - 1];
                const gap = Math.abs(xScale(tick) - xScale(prev));
                if (gap >= minTickGapPx) {
                    filteredTicks.push(tick);
                }
            }
            if (xTicks.length > 0 && filteredTicks[0] !== xTicks[0]) {
                filteredTicks.unshift(xTicks[0]);
            }
            if (xTicks.length > 1) {
                const lastTick = xTicks[xTicks.length - 1];
                const lastFiltered = filteredTicks[filteredTicks.length - 1];
                if (lastFiltered !== lastTick) {
                    const gap = Math.abs(xScale(lastTick) - xScale(lastFiltered));
                    if (gap < minTickGapPx && filteredTicks.length > 1) {
                        filteredTicks[filteredTicks.length - 1] = lastTick;
                    } else {
                        filteredTicks.push(lastTick);
                    }
                }
            }
            return filteredTicks;
        })();
        const buildAxisLabelRuns = (level: AxisLevel): AxisLabelRun[] => {
            if (!isDateScale) {
                return [{
                    label: axisLabelForLevel(level, minYear),
                    startX: 0,
                    endX: chartWidth,
                    startValue: minYear,
                    endValue: maxYear
                }];
            }

            const minValue = Math.min(minYear, maxYear);
            const maxValue = Math.max(minYear, maxYear);
            const runs: AxisLabelRun[] = [];
            let cursor = floorToLevelStart(level, minValue);
            let guard = 0;
            while (cursor < maxValue && guard < 500000) {
                const next = addLevelStep(level, cursor);
                const clippedStart = Math.max(minValue, cursor);
                const clippedEnd = Math.min(maxValue, next);
                if (clippedEnd > clippedStart) {
                    runs.push({
                        label: axisLabelForLevel(level, cursor),
                        startX: xScale(clippedStart),
                        endX: xScale(clippedEnd),
                        startValue: clippedStart,
                        endValue: clippedEnd
                    });
                }
                cursor = next;
                guard += 1;
            }

            if (runs.length > 0) {
                return runs;
            }

            if (!xTicksToRender.length) {
                return [];
            }

            const fallbackRuns: AxisLabelRun[] = [];
            for (let i = 0; i < xTicksToRender.length; i++) {
                const startTick = xTicksToRender[i];
                const endTick = i < xTicksToRender.length - 1 ? xTicksToRender[i + 1] : maxValue;
                if (endTick <= startTick) {
                    continue;
                }
                fallbackRuns.push({
                    label: axisLabelForLevel(level, startTick),
                    startX: xScale(startTick),
                    endX: xScale(endTick),
                    startValue: startTick,
                    endValue: endTick
                });
            }
            return fallbackRuns;
        };
        const viewportWidth = this.context.root?.clientWidth || this.context.width;
        const decimateRunsBySpacing = (
            runs: AxisLabelRun[],
            minGapPx: number
        ): AxisLabelRun[] => {
            if (runs.length <= 2) {
                return runs;
            }

            const kept: AxisLabelRun[] = [];
            let lastCenter = Number.NEGATIVE_INFINITY;

            for (let i = 0; i < runs.length; i++) {
                const run = runs[i];
                const center = run.startX + ((run.endX - run.startX) / 2);
                const isEdge = i === 0 || i === runs.length - 1;
                if (isEdge || center - lastCenter >= minGapPx) {
                    kept.push(run);
                    lastCenter = center;
                }
            }

            const lastRun = runs[runs.length - 1];
            if (kept[kept.length - 1] !== lastRun) {
                kept.push(lastRun);
            }
            return kept;
        };
        const getRowLabelMinGapPx = (level: AxisLevel): number => {
            switch (level) {
                case "year":
                    return Math.max(72, Math.round(axisFontSize * 6.6));
                case "quarter":
                    return Math.max(108, Math.round(axisFontSize * 10.0));
                case "month":
                    return Math.max(138, Math.round(axisFontSize * 12.0));
                default:
                    return Math.max(174, Math.round(axisFontSize * 14.0));
            }
        };
        const buildDecimatedTicks = (ticks: number[], minGapPx: number): number[] => {
            if (ticks.length <= 2) {
                return ticks;
            }
            const selected: number[] = [];
            let lastX = Number.NEGATIVE_INFINITY;
            for (let i = 0; i < ticks.length; i++) {
                const tick = ticks[i];
                const x = xScale(tick);
                const isEdge = i === 0 || i === ticks.length - 1;
                if (isEdge || x - lastX >= minGapPx) {
                    selected.push(tick);
                    lastX = x;
                }
            }
            const lastTick = ticks[ticks.length - 1];
            if (selected[selected.length - 1] !== lastTick) {
                selected.push(lastTick);
            }
            return selected;
        };
        const axisStroke = this.isHighContrastMode() ? this.getThemeForeground("#111827") : "#d1d5db";
        const axisTextColor = this.isHighContrastMode() ? this.getThemeForeground(settings.xAxisColor) : settings.xAxisColor;

        let topAxisGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
        if (settings.showXAxis && settings.timeline.showTopAxis) {
            const rowCount = Math.max(1, axisLevels.length);
            const headerPadTop = 4;
            const bannerHeight = showAllYearsBanner ? Math.max(11, axisFontSize) : 0;
            const bannerGap = showAllYearsBanner ? 3 : 0;
            const rowHeight = Math.max(12, Math.round(axisFontSize + 6));
            const rowLabelTop = headerPadTop + bannerHeight + bannerGap;
            const desiredBaselineY = rowLabelTop + (rowCount * rowHeight) + 6;
            const headerHeight = Math.max(24, topAxisHeaderHeightPx || calculatedAxisHeaderHeight);
            const axisBaselineY = Math.max(12, Math.min(headerHeight - 8, desiredBaselineY));

            topAxisGroup = panel.append("g")
                .attr("class", "x-axis timeline-axis top pinned-top-axis")
                .attr("data-panel-top", `${Math.round(margin.top)}`)
                .attr("data-axis-natural-top", `${Math.round(axisPinTopPx)}`)
                .attr("data-header-height", `${Math.round(headerHeight)}`)
                .attr("transform", `translate(0, ${Math.round(axisPinTopPx - margin.top)})`);

            topAxisGroup.append("rect")
                .attr("class", "pinned-top-axis-bg")
                .attr("x", -2)
                .attr("y", 0)
                .attr("width", Math.max(0, chartWidth + 4))
                .attr("height", Math.max(0, headerHeight))
                .attr("fill", this.getThemeBackground("#ffffff"))
                .attr("pointer-events", "none");

            topAxisGroup.append("line")
                .attr("x1", 0)
                .attr("x2", chartWidth)
                .attr("y1", axisBaselineY)
                .attr("y2", axisBaselineY)
                .attr("stroke", axisStroke)
                .attr("stroke-width", 1);

            if (showAllYearsBanner) {
                topAxisGroup.append("text")
                    .attr("x", 0)
                    .attr("y", this.snapToPixelInt(headerPadTop + bannerHeight - 1))
                    .attr("text-anchor", "start")
                    .attr("font-size", `${Math.max(8, axisFontSize - 1)}px`)
                    .attr("font-family", settings.xAxisFontFamily)
                    .style("font-weight", "600")
                    .attr("fill", axisTextColor)
                    .text("All years view");
            }

            axisLevels.forEach((level, rowIdx) => {
                const rowTop = rowLabelTop + (rowIdx * rowHeight);
                const textY = this.snapToPixelInt(rowTop + (rowHeight * 0.72));
                const minGapPx = getRowLabelMinGapPx(level);
                const runs = decimateRunsBySpacing(
                    buildAxisLabelRuns(level),
                    minGapPx
                );
                const runsWithSpacing = runs.map((run, idx) => {
                    const nextStart = idx < runs.length - 1 ? runs[idx + 1].startX : chartWidth;
                    const prevEnd = idx > 0 ? runs[idx - 1].endX : 0;
                    const centerSpacing = idx < runs.length - 1
                        ? Math.max(0, nextStart - run.startX)
                        : Math.max(0, run.endX - prevEnd);
                    return { run, centerSpacing };
                });
                let renderedLabels = 0;

                runsWithSpacing.forEach(({ run, centerSpacing }, idx) => {
                    const width = Math.max(0, run.endX - run.startX);
                    if (width <= 0) {
                        return;
                    }

                    const cx = this.snapToPixelInt(run.startX + (width / 2));
                    const spacingBudget = Math.max(0, centerSpacing - 10);
                    const labelBudget = Math.max(
                        18,
                        Math.max(width - 6, Math.min(spacingBudget, minGapPx - 8))
                    );
                    const label = formatLabel(run.label, labelBudget, Math.max(8, axisFontSize - 1));
                    if (!label) {
                        return;
                    }

                    topAxisGroup.append("text")
                        .attr("x", cx)
                        .attr("y", textY)
                        .attr("text-anchor", "middle")
                        .attr("font-size", `${Math.max(8, axisFontSize - 1)}px`)
                        .attr("font-family", settings.xAxisFontFamily)
                        .style("font-weight", rowIdx === 0 ? "600" : "400")
                        .style("font-style", settings.xAxisItalic ? "italic" : "normal")
                        .style("text-decoration", settings.xAxisUnderline ? "underline" : "none")
                        .attr("fill", axisTextColor)
                        .text(label);
                    renderedLabels += 1;
                });

                if (renderedLabels === 0 && xTicksToRender.length > 0) {
                    const approxSpacingPx = Math.max(64, Math.round(minGapPx * 0.85));
                    const totalTicks = xTicksToRender.length;
                    const desired = Math.max(4, Math.floor(viewportWidth / approxSpacingPx));
                    const tickStep = Math.max(1, Math.ceil(totalTicks / Math.max(1, desired)));
                    let lastBandKey = "";

                    for (let i = 0; i < xTicksToRender.length; i += tickStep) {
                        const tick = xTicksToRender[i];
                        const bandStart = floorToLevelStart(level, tick);
                        const bandKey = `${level}-${bandStart}`;
                        if (bandKey === lastBandKey) {
                            continue;
                        }
                        lastBandKey = bandKey;

                        const cx = this.snapToPixelInt(xScale(tick));
                        const label = formatLabel(
                            axisLabelForLevel(level, bandStart),
                            Math.max(14, approxSpacingPx - 8),
                            Math.max(8, axisFontSize - 1)
                        );

                        if (!label) {
                            continue;
                        }

                        topAxisGroup.append("text")
                            .attr("x", cx)
                            .attr("y", textY)
                            .attr("text-anchor", "middle")
                            .attr("font-size", `${Math.max(8, axisFontSize - 1)}px`)
                            .attr("font-family", settings.xAxisFontFamily)
                            .style("font-weight", rowIdx === 0 ? "600" : "400")
                            .style("font-style", settings.xAxisItalic ? "italic" : "normal")
                            .style("text-decoration", settings.xAxisUnderline ? "underline" : "none")
                            .attr("fill", axisTextColor)
                            .text(label);
                    }
                }

                if (rowIdx < axisLevels.length - 1) {
                    const separatorY = this.snapToPixel(rowTop + rowHeight);
                    topAxisGroup.append("line")
                        .attr("x1", 0)
                        .attr("x2", chartWidth)
                        .attr("y1", separatorY)
                        .attr("y2", separatorY)
                        .attr("stroke", this.getGridStroke("#e5e7eb"))
                        .attr("stroke-width", 1)
                        .attr("stroke-opacity", this.isHighContrastMode() ? 1 : 0.5);
                }
            });

            const topTickGapPx = Math.max(24, Math.round(axisFontSize * 2.4));
            const xTicksTop = buildDecimatedTicks(xTicksToRender, topTickGapPx);
            xTicksTop.forEach((tick) => {
                const x = this.snapToPixelInt(xScale(tick));
                topAxisGroup.append("line")
                    .attr("x1", x)
                    .attr("x2", x)
                    .attr("y1", axisBaselineY)
                    .attr("y2", axisBaselineY - 5)
                    .attr("stroke", axisStroke)
                    .attr("stroke-width", 1);
            });

            topAxisGroup.append("line")
                .attr("x1", 0)
                .attr("x2", chartWidth)
                .attr("y1", headerHeight - 1)
                .attr("y2", headerHeight - 1)
                .attr("stroke", this.getGridStroke("#e5e7eb"))
                .attr("stroke-width", 1)
                .attr("stroke-opacity", this.isHighContrastMode() ? 1 : 0.65);
        }

        if (settings.showXAxis && showBottomAxis) {
            const bottomTickGapPx = (() => {
                if (!isDateScale) {
                    return Math.max(56, Math.round(axisFontSize * 5.2));
                }
                switch (temporalLevel) {
                    case "quarter":
                        return Math.max(80, Math.round(axisFontSize * 7.4));
                    case "month":
                        return Math.max(92, Math.round(axisFontSize * 8.2));
                    case "day":
                        return Math.max(110, Math.round(axisFontSize * 9.2));
                    default:
                        return Math.max(64, Math.round(axisFontSize * 5.6));
                }
            })();
            const xTicksBottom = buildDecimatedTicks(xTicksToRender, bottomTickGapPx);
            const bottomAxisGroup = panel.append("g")
                .attr("class", "x-axis timeline-axis bottom")
                .attr("transform", `translate(0, ${chartHeight})`);

            bottomAxisGroup.append("line")
                .attr("x1", 0)
                .attr("x2", chartWidth)
                .attr("y1", 0)
                .attr("y2", 0)
                .attr("stroke", axisStroke)
                .attr("stroke-width", 1);

            xTicksBottom.forEach((tick) => {
                const x = this.snapToPixelInt(xScale(tick));
                bottomAxisGroup.append("line")
                    .attr("x1", x)
                    .attr("x2", x)
                    .attr("y1", 0)
                    .attr("y2", 5)
                    .attr("stroke", axisStroke)
                    .attr("stroke-width", 1);

                bottomAxisGroup.append("text")
                    .attr("x", x)
                    .attr("y", 14)
                    .attr("text-anchor", "middle")
                    .attr("font-size", `${axisFontSize}px`)
                    .attr("font-family", settings.xAxisFontFamily)
                    .style("font-weight", settings.xAxisBold ? "700" : "400")
                    .style("font-style", settings.xAxisItalic ? "italic" : "normal")
                    .style("text-decoration", settings.xAxisUnderline ? "underline" : "none")
                    .attr("fill", axisTextColor)
                    .text(formatTimelineValue(tick));
            });
        }

        const rowLayer = panel.append("g").attr("class", "timeline-rows");

        rowLayer.selectAll("line.lane-line")
            .data(rows)
            .enter()
            .append("line")
            .attr("class", "lane-line")
            .attr("x1", 0)
            .attr("x2", chartWidth)
            .attr("y1", (row) => {
                const y = yScale(row.key) ?? 0;
                return this.snapToPixel(y);
            })
            .attr("y2", (row) => {
                const y = yScale(row.key) ?? 0;
                return this.snapToPixel(y);
            })
            .attr("stroke", this.getGridStroke("#e5e7eb"))
            .attr("stroke-width", 1)
            .attr("stroke-opacity", this.isHighContrastMode() ? 1 : 0.45);

        const rowGroups = rowLayer.selectAll("g.timeline-row")
            .data(rows)
            .enter()
            .append("g")
            .attr("class", "timeline-row");

        rowGroups.each((row, idx, nodes) => {
            const point = row.point;
            const yCenter = yScale(row.key) ?? 0;
            const barY = this.snapToPixelInt(yCenter - (barHeight / 2));

            const startX = xScale(point.startYear);
            const rawWidth = xScale(point.endYear) - startX;
            const barWidth = Math.max(settings.timeline.minBarWidth, rawWidth);

            const regionKey = timelineData.hasRegionRoleData ? point.region : "World";
            const fill = colorScale(regionKey);

            const rowGroup = d3.select(nodes[idx]);

            const bar = rowGroup.append("rect")
                .attr("class", "timeline-bar")
                .attr("data-selection-key", String(point.index))
                .attr("x", this.snapToPixelInt(startX))
                .attr("y", barY)
                .attr("width", this.snapToPixelInt(barWidth))
                .attr("height", this.snapToPixelInt(barHeight))
                .attr("rx", settings.timeline.barCornerRadius)
                .attr("fill", fill)
                .attr("stroke", this.isHighContrastMode() ? this.getThemeForeground("#111827") : "#ffffff")
                .attr("stroke-width", this.isHighContrastMode() ? 1.5 : 1);

            const rows: Array<{ displayName: string; value: string; color?: string }> = [
                { displayName: "Region", value: point.region, color: fill },
                { displayName: "Start", value: formatTooltipDateValue(point.startYear) },
                { displayName: "End", value: formatTooltipDateValue(point.endYear) },
                { displayName: "Duration", value: formatDuration(point.duration) }
            ];

            this.addTooltip(bar as any, rows, {
                title: point.civilization,
                subtitle: `${formatTooltipDateValue(point.startYear)} to ${formatTooltipDateValue(point.endYear)}`,
                color: fill
            });

            if (settings.timeline.showLabels) {
                const leftSpace = Math.max(0, startX - 8);
                const rightSpace = Math.max(0, chartWidth - (startX + barWidth) - 8);
                const insideSpace = Math.max(0, barWidth - 8);
                const outsideMax = Math.max(leftSpace, rightSpace);

                let labelMode: "left" | "right" | "inside" | "skip" = "skip";
                if (outsideMax >= 28) {
                    labelMode = rightSpace >= leftSpace ? "right" : "left";
                } else if (insideSpace >= 28) {
                    labelMode = "inside";
                }

                if (labelMode === "skip") {
                    return;
                }

                const maxWidth = labelMode === "left"
                    ? leftSpace
                    : labelMode === "right"
                        ? rightSpace
                        : insideSpace;
                const display = formatLabel(point.civilization, Math.max(24, maxWidth), labelFontSize);
                const textX = labelMode === "left"
                    ? (startX - 6)
                    : labelMode === "right"
                        ? (startX + barWidth + 6)
                        : (startX + (barWidth / 2));
                const textAnchor = labelMode === "left"
                    ? "end"
                    : labelMode === "right"
                        ? "start"
                        : "middle";
                const labelColor = labelMode === "inside"
                    ? this.getContrastColor(fill)
                    : (this.isHighContrastMode() ? this.getThemeForeground(settings.yAxisColor) : settings.yAxisColor);

                const label = rowGroup.append("text")
                    .attr("class", "timeline-label")
                    .attr("x", this.snapToPixelInt(textX))
                    .attr("y", this.snapToPixelInt(barY + (barHeight / 2)))
                    .attr("dy", "0.35em")
                    .attr("text-anchor", textAnchor)
                    .attr("font-size", `${labelFontSize}px`)
                    .attr("font-family", settings.yAxisFontFamily)
                    .style("font-weight", settings.yAxisBold ? "700" : "400")
                    .style("font-style", settings.yAxisItalic ? "italic" : "normal")
                    .style("text-decoration", settings.yAxisUnderline ? "underline" : "none")
                    .attr("fill", labelColor)
                    .text(display);

                if (display !== point.civilization) {
                    this.addTooltip(label as any, [{ displayName: "Civilization", value: point.civilization }], {
                        title: point.civilization,
                        color: fill
                    });
                }
            }
        });

        if (settings.timeline.showTodayLine) {
            const todayValue = isDateScale ? Date.now() : new Date().getFullYear();
            if (todayValue >= minYear && todayValue <= maxYear) {
                const todayX = this.snapToPixel(xScale(todayValue));
                const todayColor = this.isHighContrastMode()
                    ? this.getThemeForegroundSelected("#b91c1c")
                    : "#dc2626";
                const labelPadding = 4;
                const useEndAnchor = todayX > chartWidth - 72;
                const labelX = useEndAnchor ? todayX - labelPadding : todayX + labelPadding;

                panel.append("line")
                    .attr("class", "timeline-today-line")
                    .attr("x1", todayX)
                    .attr("x2", todayX)
                    .attr("y1", 0)
                    .attr("y2", chartHeight)
                    .attr("stroke", todayColor)
                    .attr("stroke-width", 1.5)
                    .attr("stroke-dasharray", "5,4")
                    .attr("stroke-opacity", this.isHighContrastMode() ? 1 : 0.9)
                    .style("pointer-events", "none");

                const todayLabelHost = topAxisGroup ?? panel;
                const todayLabelY = (() => {
                    if (topAxisGroup) {
                        const rawHeaderHeight = Number(topAxisGroup.attr("data-header-height"));
                        const headerHeight = Number.isFinite(rawHeaderHeight) && rawHeaderHeight > 0
                            ? rawHeaderHeight
                            : topAxisHeaderHeightPx;
                        return this.snapToPixelInt(Math.max(10, Math.min(headerHeight - 6, 16)));
                    }
                    // With no top axis, place the label just above row content to avoid bar-text overlap.
                    return -4;
                })();

                todayLabelHost.append("text")
                    .attr("class", "timeline-today-label")
                    .attr("x", this.snapToPixelInt(labelX))
                    .attr("y", todayLabelY)
                    .attr("text-anchor", useEndAnchor ? "end" : "start")
                    .attr("font-size", `${Math.max(9, axisFontSize - 1)}px`)
                    .attr("font-family", settings.xAxisFontFamily)
                    .style("font-weight", "600")
                    .attr("fill", todayColor)
                    .text("Today")
                    .style("pointer-events", "none");
            }
        }

        if (settings.timeline.showCrosshair) {
            const crosshair = panel.append("line")
                .attr("class", "timeline-crosshair")
                .attr("y1", 0)
                .attr("y2", chartHeight)
                .attr("stroke", this.isHighContrastMode() ? this.getThemeForeground("#374151") : "rgba(17, 24, 39, 0.25)")
                .attr("stroke-width", 1)
                .style("pointer-events", "none")
                .style("opacity", 0);

            panel.on("mousemove", (event: MouseEvent) => {
                const [mx, my] = d3.pointer(event, panel.node() as SVGGElement);
                if (mx < 0 || mx > chartWidth || my < 0 || my > chartHeight) {
                    crosshair.style("opacity", 0);
                    return;
                }
                crosshair
                    .attr("x1", this.snapToPixel(mx))
                    .attr("x2", this.snapToPixel(mx))
                    .style("opacity", 1);
            });

            panel.on("mouseleave", () => {
                crosshair.style("opacity", 0);
            });
        }

        // Keep sticky top axis above bars/grid/crosshair.
        topAxisGroup?.raise();

        if (hasLegend) {
            this.renderLegend(colorScale, data.maxValue, true, timelineData.regions, undefined, undefined, {
                alignFrame: {
                    x: margin.left,
                    y: margin.top,
                    width: Math.max(0, legendAvailableWidth - margin.left - 8),
                    height: chartHeight
                },
                availableWidth: legendAvailableWidth,
                availableHeight: legendAvailableHeight
            });

            // Keep legend anchored under the title while allowing vertical scroll with content.
            const legendNodes = this.context.container.selectAll<SVGGElement, unknown>("g.color-legend").nodes();
            const legendAnchorY = Math.max(0, Math.round(headerTopPaddingPx));
            legendNodes.forEach((legendNode) => {
                const transform = String(legendNode.getAttribute("transform") || "");
                const match = transform.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/i);
                const x = match ? Number(match[1]) : 0;
                const y = match ? Number(match[2]) : legendAnchorY;
                const naturalX = Number.isFinite(x) ? x : 0;
                const naturalY = Number.isFinite(y) ? Math.max(legendAnchorY, y) : legendAnchorY;
                d3.select(legendNode)
                    .attr("transform", `translate(${Math.round(naturalX)}, ${Math.round(naturalY)})`)
                    .attr("data-lock-x", "true")
                    .attr("data-natural-x", `${Math.round(naturalX)}`)
                    .attr("data-natural-y", `${Math.round(naturalY)}`);
            });
        }
    }
}
