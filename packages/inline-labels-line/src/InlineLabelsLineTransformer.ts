"use strict";

import powerbi from "powerbi-visuals-api";
import DataViewCategorical = powerbi.DataViewCategorical;
import { ChartData, DataPoint, formatDataValue, formatGroupValue } from "@pbi-visuals/shared";

export interface InlineLabelsLineChartData extends ChartData {
    hasLegendRoleData: boolean;
    xIsDateAxis: boolean;
    xMsByValue?: Map<string, number>;
}

type AccKey = string;

const MIN_MS_TIMESTAMP_FOR_DATE_AXIS = 1000 * 1000 * 1000 * 100; // < ~1973 in ms (avoid treating years/quarters/ranks as timestamps)

function tryParseDateMsHeuristic(value: any): number | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isNaN(ms) ? null : ms;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        // Avoid treating small numbers (years, ranks, ids) as ms timestamps in heuristic mode.
        if (value < MIN_MS_TIMESTAMP_FOR_DATE_AXIS) {
            return null;
        }
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : value;
    }
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? null : ms;
}

function detectDateAxisIndex(categorical: DataViewCategorical, xAxisIndices: number[]): number {
    if (!categorical.categories || xAxisIndices.length === 0) return -1;

    const typed = xAxisIndices.filter(idx => {
        const t = (categorical.categories![idx]?.source as any)?.type as powerbi.ValueTypeDescriptor | undefined;
        return Boolean((t as any)?.dateTime || (t as any)?.temporal);
    });

    // Safe heuristic: prefer the "most date-like" candidate (even if metadata is present),
    // because Date Hierarchy levels (Quarter/Month number) can be typed as temporal but hold small numbers.
    const sampleLimit = 500;
    const minRangeMs = 28 * 24 * 60 * 60 * 1000; // 28 days
    const minParseRatio = 0.85;

    let bestIdx = -1;
    let bestScore = -1;

    for (const idx of xAxisIndices) {
        const col = categorical.categories![idx];
        const values = col?.values ?? [];
        const n = Math.min(values.length, sampleLimit);
        if (n <= 1) continue;

        let parsed = 0;
        let minMs = Infinity;
        let maxMs = -Infinity;

        for (let i = 0; i < n; i++) {
            const ms = tryParseDateMsHeuristic(values[i]);
            if (ms === null) continue;
            parsed++;
            if (ms < minMs) minMs = ms;
            if (ms > maxMs) maxMs = ms;
        }

        const ratio = parsed / n;
        const range = (maxMs - minMs);
        if (ratio < minParseRatio) continue;
        if (!Number.isFinite(range) || range < minRangeMs) continue;

        const score = ratio * 10 + Math.min(10, range / minRangeMs);
        if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
        }
    }

    if (bestIdx >= 0) return bestIdx;
    if (typed.length > 0) return typed[0];
    return -1;
}

