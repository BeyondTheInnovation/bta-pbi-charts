"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface IChartData extends ChartData {
    valuesByGroup: Map<string, Map<string, number>>;
    valueFormatString?: string;
}

function normalizeLocation(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
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
            valuesByGroup: new Map()
        };

        if (!categorical?.categories?.length || !categorical.values?.length) return empty;

        const locationCol = categorical.categories.find((c) => c.source.roles?.["location"]) ?? categorical.categories[0];
        const groupCol = categorical.categories.find((c) => c.source.roles?.["group"]);
        const valueCol = categorical.values.find((v) => v.source.roles?.["values"]) ?? categorical.values[0];

        if (!locationCol || !valueCol) return empty;

        const valuesByGroup = new Map<string, Map<string, number>>();
        const dataPoints: DataPoint[] = [];
        const groupsSet = new Set<string>();
        let maxValue = Number.NEGATIVE_INFINITY;
        let minValue = Number.POSITIVE_INFINITY;

        for (let i = 0; i < valueCol.values.length; i++) {
            const value = Number(valueCol.values[i]);
            if (!Number.isFinite(value)) continue;

            const rawLocation = String(locationCol.values[i] ?? "(Blank)");
            const location = normalizeLocation(rawLocation);
            const group = groupCol ? formatGroupValue(groupCol.values[i]) : "All";
            groupsSet.add(group);

            const bucket = valuesByGroup.get(group) ?? new Map<string, number>();
            bucket.set(location, (bucket.get(location) ?? 0) + value);
            valuesByGroup.set(group, bucket);

            dataPoints.push({ xValue: rawLocation, yValue: group, value, groupValue: group, index: i });
            maxValue = Math.max(maxValue, value);
            minValue = Math.min(minValue, value);
        }

        if (!Number.isFinite(maxValue)) maxValue = 0;
        if (!Number.isFinite(minValue)) minValue = 0;

        return {
            dataPoints,
            xValues: Array.from(new Set(dataPoints.map((d) => d.xValue))),
            yValues: Array.from(groupsSet),
            groups: Array.from(groupsSet),
            maxValue,
            minValue,
            valuesByGroup,
            valueFormatString: (valueCol.source as any)?.format as string | undefined
        };
    }
}
