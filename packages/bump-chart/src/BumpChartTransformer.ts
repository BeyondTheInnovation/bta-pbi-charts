"use strict";

import powerbi from "powerbi-visuals-api";
import DataViewCategorical = powerbi.DataViewCategorical;
import { ChartData, DataPoint, formatDataValue, formatGroupValue, sortDateValues } from "@pbi-visuals/shared";

export interface BumpChartDataPoint extends DataPoint {
    rank: number;
}

export interface BumpChartData extends ChartData {
    rankedData: Map<string, BumpChartDataPoint[]>;
    maxRank: number;
    hasLegendRoleData: boolean;
}

export class BumpChartTransformer {
    public static transform(categorical: DataViewCategorical): BumpChartData {
        const dataPoints: DataPoint[] = [];
        const xValuesSet = new Set<string>();
        const yValuesSet = new Set<string>();
        const groupsSet = new Set<string>();
        const pointsByGroupByX = new Map<string, Map<string, DataPoint[]>>();
        let maxValue = 0;
        let minValue = Infinity;

        let xAxisIndex = -1;
        let yAxisIndex = -1;
        let legendIndex = -1;

        if (categorical.categories) {
            categorical.categories.forEach((cat, idx) => {
                const role = cat.source.roles;
                if (role) {
                    if (role["xAxis"]) xAxisIndex = idx;
                    if (role["yAxis"]) yAxisIndex = idx;
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

        const valueDisplayName =
            (groupedValues?.[0]?.values?.[0]?.source as any)?.displayName as string | undefined
            ?? (categorical.values?.[0]?.source as any)?.displayName as string | undefined;

        let pointIndex = 0;
        for (const vg of valueGroups) {
            const groupValue = vg.groupValue;
            const values = vg.values ?? [];
            const highlights = vg.highlights;
            groupsSet.add(groupValue);

            for (let i = 0; i < values.length; i++) {
                const rawXValue = xAxisIndex >= 0 ? categorical.categories![xAxisIndex].values[i] : null;
                const xValue = formatDataValue(rawXValue, i);
                const yValue = yAxisIndex >= 0 ? String(categorical.categories![yAxisIndex].values[i] ?? "") : "Series";
                const rawValue = Number(values[i]) || 0;
                const hasHighlight = highlights && highlights[i] !== null && highlights[i] !== undefined;
                const highlightValue = hasHighlight ? (Number(highlights![i]) || 0) : 0;
                const value = hasHighlight ? highlightValue : rawValue;

                if (value > maxValue) maxValue = value;
                if (value < minValue && value > 0) minValue = value;

                xValuesSet.add(xValue);
                yValuesSet.add(yValue);

                dataPoints.push({
                    xValue,
                    yValue,
                    value,
                    groupValue,
                    index: pointIndex++
                });

                const groupMap = pointsByGroupByX.get(groupValue) ?? new Map<string, DataPoint[]>();
                const pointsAtX = groupMap.get(xValue) ?? [];
                pointsAtX.push(dataPoints[dataPoints.length - 1]);
                groupMap.set(xValue, pointsAtX);
                pointsByGroupByX.set(groupValue, groupMap);
            }
        }

        const xValues = sortDateValues(Array.from(xValuesSet));
        const xOrder = new Map<string, number>(xValues.map((x, idx) => [x, idx]));
        const yValues = Array.from(yValuesSet).sort();
        const groups = Array.from(groupsSet).sort();

        if (minValue === Infinity) minValue = 0;

        // Calculate ranks for each x position, per group
        const rankedData = new Map<string, BumpChartDataPoint[]>();
        let maxRank = 0;

        yValues.forEach(y => {
            rankedData.set(y, []);
        });

        const groupsToRank = groups.length ? groups : ["All"];
        groupsToRank.forEach(groupValue => {
            const pointsByX = pointsByGroupByX.get(groupValue);
            if (!pointsByX) return;

            xValues.forEach(xVal => {
                const pointsAtX = pointsByX.get(xVal);
                if (!pointsAtX || pointsAtX.length === 0) return;

                // Sort by value descending to get ranks (highest value = rank 1)
                const sorted = [...pointsAtX].sort((a, b) => b.value - a.value);

                // Assign ranks
                sorted.forEach((dp, idx) => {
                    const rank = idx + 1;
                    if (rank > maxRank) maxRank = rank;

                    const rankedPoint: BumpChartDataPoint = {
                        ...dp,
                        rank
                    };

                    rankedData.get(dp.yValue)!.push(rankedPoint);
                });
            });
        });

        // Sort each series by x position
        yValues.forEach(y => {
            const series = rankedData.get(y)!;
            series.sort((a, b) => (xOrder.get(a.xValue) ?? 0) - (xOrder.get(b.xValue) ?? 0));
        });

        return {
            dataPoints,
            xValues,
            yValues,
            groups,
            maxValue,
            minValue,
            rankedData,
            maxRank: maxRank || yValues.length,
            hasLegendRoleData: legendIndex >= 0,
            valueFormatString,
            valueDisplayName
        };
    }
}
