"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface IMatrixRow {
    id: string;
    category: string;
    group: string;
    values: Record<string, number>;
}

export interface IMatrixDimension {
    key: string;
    min: number;
    max: number;
    format?: string;
}

export interface IChartData extends ChartData {
    rows: IMatrixRow[];
    dimensions: IMatrixDimension[];
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
            dimensions: []
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
        const rows: IMatrixRow[] = [];
        const dataPoints: DataPoint[] = [];
        const groupsSet = new Set<string>();

        const dims = measureCols.map((col) => ({
            key: String(col.source.displayName || "Value"),
            min: Number.POSITIVE_INFINITY,
            max: Number.NEGATIVE_INFINITY,
            format: (col.source as any)?.format as string | undefined
        }));

        for (let i = 0; i < rowCount; i++) {
            const category = categoryCol ? String(categoryCol.values[i] ?? ("Item " + (i + 1))) : ("Item " + (i + 1));
            const group = groupCol ? formatGroupValue(groupCol.values[i]) : "All";
            groupsSet.add(group);

            const values: Record<string, number> = {};
            let valid = 0;

            measureCols.forEach((col, idx) => {
                const num = Number(col.values[i]);
                if (!Number.isFinite(num)) return;
                const key = dims[idx].key;
                values[key] = num;
                dims[idx].min = Math.min(dims[idx].min, num);
                dims[idx].max = Math.max(dims[idx].max, num);
                valid++;
            });

            if (valid < 1) continue;
            rows.push({ id: String(i), category, group, values });
            dataPoints.push({ xValue: category, yValue: group, value: 0, groupValue: group, index: i });
        }

        const dimensions = dims.map((d) => ({
            ...d,
            min: Number.isFinite(d.min) ? d.min : 0,
            max: Number.isFinite(d.max) ? d.max : 1
        }));

        return {
            dataPoints,
            xValues: dimensions.map((d) => d.key),
            yValues: Array.from(groupsSet),
            groups: Array.from(groupsSet),
            maxValue: 1,
            minValue: 0,
            rows,
            dimensions
        };
    }
}