export class InlineLabelsLineTransformer {
    public static transform(categorical: DataViewCategorical): InlineLabelsLineChartData {
        const xValuesSet = new Set<string>();
        const xValueSortKey = new Map<string, number>();
        const xMsByValue = new Map<string, number>();

        const seriesKeysSet = new Set<string>();
        const groupsSet = new Set<string>();

        let maxValue = -Infinity;
        let minValue = Infinity;

        const xAxisIndices: number[] = [];
        let legendIndex = -1;

        if (categorical.categories) {
            categorical.categories.forEach((cat, idx) => {
                const role = cat.source.roles;
                if (!role) return;
                if (role["xAxis"]) xAxisIndices.push(idx);
                if (role["legend"]) legendIndex = idx;
            });
        }
        const xAxisPrimaryIndex = xAxisIndices.length > 0 ? xAxisIndices[0] : -1;
        const xAxisSecondaryIndex = xAxisIndices.length > 1 ? xAxisIndices[1] : -1;
        const dateAxisIndex = detectDateAxisIndex(categorical, xAxisIndices);
        const xAxisIndexForX = dateAxisIndex >= 0 ? dateAxisIndex : xAxisPrimaryIndex;
        const xAxisIndexForSeriesFallback = xAxisIndices.find(i => i !== xAxisIndexForX) ?? -1;
        const seriesIndex = legendIndex >= 0 ? legendIndex : xAxisIndexForSeriesFallback;

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

        const toDateMs = (value: any): number | null => {
            // For the X axis itself, we can be less strict than the heuristic parser because
            // we only use ms when parsing succeeds.
            if (value === null || value === undefined) return null;
            if (value instanceof Date) {
                const ms = value.getTime();
                return Number.isNaN(ms) ? null : ms;
            }
            if (typeof value === "number" && Number.isFinite(value)) {
                // Avoid treating quarter/month numbers, ids, ranks, etc. as ms timestamps.
                if (value < MIN_MS_TIMESTAMP_FOR_DATE_AXIS) return null;
                const d = new Date(value);
                return Number.isNaN(d.getTime()) ? null : value;
            }
            const d = new Date(value);
            const ms = d.getTime();
            return Number.isNaN(ms) ? null : ms;
        };

        const acc = new Map<AccKey, { xValue: string; seriesKey: string; groupValue: string; value: number }>();

        for (const vg of valueGroups) {
            const groupValue = vg.groupValue;
            const values = vg.values ?? [];
            const highlights = vg.highlights;
            groupsSet.add(groupValue);

            for (let i = 0; i < values.length; i++) {
                const rawXValue = xAxisIndexForX >= 0 ? categorical.categories![xAxisIndexForX].values[i] : null;
                const dateMs = toDateMs(rawXValue);
                const xValue = dateMs !== null ? String(dateMs) : formatDataValue(rawXValue, i);

                if (dateMs !== null && !xValueSortKey.has(xValue)) {
                    xValueSortKey.set(xValue, dateMs);
                }
                xValuesSet.add(xValue);
                if (dateAxisIndex >= 0 && dateMs !== null) {
                    xMsByValue.set(xValue, dateMs);
                }

                const seriesKeyRaw = seriesIndex >= 0
                    ? String(categorical.categories![seriesIndex].values[i] ?? "")
                    : String(valueDisplayName ?? "Value");
                const seriesKey = seriesKeyRaw.trim() ? seriesKeyRaw.trim() : "All";
                seriesKeysSet.add(seriesKey);

                const rawValue = Number(values[i]);
                const hasHighlight = highlights && highlights[i] !== null && highlights[i] !== undefined;
                const highlightValue = hasHighlight ? Number(highlights![i]) : null;
                const value = Number.isFinite(hasHighlight ? highlightValue : rawValue)
                    ? Number(hasHighlight ? highlightValue : rawValue)
                    : NaN;

                const key = `${groupValue}||${seriesKey}||${xValue}`;
                const prev = acc.get(key);
                if (!prev) {
                    acc.set(key, { xValue, seriesKey, groupValue, value: Number.isFinite(value) ? value : NaN });
                } else {
                    // Sum duplicates (if either is NaN, keep the finite one; if both NaN keep NaN).
                    const a = prev.value;
                    const b = value;
                    if (Number.isFinite(a) && Number.isFinite(b)) prev.value = a + b;
                    else if (!Number.isFinite(a) && Number.isFinite(b)) prev.value = b;
                }
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

        // Materialize points
        const dataPoints: DataPoint[] = [];
        let idx = 0;
        for (const v of acc.values()) {
            const n = v.value;
            if (Number.isFinite(n)) {
                if (n > maxValue) maxValue = n;
                if (n < minValue) minValue = n;
            }
            dataPoints.push({
                xValue: v.xValue,
                yValue: v.seriesKey,
                value: v.value,
                groupValue: v.groupValue,
                index: idx++
            });
        }

        if (minValue === Infinity) minValue = 0;
        if (maxValue === -Infinity) maxValue = 1;

        return {
            dataPoints,
            xValues,
            yValues: seriesKeys.length ? seriesKeys : [String(valueDisplayName ?? "Value")],
            groups: groups.length ? groups : ["All"],
            maxValue,
            minValue,
            hasLegendRoleData: seriesIndex >= 0 && seriesKeys.length > 0,
            xIsDateAxis: dateAxisIndex >= 0,
            xMsByValue: dateAxisIndex >= 0 ? xMsByValue : undefined,
            valueFormatString,
            valueDisplayName
        };
    }
}
