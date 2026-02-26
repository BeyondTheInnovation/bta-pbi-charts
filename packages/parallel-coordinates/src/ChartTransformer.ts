"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface IParallelRow {
    id: string;
    category: string;
    group: string;
    values: Record<string, number>;
}

export interface IParallelDimension {
    key: string;
    min: number;
    max: number;
}

export interface IChartData extends ChartData {
    rows: IParallelRow[];
    dimensions: IParallelDimension[];
    formatByDimension: Map<string, string | undefined>;
}

export class ChartTransformer {
    public static transform(dataView: DataView): IChartData {
        const categorical = dataView.categorical;
        const empty: IChartData = {
            dataPoints: [],
            xValues: [],
            yValues: [],
            groups: [],
            maxValue: 0,
            minValue: 0,
            rows: [],
            dimensions: [],
            formatByDimension: new Map()
        };

        if (!categorical?.values?.length) {
            return empty;
        }

        const categoryCol = categorical.categories?.find((c) => c.source.roles?.["category"]) ?? categorical.categories?.[0];
        const groupCol = categorical.categories?.find((c) => c.source.roles?.["group"]);
        const measureCols = categorical.values.filter((v) => v.source.roles?.["values"]);

        if (measureCols.length < 1) {
            return empty;
        }

        const rowCount = measureCols[0].values.length;
        const rows: IParallelRow[] = [];
        const dataPoints: DataPoint[] = [];
        const groupsSet = new Set<string>();

        const dimensionExtents = new Map<string, { min: number; max: number }>();
        const formatByDimension = new Map<string, string | undefined>();

        measureCols.forEach((col) => {
            const key = String(col.source.displayName || "Value");
            formatByDimension.set(key, (col.source as any)?.format as string | undefined);
            dimensionExtents.set(key, { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY });
        });

        for (let i = 0; i < rowCount; i++) {
            const category = categoryCol ? String(categoryCol.values[i] ?? ("Item " + (i + 1))) : ("Item " + (i + 1));
            const group = groupCol ? formatGroupValue(groupCol.values[i]) : "All";
            groupsSet.add(group);

            const values: Record<string, number> = {};
            let validCount = 0;

            measureCols.forEach((col) => {
                const key = String(col.source.displayName || "Value");
                const num = Number(col.values[i]);
                if (!Number.isFinite(num)) return;
                validCount++;
                values[key] = num;
            });

            if (validCount !== measureCols.length) continue;

            Object.entries(values).forEach(([key, num]) => {
                const ext = dimensionExtents.get(key)!;
                ext.min = Math.min(ext.min, num);
                ext.max = Math.max(ext.max, num);
            });

            rows.push({ id: String(i), category, group, values });
            dataPoints.push({ xValue: category, yValue: group, value: 0, groupValue: group, index: i });
        }

        const dimensions: IParallelDimension[] = Array.from(dimensionExtents.entries())
            .map(([key, ext]) => ({
                key,
                min: Number.isFinite(ext.min) ? ext.min : 0,
                max: Number.isFinite(ext.max) ? ext.max : 1
            }));

        return {
            dataPoints,
            xValues: dimensions.map((d) => d.key),
            yValues: Array.from(groupsSet),
            groups: Array.from(groupsSet),
            maxValue: 1,
            minValue: 0,
            rows,
            dimensions,
            formatByDimension
        };
    }
}
