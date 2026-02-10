"use strict";

import powerbi from "powerbi-visuals-api";
import DataViewCategorical = powerbi.DataViewCategorical;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface DonutChartData extends ChartData {
    segmentsByGroup: Map<string, Array<{ category: string; value: number }>>;
    totalsByGroup: Map<string, number>;
    hasLegendRoleData: boolean;
    hasHighlights: boolean;
}

export class DonutChartTransformer {
    public static transform(categorical: DataViewCategorical): DonutChartData {
        const dataPoints: DataPoint[] = [];
        const categoriesSet = new Set<string>();
        const groupsSet = new Set<string>();
        const segmentsByGroup = new Map<string, Map<string, number>>();
        let hasHighlights = false;

        let maxValue = 0;
        let minValue = Infinity;

        let legendIndex = -1;

        if (categorical.categories) {
            categorical.categories.forEach((cat, idx) => {
                const role = cat.source.roles;
                if (role) {
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

        for (const vg of valueGroups) {
            const groupValue = vg.groupValue;
            const values = vg.values ?? [];
            const highlights = vg.highlights;
            groupsSet.add(groupValue);

            for (let i = 0; i < values.length; i++) {
                const category = legendIndex >= 0
                    ? String(categorical.categories![legendIndex].values[i] ?? "")
                    : "All";
                const rawValue = Number(values[i]) || 0;
                const hasPointHighlight = highlights && highlights[i] !== null && highlights[i] !== undefined;
                const highlightValue = hasPointHighlight ? (Number(highlights![i]) || 0) : 0;
                const value = hasPointHighlight ? highlightValue : rawValue;
                if (hasPointHighlight) {
                    hasHighlights = true;
                }

                categoriesSet.add(category);

                const groupMap = segmentsByGroup.get(groupValue) ?? new Map<string, number>();
                groupMap.set(category, (groupMap.get(category) ?? 0) + value);
                segmentsByGroup.set(groupValue, groupMap);
            }
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
            totalsByGroup,
            hasLegendRoleData: legendIndex >= 0,
            hasHighlights,
            valueFormatString,
            valueDisplayName
        };
    }
}
