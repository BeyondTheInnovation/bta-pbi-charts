"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, formatLabel, measureMaxLabelWidth, formatMeasureValue } from "@pbi-visuals/shared";
import { ICalendarVisualSettings } from "./settings";
import { CalendarData, CalendarDataPoint } from "./CalendarTransformer";

export class CalendarRenderer extends BaseRenderer<ICalendarVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: ICalendarVisualSettings): void {
        this.settings = settings;
        const calendarData = data as CalendarData;

        if (data.dataPoints.length === 0 || calendarData.calendarPoints.length === 0) {
            this.renderNoData();
            return;
        }

        const { calendarPoints, years, maxValue, groups } = calendarData;
        const axisColor = this.isHighContrastMode() ? this.getThemeForeground(settings.yAxisColor || "#111827") : settings.yAxisColor;
        const emptyCellColor = this.isHighContrastMode() ? this.getThemeBackground("#ebedf0") : "#ebedf0";
        const cellStroke = this.isHighContrastMode() ? this.getThemeForeground("#111827") : "#fff";

        // Cell sizes: fit-to-frame (native-like), capped by the user's preference.
        const cellSizeCapMap = { small: 12, medium: 16, large: 20 };
        const cellSizeCap = cellSizeCapMap[settings.calendar.cellSize];
        const cellPadding = 2;

        const weekStartOffset = settings.calendar.weekStartsOn === "monday" ? 1 : 0;
        const dayLabels = settings.calendar.weekStartsOn === "monday"
            ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        const yAxisBaseFontSize = settings.yAxisFontSize || 11;

        const yearFontSizeForMargin = this.getEffectiveFontSize(
            settings.textSizes.yearLabelFontSize > 0
                ? settings.textSizes.yearLabelFontSize
                : Math.round(11 * (yAxisBaseFontSize / 11)),
            6,
            40
        );
        const dayFontSizeForMargin = this.getEffectiveFontSize(
            settings.textSizes.dayLabelFontSize > 0
                ? settings.textSizes.dayLabelFontSize
                : Math.round(8 * (yAxisBaseFontSize / 11)),
            6,
            40
        );

        const yearLabelWidth = measureMaxLabelWidth(years.map(y => y.toString()), yearFontSizeForMargin, settings.yAxisFontFamily);
        const dayLabelWidth = settings.showYAxis
            ? measureMaxLabelWidth(dayLabels.map(d => d.substring(0, 1)), dayFontSizeForMargin, settings.yAxisFontFamily)
            : 0;

        const dayGutter = settings.showYAxis ? Math.ceil(dayLabelWidth + 10) : 0;
        const leftGutter = Math.ceil(yearLabelWidth + 12 + dayGutter);

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

        const margin = {
            top: 12 + titleReserve,
            right: 12,
            bottom: 12,
            left: leftGutter
        };
        const chartWidth = this.context.width - margin.left - margin.right;

        const groupCount = groups.length || 1;
        const totalSpacing = (groupCount - 1) * interPanelGap;
        const availableHeight = this.context.height - margin.top - margin.bottom - totalSpacing;
        const groupHeightTarget = availableHeight / groupCount;

        const yearCount = years.length || 1;
        const monthLabelBlock = settings.calendar.showMonthLabels ? 20 : 0;
        const yearExtraBlock = monthLabelBlock + 20;

        // Week columns depend on the year/week-start. Use the maximum across visible years for stable layout.
        const weeksPerYear = Math.max(
            1,
            ...years.map(y => this.getWeekNumber(new Date(y, 11, 31), weekStartOffset) + 1)
        );

        // Width-first sizing (native-like): choose a cell size that best uses the available width,
        // then only shrink if height is insufficient.
        const maxCellByWidth = chartWidth > 0
            ? ((chartWidth - dayGutter) / weeksPerYear) - cellPadding
            : cellSizeCap;
        let cellSize = Math.floor(Math.min(cellSizeCap, Number.isFinite(maxCellByWidth) ? maxCellByWidth : cellSizeCap));
        cellSize = Math.max(6, cellSize);

        if (groupHeightTarget > 0) {
            const maxCellByHeight = (((groupHeightTarget / yearCount) - yearExtraBlock) / 7) - cellPadding;
            if (Number.isFinite(maxCellByHeight) && maxCellByHeight > 0) {
                cellSize = Math.max(6, Math.min(cellSize, Math.floor(maxCellByHeight)));
            }
        }

        // Height needed per year
        const yearHeight = 7 * (cellSize + cellPadding) + yearExtraBlock;

        // Use custom colors from settings
        const colorScale = d3.scaleSequential()
            .domain([0, maxValue])
            .interpolator(this.isHighContrastMode()
                ? d3.interpolate(this.getThemeBackground("#ffffff"), this.getThemeForeground("#111827"))
                : d3.interpolate(settings.calendar.minColor, settings.calendar.maxColor));

        let currentY = margin.top;

