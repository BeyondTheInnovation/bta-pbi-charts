"use strict";

import powerbi from "powerbi-visuals-api";
import DataViewCategorical = powerbi.DataViewCategorical;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface CalendarDataPoint extends DataPoint {
    date: Date;
    dayOfWeek: number;
    weekOfYear: number;
    month: number;
    year: number;
}

export interface CalendarData extends ChartData {
    calendarPoints: CalendarDataPoint[];
    years: number[];
    dateRange: { start: Date; end: Date };
}

export class CalendarTransformer {
    public static transform(categorical: DataViewCategorical): CalendarData {
        const dataPoints: DataPoint[] = [];
        const calendarPoints: CalendarDataPoint[] = [];
        const xValuesSet = new Set<string>();
        const groupsSet = new Set<string>();
        const yearsSet = new Set<number>();
        let maxValue = 0;
        let minValue = Infinity;
        let minDate: Date | null = null;
        let maxDate: Date | null = null;

        let xAxisIndex = -1;

        if (categorical.categories) {
            categorical.categories.forEach((cat, idx) => {
                const role = cat.source.roles;
                if (role) {
                    if (role["xAxis"]) xAxisIndex = idx;
                }
            });
        }

        const groupedValues = (categorical.values as any)?.grouped?.() as Array<any> | undefined;
        const valueGroups: Array<{ groupValue: string; values: any[]; highlights?: any[] }> = [];

        if (groupedValues && groupedValues.length > 0) {
            for (const g of groupedValues) {
                const groupValue = formatGroupValue(g?.name);
                const valueColumn = g?.values?.[0];
                const groupValues = (valueColumn?.values as any[]) ?? [];
                const groupHighlights = (valueColumn?.highlights as any[]) ?? undefined;
                valueGroups.push({ groupValue, values: groupValues, highlights: groupHighlights });
            }
        } else {
            valueGroups.push({
                groupValue: "All",
                values: (categorical.values?.[0]?.values as any[]) ?? [],
                highlights: (categorical.values?.[0]?.highlights as any[]) ?? undefined
            });
        }

        const valueFormatString =
            (groupedValues?.[0]?.values?.[0]?.source as any)?.format as string | undefined
            ?? (categorical.values?.[0]?.source as any)?.format as string | undefined;

        const valueDisplayName =
            (groupedValues?.[0]?.values?.[0]?.source as any)?.displayName as string | undefined
            ?? (categorical.values?.[0]?.source as any)?.displayName as string | undefined;

        let pointIndex = 0;
        for (const vg of valueGroups) {
            const values = vg.values ?? [];
            const highlights = vg.highlights;
            for (let i = 0; i < values.length; i++) {
                const rawXValue = xAxisIndex >= 0 ? categorical.categories![xAxisIndex].values[i] : null;
                const groupValue = vg.groupValue;
                const rawValue = Number(values[i]) || 0;
                const hasHighlight = highlights && highlights[i] !== null && highlights[i] !== undefined;
                const highlightValue = hasHighlight ? (Number(highlights![i]) || 0) : 0;
                const value = hasHighlight ? highlightValue : rawValue;

                // Parse date from x-axis value
                const date = CalendarTransformer.parseDate(rawXValue);
                if (!date) continue;

                const xValue = CalendarTransformer.formatDateString(date);

                if (value > maxValue) maxValue = value;
                if (value < minValue && value > 0) minValue = value;

                if (!minDate || date < minDate) minDate = date;
                if (!maxDate || date > maxDate) maxDate = date;

                xValuesSet.add(xValue);
                groupsSet.add(groupValue);
                yearsSet.add(date.getFullYear());

                const calendarPoint: CalendarDataPoint = {
                    xValue,
                    yValue: "",
                    value,
                    groupValue,
                    index: pointIndex++,
                    date,
                    dayOfWeek: date.getDay(),
                    weekOfYear: CalendarTransformer.getWeekOfYear(date),
                    month: date.getMonth(),
                    year: date.getFullYear()
                };

                dataPoints.push(calendarPoint);
                calendarPoints.push(calendarPoint);
            }
        }

        const xValues = Array.from(xValuesSet).sort();
        const yValues = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const groups = Array.from(groupsSet).sort();
        const years = Array.from(yearsSet).sort((a, b) => a - b);

        if (minValue === Infinity) minValue = 0;

        return {
            dataPoints,
            xValues,
            yValues,
            groups,
            maxValue,
            minValue,
            calendarPoints,
            years,
            valueFormatString,
            valueDisplayName,
            dateRange: {
                start: minDate || new Date(),
                end: maxDate || new Date()
            }
        };
    }

    private static parseDate(value: any): Date | null {
        if (!value) return null;

        // If already a Date
        if (value instanceof Date) {
            return isNaN(value.getTime()) ? null : value;
        }

        // Try parsing as string
        const str = String(value);

        // ISO format (YYYY-MM-DD)
        const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
            return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
        }

        // Try standard Date parsing
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }

        return null;
    }

    private static formatDateString(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private static getWeekOfYear(date: Date): number {
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
        return Math.ceil((days + startOfYear.getDay() + 1) / 7);
    }
}
