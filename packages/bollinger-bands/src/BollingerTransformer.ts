"use strict";

import powerbi from "powerbi-visuals-api";
import DataViewCategorical = powerbi.DataViewCategorical;
import { ChartData, DataPoint, formatDataValue, formatGroupValue } from "@pbi-visuals/shared";

export interface BollingerDataPoint {
    date: Date | string;
    value: number;
    sma: number | null;      // null for first N-1 points
    upper: number | null;
    lower: number | null;
    groupValue: string;
    seriesKey: string;
    index: number;
}

export interface BollingerChartData extends ChartData {
    bollingerPoints: BollingerDataPoint[];
    minValue: number;
    maxValue: number;
    minDate: string;
    maxDate: string;
    hasLegendRoleData: boolean;
}

/**
 * Calculates Bollinger Bands for a given set of values.
 * Uses a rolling window approach for efficient calculation.
 *
 * @param values - Array of numeric values (e.g., closing prices)
 * @param N - Period for SMA calculation (default: 20)
 * @param K - Standard deviation multiplier (default: 2)
 * @returns Array of [lower, middle (SMA), upper] for each point
 */
export function calculateBollinger(values: number[], N: number, K: number): Array<[number | null, number | null, number | null]> {
    let sum = 0;
    let sum2 = 0;
    const bands: Array<[number | null, number | null, number | null]> = [];

    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        sum += value;
        sum2 += value ** 2;

        if (i >= N - 1) {
            const mean = sum / N;
            // Sample standard deviation
            const variance = (sum2 - (sum ** 2) / N) / (N - 1);
            const deviation = Math.sqrt(Math.max(0, variance));

            bands.push([
                mean - K * deviation,  // lower
                mean,                   // middle (SMA)
                mean + K * deviation   // upper
            ]);

            // Remove oldest value from window
            const value0 = values[i - N + 1];
            sum -= value0;
            sum2 -= value0 ** 2;
        } else {
            bands.push([null, null, null]);  // Not enough data yet
        }
    }

    return bands;
}

export class BollingerTransformer {
    public static transform(
        categorical: DataViewCategorical,
        period: number = 20,
        stdDeviation: number = 2
    ): BollingerChartData {
        const dataPoints: DataPoint[] = [];
        const bollingerPoints: BollingerDataPoint[] = [];
        const xValuesSet = new Set<string>();
        const xValueSortKey = new Map<string, number>();
        const seriesKeysSet = new Set<string>();
        let maxValue = -Infinity;
        let minValue = Infinity;

        let xAxisIndex = -1;
        let legendIndex = -1;

        if (categorical.categories) {
            categorical.categories.forEach((cat, idx) => {
                const role = cat.source.roles;
                if (role) {
                    if (role["xAxis"]) xAxisIndex = idx;
                    if (role["legend"]) legendIndex = idx;
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

        // Build raw data points
        const rawData: Array<{ xValue: string; value: number; seriesKey: string; groupValue: string; index: number }> = [];
        const groupsSet = new Set<string>();

        const toDateMs = (value: any): number | null => {
            if (value === null || value === undefined) return null;
            if (value instanceof Date) {
                const ms = value.getTime();
                return Number.isNaN(ms) ? null : ms;
            }
            const date = new Date(value);
            const ms = date.getTime();
            return Number.isNaN(ms) ? null : ms;
        };

        let pointIndex = 0;
        for (const vg of valueGroups) {
            const groupValue = vg.groupValue;
            const values = vg.values ?? [];
            const highlights = vg.highlights;
            groupsSet.add(groupValue);

            for (let i = 0; i < values.length; i++) {
                const rawXValue = xAxisIndex >= 0 ? categorical.categories![xAxisIndex].values[i] : null;
                const dateMs = toDateMs(rawXValue);
                const xValue = dateMs !== null ? String(dateMs) : formatDataValue(rawXValue, i);
                const seriesKeyRaw = legendIndex >= 0
                    ? String(categorical.categories![legendIndex].values[i] ?? "")
                    : "Price";
                const seriesKey = seriesKeyRaw.trim() ? seriesKeyRaw.trim() : "All";
                const rawValue = Number(values[i]) || 0;
                const hasHighlight = highlights && highlights[i] !== null && highlights[i] !== undefined;
                const highlightValue = hasHighlight ? (Number(highlights![i]) || 0) : 0;
                const value = hasHighlight ? highlightValue : rawValue;

                xValuesSet.add(xValue);
                if (dateMs !== null && !xValueSortKey.has(xValue)) {
                    xValueSortKey.set(xValue, dateMs);
                }
                seriesKeysSet.add(seriesKey);

                rawData.push({
                    xValue,
                    value,
                    seriesKey,
                    groupValue,
                    index: i
                });

                dataPoints.push({
                    xValue,
                    yValue: seriesKey,
                    value,
                    groupValue,
                    index: pointIndex++
                });
            }
        }

        const xValues = Array.from(xValuesSet).sort((a, b) => {
            const aKey = xValueSortKey.get(a);
            const bKey = xValueSortKey.get(b);
            if (aKey !== undefined && bKey !== undefined) return aKey - bKey;
            if (aKey !== undefined) return -1;
            if (bKey !== undefined) return 1;
            return a.localeCompare(b);
        });
        const seriesKeys = Array.from(seriesKeysSet).filter(s => s !== "").sort();
        const groups = Array.from(groupsSet).filter(g => g !== "").sort();
        const xValueOrder = new Map(xValues.map((x, idx) => [x, idx]));

        // Process each (group, series) separately for Bollinger calculations
        groups.forEach(groupValue => {
            seriesKeys.forEach(seriesKey => {
                const seriesData = rawData.filter(d => d.groupValue === groupValue && d.seriesKey === seriesKey);
                if (seriesData.length === 0) return;

                // Sort by xValue (date order)
                seriesData.sort((a, b) => (xValueOrder.get(a.xValue) ?? 0) - (xValueOrder.get(b.xValue) ?? 0));

                // Extract values for Bollinger calculation
                const priceValues = seriesData.map(d => d.value);

                // Calculate Bollinger Bands
                const bands = calculateBollinger(priceValues, period, stdDeviation);

                // Create Bollinger data points
                seriesData.forEach((d, i) => {
                    const [lower, sma, upper] = bands[i];

                    // Track min/max including bands
                    if (d.value > maxValue) maxValue = d.value;
                    if (d.value < minValue) minValue = d.value;
                    if (upper !== null && upper > maxValue) maxValue = upper;
                    if (lower !== null && lower < minValue) minValue = lower;

                    bollingerPoints.push({
                        date: d.xValue,
                        value: d.value,
                        sma,
                        upper,
                        lower,
                        groupValue,
                        seriesKey,
                        index: d.index
                    });
                });
            });
        });

        // Fallback for edge cases
        if (minValue === Infinity) minValue = 0;
        if (maxValue === -Infinity) maxValue = 100;

        return {
            dataPoints,
            bollingerPoints,
            xValues,
            yValues: seriesKeys.length ? seriesKeys : ["Price"],
            groups: groups.length ? groups : ["All"],
            maxValue,
            minValue,
            minDate: xValues[0] || "",
            maxDate: xValues[xValues.length - 1] || "",
            hasLegendRoleData: legendIndex >= 0 && seriesKeys.length > 0,
            valueFormatString
        };
    }
}