        groups.forEach((groupName, groupIndex) => {
            const groupPoints = calendarPoints.filter(d => d.groupValue === groupName);
            const contentHeight = yearCount * yearHeight;
            const offsetY = groupHeightTarget > 0 ? Math.max(0, (groupHeightTarget - contentHeight) / 2) : 0;

            const panelGroup = this.context.container.append("g")
                .attr("class", "calendar-panel")
                .attr("transform", `translate(${Math.round(margin.left)}, ${Math.round(currentY + offsetY)})`);

            // Group title with configurable spacing
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

            // Create lookup for quick access
            const dataLookup = new Map<string, CalendarDataPoint>();
            groupPoints.forEach(p => {
                const key = `${p.year}-${p.month}-${p.date.getDate()}`;
                dataLookup.set(key, p);
            });

            let yearOffsetY = 0;

            years.forEach(year => {
                const yearGroup = panelGroup.append("g")
                    .attr("class", "year-group")
                    .attr("transform", `translate(0, ${Math.round(yearOffsetY)})`);

                // Year label - manual override or responsive font size
                const yearFontSize = yearFontSizeForMargin;
                yearGroup.append("text")
                    .attr("x", -(dayGutter + 6))
                    .attr("y", Math.round(7 * (cellSize + cellPadding) / 2))
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "end")
                    .attr("font-size", `${yearFontSize}px`)
                    .attr("font-family", settings.yAxisFontFamily)
                    .style("font-weight", settings.yAxisBold ? "700" : "400")
                    .style("font-style", settings.yAxisItalic ? "italic" : "normal")
                    .style("text-decoration", settings.yAxisUnderline ? "underline" : "none")
                    .attr("fill", axisColor)
                    .text(year.toString());

                // Day labels (Y-axis) - manual override or responsive font size
                if (settings.showYAxis && groupIndex === 0) {
                    const dayFontSize = dayFontSizeForMargin;
                    dayLabels.forEach((day, i) => {
                        if (i % 2 === 0) { // Show every other day label
                            yearGroup.append("text")
                                .attr("x", 0)
                                .attr("y", Math.round(i * (cellSize) + (i * cellPadding) + cellSize / 2))
                                .attr("dy", "0.35em")
                                .attr("font-size", `${dayFontSize}px`)
                                .attr("font-family", settings.yAxisFontFamily)
                                .style("font-weight", settings.yAxisBold ? "700" : "400")
                                .style("font-style", settings.yAxisItalic ? "italic" : "normal")
                                .style("text-decoration", settings.yAxisUnderline ? "underline" : "none")
                                .attr("fill", axisColor)
                                .text(day.substring(0, 1));
                        }
                    });
                }

                // Get first day of year
                const startDate = new Date(year, 0, 1);
                const endDate = new Date(year, 11, 31);

                // Calculate week offset
                let currentDate = new Date(startDate);

                // Month labels
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const monthPositions: number[] = [];

                // Draw cells for each day
                while (currentDate <= endDate) {
                    const dayOfWeek = (currentDate.getDay() - weekStartOffset + 7) % 7;
                    const weekOfYear = this.getWeekNumber(currentDate, weekStartOffset);

                    const x = this.snapToPixelInt(dayGutter + weekOfYear * (cellSize + cellPadding));
                    const y = this.snapToPixelInt(dayOfWeek * (cellSize + cellPadding));

                    // Track month positions for labels
                    if (currentDate.getDate() === 1) {
                        monthPositions[currentDate.getMonth()] = x;
                    }

                    const key = `${year}-${currentDate.getMonth()}-${currentDate.getDate()}`;
                    const dataPoint = dataLookup.get(key);
                    const value = dataPoint?.value ?? 0;

                    const fill = value === 0 ? emptyCellColor : (colorScale(value) as string);

                    const dateStr = currentDate.toLocaleDateString("en-US", {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                    });

                    const cell = yearGroup.append("rect")
                        .attr("class", "calendar-cell")
                        .attr("data-selection-key", dataPoint?.xValue ?? "")
                        .attr("x", x)
                        .attr("y", y)
                        .attr("width", cellSize)
                        .attr("height", cellSize)
                        .attr("rx", 2)
                        .attr("fill", fill)
                        .attr("stroke", cellStroke)
                        .attr("stroke-width", 1);

                    const valueLabel = calendarData.valueDisplayName || "Value";
                    this.addTooltip(cell as any, [{ displayName: valueLabel, value: formatMeasureValue(value, calendarData.valueFormatString), color: fill }], {
                        title: dateStr,
                        subtitle: (groupName !== "All" && groupName !== "(Blank)") ? groupName : undefined,
                        color: fill
                    });

                    // Move to next day
                    currentDate.setDate(currentDate.getDate() + 1);
                }

                // Month labels - manual override or responsive font size
                if (settings.calendar.showMonthLabels) {
                    const monthFontSize = this.getEffectiveFontSize(
                        settings.textSizes.monthLabelFontSize > 0 ? settings.textSizes.monthLabelFontSize : 9,
                        6, 40
                    );
                    monthPositions.forEach((x, month) => {
                        if (x !== undefined) {
                            yearGroup.append("text")
                                .attr("x", Math.round(x))
                                .attr("y", -5)
                                .attr("font-size", `${monthFontSize}px`)
                                .attr("fill", this.getThemeForeground("#666"))
                                .text(monthNames[month]);
                        }
                    });
                }

                yearOffsetY += yearHeight;
            });

            currentY += groupHeightTarget + interPanelGap;
        });

        // Calendar heatmap has no legend by design (tooltips carry the details).
    }

    private getWeekNumber(date: Date, weekStartOffset: number): number {
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const startDay = (startOfYear.getDay() - weekStartOffset + 7) % 7;
        const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
        return Math.floor((dayOfYear + startDay) / 7);
    }
}
