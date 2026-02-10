"use strict";

import powerbi from "powerbi-visuals-api";
import DataViewCategorical = powerbi.DataViewCategorical;
import { ChartData, DataPoint, formatDataValue, formatGroupValue, sortDateValues } from "@pbi-visuals/shared";

export interface StreamgraphData extends ChartData {
    stackedDataByGroup: Map<string, Map<string, Map<string, number>>>;
    maxStackSum: number;
    hasLegendRoleData: boolean;
}

export class StreamgraphTransformer {
    public static transform(categorical: DataViewCategorical): StreamgraphData {
        const dataPoints: DataPoint[] = [];
        const xValuesSet = new Set<string>();
        const yValuesSet = new Set<string>();
        const groupsSet = new Set<string>();
        let maxValue = 0;
        let minValue = Infinity;
        let maxStackSum = 0;

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

        // Prefer the dedicated legend role for series when bound; fall back to yAxis for legacy configs.
        const seriesIndex = legendIndex >= 0 ? legendIndex : yAxisIndex;

        // group -> series -> x -> value
        const stackedDataByGroup = new Map<string, Map<string, Map<string, number>>>();
        const sumByGroupByX = new Map<string, Map<string, number>>();

        // Build data points
        let pointIndex = 0;
        for (const vg of valueGroups) {
            const groupValue = vg.groupValue;
            const values = vg.values ?? [];
            const highlights = vg.highlights;
            groupsSet.add(groupValue);

            for (let i = 0; i < values.length; i++) {
                const rawXValue = xAxisIndex >= 0 ? categorical.categories![xAxisIndex].values[i] : null;
                const xValue = formatDataValue(rawXValue, i);
                const yValue = seriesIndex >= 0 ? String(categorical.categories![seriesIndex].values[i] ?? "") : "Series";
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

                // Accumulate stacked values per (group, series, x)
                const groupMap = stackedDataByGroup.get(groupValue) ?? new Map<string, Map<string, number>>();
                const seriesMap = groupMap.get(yValue) ?? new Map<string, number>();
                seriesMap.set(xValue, (seriesMap.get(xValue) ?? 0) + value);
                groupMap.set(yValue, seriesMap);
                stackedDataByGroup.set(groupValue, groupMap);

                // Track max stacked sum per x within group (for axis label sizing)
                const sumByX = sumByGroupByX.get(groupValue) ?? new Map<string, number>();
                const nextSum = (sumByX.get(xValue) ?? 0) + value;
                sumByX.set(xValue, nextSum);
                sumByGroupByX.set(groupValue, sumByX);
                if (nextSum > maxStackSum) maxStackSum = nextSum;
            }
        }

        const xValues = sortDateValues(Array.from(xValuesSet));
        const yValues = Array.from(yValuesSet).sort();
        const groups = Array.from(groupsSet).sort();

        if (minValue === Infinity) minValue = 0;

        const hasLegendRoleData = legendIndex >= 0;
        return {
            dataPoints,
            xValues,
            yValues,
            groups,
            maxValue,
            minValue,
            stackedDataByGroup,
            maxStackSum,
            hasLegendRoleData,
            valueFormatString,
            valueDisplayName
        };
    }
}
