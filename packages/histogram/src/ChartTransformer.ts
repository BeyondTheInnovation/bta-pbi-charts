"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface IHistogramBin {
    group: string;
    x0: number;
    x1: number;
    count: number;
}

export interface IChartData extends ChartData {
    bins: IHistogramBin[];
    groupDomains: Map<string, { min: number; max: number; maxCount: number }>;
    valueFormatString?: string;
    valueDisplayName?: string;
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
            bins: [],
            groupDomains: new Map()
        };

        const valuesByGroup = new Map<string, number[]>();
        const xValues: string[] = [];
        const dataPoints: DataPoint[] = [];
        let valueFormatString: string | undefined;
        let valueDisplayName: string | undefined;

        const pushValue = (index: number, categoryRaw: unknown, groupRaw: unknown, valueRaw: unknown): void => {
            const raw = Number(valueRaw);
            if (!Number.isFinite(raw)) return;
            const group = groupRaw !== undefined && groupRaw !== null ? formatGroupValue(groupRaw) : "All";
            const category = String(categoryRaw ?? ("Point " + (index + 1)));
            const bucket = valuesByGroup.get(group) ?? [];
            bucket.push(raw);
            valuesByGroup.set(group, bucket);
            xValues.push(category);
            dataPoints.push({
                xValue: category,
                yValue: group,
                value: raw,
                groupValue: group,
                index
            });
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
                table.rows.forEach((row, i) => {
                    pushValue(i, row[resolvedCategoryIdx], groupIdx >= 0 ? row[groupIdx] : undefined, row[valueIdx]);
                });
            }
        }

        const categorical = dataView.categorical;
        if (categorical) {
            const categoryCol = categorical.categories?.find((c) => c.source.roles?.["category"]) ?? categorical.categories?.[0];
            const groupCol = categorical.categories?.find((c) => c.source.roles?.["group"]);
            const valueMeasureCol = categorical.values?.find((v) => v.source.roles?.["values"]) ?? categorical.values?.[0];
            const roleValueCategoryCol = categorical.categories?.find((c) => c.source.roles?.["values"]);
            const fallbackValueCategoryCol = categorical.categories?.find((c) => c !== categoryCol && c !== groupCol && c.values?.some((v) => Number.isFinite(Number(v))));
            const valueCol = valueMeasureCol ?? roleValueCategoryCol ?? fallbackValueCategoryCol;
            const valueValues = valueCol?.values as any[] | undefined;
            if (valueValues?.length) {
                valueFormatString = (valueCol?.source as any)?.format as string | undefined;
                valueDisplayName = (valueCol?.source as any)?.displayName as string | undefined;
                for (let i = 0; i < valueValues.length; i++) {
                    pushValue(i, categoryCol ? categoryCol.values[i] : undefined, groupCol ? groupCol.values[i] : undefined, valueValues[i]);
                }
            }
        }

        if (!dataPoints.length) {
            return empty;
        }

        const groups = Array.from(valuesByGroup.keys());
        const bins: IHistogramBin[] = [];
        const groupDomains = new Map<string, { min: number; max: number; maxCount: number }>();

        let globalMin = Number.POSITIVE_INFINITY;
        let globalMax = Number.NEGATIVE_INFINITY;
        let globalMaxCount = 0;

        for (const group of groups) {
            const values = (valuesByGroup.get(group) ?? []).slice().sort((a, b) => a - b);
            if (!values.length) continue;

            const min = values[0];
            const max = values[values.length - 1];
            const span = Math.max(1e-9, max - min);
            const binCount = Math.max(6, Math.min(24, Math.round(Math.sqrt(values.length) * 2)));
            const step = span / binCount;
            const counts = new Array(binCount).fill(0);

            values.forEach((v) => {
                const idx = Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / step)));
                counts[idx]++;
            });

            let localMax = 0;
            for (let i = 0; i < binCount; i++) {
                const count = counts[i];
                const x0 = min + i * step;
                const x1 = i === binCount - 1 ? max : min + (i + 1) * step;
                bins.push({ group, x0, x1, count });
                if (count > localMax) localMax = count;
            }

            groupDomains.set(group, { min, max, maxCount: localMax });
            globalMin = Math.min(globalMin, min);
            globalMax = Math.max(globalMax, max);
            globalMaxCount = Math.max(globalMaxCount, localMax);
        }

        if (!Number.isFinite(globalMin)) globalMin = 0;
        if (!Number.isFinite(globalMax)) globalMax = 0;

        return {
            dataPoints,
            xValues,
            yValues: groups,
            groups,
            maxValue: globalMaxCount,
            minValue: globalMin,
            bins,
            groupDomains,
            valueFormatString,
            valueDisplayName
        };
    }
}
