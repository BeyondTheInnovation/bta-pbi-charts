"use strict";

import * as d3 from "d3";
import { BaseRenderer, RenderContext, ChartData, formatLabel, measureMaxLabelWidth } from "@pbi-visuals/shared";
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

        // Cell sizes based on setting
        const cellSizeMap = { small: 10, medium: 14, large: 18 };
        const cellSize = cellSizeMap[settings.calendar.cellSize];
        const cellPadding = 2;

        const weekStartOffset = settings.calendar.weekStartsOn === "monday" ? 1 : 0;
        const dayLabels = settings.calendar.weekStartsOn === "monday"
            ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        const yearFontSizeForMargin = this.getEffectiveFontSize(
            settings.textSizes.yearLabelFontSize,
            11,
            9, 16
        );
        const dayFontSizeForMargin = this.getEffectiveFontSize(
            settings.textSizes.dayLabelFontSize,
            8,
            6, 12
        );

        const yearLabelWidth = measureMaxLabelWidth(years.map(y => y.toString()), yearFontSizeForMargin);
        const dayLabelWidth = settings.showYAxis
            ? measureMaxLabelWidth(dayLabels.map(d => d.substring(0, 1)), dayFontSizeForMargin)
            : 0;

        const dayGutter = settings.showYAxis ? Math.ceil(dayLabelWidth + 10) : 0;
        const leftGutter = Math.ceil(yearLabelWidth + 12 + dayGutter);

        const legendNeedsBottomSpace = settings.showLegend && settings.legendPosition === "bottom";
        const topLegendPadding = settings.showLegend && settings.legendPosition !== "bottom" ? 36 : 0;

        const margin = {
            top: 40 + topLegendPadding,
            right: 20,
            bottom: legendNeedsBottomSpace ? 50 : 20,
            left: leftGutter
        };
        const chartWidth = this.context.width - margin.left - margin.right;

        const yearCount = years.length;
        const yearsPerGroup = Math.max(1, yearCount);

        // Calculate height needed per year
        const yearHeight = 7 * (cellSize + cellPadding) + (settings.calendar.showMonthLabels ? 20 : 0) + 20;

        // Use custom colors from settings
        const colorScale = d3.scaleSequential()
            .domain([0, maxValue])
            .interpolator(d3.interpolate(settings.calendar.minColor, settings.calendar.maxColor));

        let currentY = margin.top;

        groups.forEach((groupName, groupIndex) => {
            const groupPoints = calendarPoints.filter(d => d.groupValue === groupName);

            const panelGroup = this.context.container.append("g")
                .attr("class", "calendar-panel")
                .attr("transform", `translate(${Math.round(margin.left)}, ${Math.round(currentY)})`);

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
                    .attr("font-weight", "bold")
                    .attr("fill", "#333")
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
                                .attr("fill", "#999")
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

                    const x = dayGutter + weekOfYear * (cellSize + cellPadding);
                    const y = dayOfWeek * (cellSize + cellPadding);

                    // Track month positions for labels
                    if (currentDate.getDate() === 1) {
                        monthPositions[currentDate.getMonth()] = x;
                    }

                    const key = `${year}-${currentDate.getMonth()}-${currentDate.getDate()}`;
                    const dataPoint = dataLookup.get(key);
                    const value = dataPoint?.value ?? 0;

                    const fill = value === 0 ? "#ebedf0" : (colorScale(value) as string);

                    const dateStr = currentDate.toLocaleDateString("en-US", {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                    });

                    const cell = yearGroup.append("rect")
                        .attr("class", "calendar-cell")
                        .attr("x", x)
                        .attr("y", y)
                        .attr("width", cellSize)
                        .attr("height", cellSize)
                        .attr("rx", 2)
                        .attr("fill", fill)
                        .attr("stroke", "#fff")
                        .attr("stroke-width", 1);

                    this.addTooltip(cell as any, [{ displayName: "Value", value: value.toLocaleString() }], {
                        title: dateStr,
                        subtitle: groupName !== "All" ? groupName : undefined,
                        color: fill
                    });

                    // Move to next day
                    currentDate.setDate(currentDate.getDate() + 1);
                }

                // Month labels - manual override or responsive font size
                if (settings.calendar.showMonthLabels) {
                    const monthFontSize = this.getEffectiveFontSize(
                        settings.textSizes.monthLabelFontSize,
                        9, 7, 14
                    );
                    monthPositions.forEach((x, month) => {
                        if (x !== undefined) {
                            yearGroup.append("text")
                                .attr("x", Math.round(x))
                                .attr("y", -5)
                                .attr("font-size", `${monthFontSize}px`)
                                .attr("fill", "#666")
                                .text(monthNames[month]);
                        }
                    });
                }

                yearOffsetY += yearHeight;
            });

            currentY += yearsPerGroup * yearHeight + settings.smallMultiples.spacing;
        });

        // Legend (gradient) - use shared positioning logic (top-right when legend position is Right)
        this.renderLegend(colorScale, maxValue, false, undefined, undefined, {
            min: settings.calendar.minColor,
            max: settings.calendar.maxColor
        });
    }

    private getWeekNumber(date: Date, weekStartOffset: number): number {
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const startDay = (startOfYear.getDay() - weekStartOffset + 7) % 7;
        const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
        return Math.floor((dayOfYear + startDay) / 7);
    }
}
