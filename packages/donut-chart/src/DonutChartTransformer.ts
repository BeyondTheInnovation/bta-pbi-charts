"use strict";

import powerbi from "powerbi-visuals-api";
import DataViewCategorical = powerbi.DataViewCategorical;
import { ChartData, DataPoint } from "@pbi-visuals/shared";

export interface DonutChartData extends ChartData {
    segmentsByGroup: Map<string, Array<{ category: string; value: number }>>;
    totalsByGroup: Map<string, number>;
}

export class DonutChartTransformer {
    public static transform(categorical: DataViewCategorical): DonutChartData {
        const dataPoints: DataPoint[] = [];
        const categoriesSet = new Set<string>();
        const groupsSet = new Set<string>();
        const segmentsByGroup = new Map<string, Map<string, number>>();

        let maxValue = 0;
        let minValue = Infinity;

        let categoryIndex = -1;
        let groupByIndex = -1;

        if (categorical.categories) {
            categorical.categories.forEach((cat, idx) => {
                const role = cat.source.roles;
                if (role) {
                    if (role["category"]) categoryIndex = idx;
                    if (role["groupBy"]) groupByIndex = idx;
                }
            });
        }

        const values = categorical.values?.[0]?.values || [];

        for (let i = 0; i < values.length; i++) {
            const category = categoryIndex >= 0
                ? String(categorical.categories![categoryIndex].values[i] ?? "")
                : "All";
            const groupValue = groupByIndex >= 0
                ? String(categorical.categories![groupByIndex].values[i] ?? "")
                : "All";
            const value = Number(values[i]) || 0;

            categoriesSet.add(category);
            groupsSet.add(groupValue);

            const groupMap = segmentsByGroup.get(groupValue) ?? new Map<string, number>();
            groupMap.set(category, (groupMap.get(category) ?? 0) + value);
            segmentsByGroup.set(groupValue, groupMap);
        }

        const categories = Array.from(categoriesSet).sort();
        const groups = Array.from(groupsSet).sort();

        const totalsByGroup = new Map<string, number>();

        groups.forEach(group => {
            const groupMap = segmentsByGroup.get(group) ?? new Map<string, number>();
            let total = 0;

            categories.forEach(category => {
                const value = groupMap.get(category) ?? 0;
                total += value;
                if (value > maxValue) maxValue = value;
                if (value > 0 && value < minValue) minValue = value;
            });

            totalsByGroup.set(group, total);

            categories.forEach((category, idx) => {
                dataPoints.push({
                    xValue: category,
                    yValue: category,
                    value: groupMap.get(category) ?? 0,
                    groupValue: group,
                    index: idx
                });
            });
        });

        if (minValue === Infinity) minValue = 0;

        const segmentsOut = new Map<string, Array<{ category: string; value: number }>>();
        groups.forEach(group => {
            const groupMap = segmentsByGroup.get(group) ?? new Map<string, number>();
            segmentsOut.set(group, categories.map(c => ({ category: c, value: groupMap.get(c) ?? 0 })));
        });

        return {
            dataPoints,
            xValues: categories,
            yValues: categories,
            groups,
            maxValue,
            minValue,
            segmentsByGroup: segmentsOut,
            totalsByGroup
        };
    }
}

