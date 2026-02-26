"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface IBoxPoint {
    category: string;
    group: string;
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    outliers: number[];
    count: number;
}

export interface IChartData extends ChartData {
    boxes: IBoxPoint[];
    valueFormatString?: string;
    valueDisplayName?: string;
}

function quantile(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const h = idx - lo;
    return sorted[lo] * (1 - h) + sorted[hi] * h;
}

function buildBox(values: number[], category: string, group: string): IBoxPoint {
    const sorted = values.slice().sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const median = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lowFence = q1 - 1.5 * iqr;
    const highFence = q3 + 1.5 * iqr;
    const nonOutliers = sorted.filter((v) => v >= lowFence && v <= highFence);
    const outliers = sorted.filter((v) => v < lowFence || v > highFence);

    return {
        category,
        group,
        min: nonOutliers.length ? nonOutliers[0] : sorted[0] ?? 0,
        q1,
        median,
        q3,
        max: nonOutliers.length ? nonOutliers[nonOutliers.length - 1] : sorted[sorted.length - 1] ?? 0,
        outliers,
        count: sorted.length
    };
}

export class ChartTransformer {
    public static transform(dataView: DataView): IChartData {
        const empty: IChartData = {
            dataPoints: [],
            xValues: [],
            yValues: [],
            groups: [],
            maxValue: 0,
            minValue: 0,
            boxes: []
        };

        const buckets = new Map<string, number[]>();
        let valueFormatString: string | undefined;
        let valueDisplayName: string | undefined;
        const pushValue = (categoryRaw: unknown, groupRaw: unknown, valueRaw: unknown): void => {
            const value = Number(valueRaw);
            if (!Number.isFinite(value)) return;
            const category = String(categoryRaw ?? "(Blank)");
            const group = groupRaw !== undefined && groupRaw !== null ? formatGroupValue(groupRaw) : "All";

            const key = group + "\u001f" + category;
            const bucket = buckets.get(key) ?? [];
            bucket.push(value);
            buckets.set(key, bucket);
        };

        const table = dataView.table;
        if (table?.rows?.length && table.columns?.length) {
            const columns = table.columns;
            const categoryIdx = columns.findIndex((c) => c.roles?.["category"]);
            const groupIdx = columns.findIndex((c) => c.roles?.["group"]);
            const roleValueIdx = columns.findIndex((c) => c.roles?.["values"]);
            const numericFallbackIdx = columns.findIndex((_, idx) => {
                if (idx === categoryIdx || idx === groupIdx) return false;
                return table.rows.some((r) => Number.isFinite(Number(r[idx])));
            });
            const valueIdx = roleValueIdx >= 0 ? roleValueIdx : numericFallbackIdx;
            const resolvedCategoryIdx = categoryIdx >= 0 ? categoryIdx : 0;

            if (resolvedCategoryIdx >= 0 && valueIdx >= 0) {
                valueFormatString = (columns[valueIdx] as any)?.format as string | undefined;
                valueDisplayName = (columns[valueIdx] as any)?.displayName as string | undefined;
                table.rows.forEach((row) => {
                    pushValue(row[resolvedCategoryIdx], groupIdx >= 0 ? row[groupIdx] : undefined, row[valueIdx]);
                });
            }
        }

        const categorical = dataView.categorical;
        if (categorical?.categories?.length) {
            const categories = categorical.categories;
            const categoryCol = categories.find((c) => c.source.roles?.["category"]) ?? categories[0];
            const groupCol = categories.find((c) => c.source.roles?.["group"]);
            const valueMeasureCol = categorical.values?.find((v) => v.source.roles?.["values"]) ?? categorical.values?.[0];
            const roleValueCategoryCol = categories.find((c) => c.source.roles?.["values"]);
            const fallbackValueCategoryCol = categories.find((c) => c !== categoryCol && c !== groupCol && c.values?.some((v) => Number.isFinite(Number(v))));
            const valueCol = valueMeasureCol ?? roleValueCategoryCol ?? fallbackValueCategoryCol;
            const valueValues = valueCol?.values as any[] | undefined;

            if (categoryCol && valueValues?.length) {
                valueFormatString = (valueCol?.source as any)?.format as string | undefined;
                valueDisplayName = (valueCol?.source as any)?.displayName as string | undefined;
                for (let i = 0; i < valueValues.length; i++) {
                    pushValue(categoryCol.values[i], groupCol ? groupCol.values[i] : undefined, valueValues[i]);
                }
            }
        }

        if (!buckets.size) {
            return empty;
        }

        const boxes: IBoxPoint[] = [];
        const dataPoints: DataPoint[] = [];
        let maxValue = Number.NEGATIVE_INFINITY;
        let minValue = Number.POSITIVE_INFINITY;

        for (const [key, values] of buckets.entries()) {
            const sep = key.indexOf("\u001f");
            const group = key.slice(0, sep);
            const category = key.slice(sep + 1);
            const box = buildBox(values, category, group);
            boxes.push(box);

            maxValue = Math.max(maxValue, box.max, box.q3, ...box.outliers);
            minValue = Math.min(minValue, box.min, box.q1, ...box.outliers);

            dataPoints.push({
                xValue: category,
                yValue: group,
                value: box.median,
                groupValue: group,
                index: dataPoints.length
            });
        }

        if (!Number.isFinite(maxValue)) maxValue = 0;
        if (!Number.isFinite(minValue)) minValue = 0;

        const xValues = Array.from(new Set(boxes.map((b) => b.category)));
        const groups = Array.from(new Set(boxes.map((b) => b.group)));

        return {
            dataPoints,
            xValues,
            yValues: groups,
            groups,
            maxValue,
            minValue,
            boxes,
            valueFormatString,
            valueDisplayName
        };
    }
}
