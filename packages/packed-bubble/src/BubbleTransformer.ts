"use strict";

import powerbi from "powerbi-visuals-api";
import DataViewCategorical = powerbi.DataViewCategorical;
import { formatGroupValue } from "@pbi-visuals/shared";

export interface BubbleNode {
    id: string;
    category: string;
    value: number;
    radius: number;
    groupValue: string;
    legendKey: string;
    index: number;
    x?: number;
    y?: number;
}

export interface BubbleData {
    nodes: BubbleNode[];
    categories: string[];
    legendItems: string[];
    groups: string[];
    maxValue: number;
    minValue: number;
    categoryColorMap?: Map<string, string>;
    hasLegendRoleData: boolean;
    valueFormatString?: string;
}

export class BubbleTransformer {
    public static transform(categorical: DataViewCategorical): BubbleData {
        const nodes: BubbleNode[] = [];
        const categoriesSet = new Set<string>();
        const groupsSet = new Set<string>();
        const legendItemsSet = new Set<string>();
        let maxValue = 0;
        let minValue = Infinity;

        let yAxisIndex = -1;
        let legendIndex = -1;

        if (categorical.categories) {
            categorical.categories.forEach((cat, idx) => {
                const role = cat.source.roles;
                if (role) {
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

        let nodeIdCounter = 0;
        valueGroups.forEach((vg, groupIdx) => {
            const groupValue = vg.groupValue;
            const values = vg.values ?? [];
            const highlights = vg.highlights;
            groupsSet.add(groupValue);

            for (let i = 0; i < values.length; i++) {
                // Use yAxis for category (bubble grouping), fallback to legend if no yAxis
                const categorySource = yAxisIndex >= 0 ? yAxisIndex : legendIndex;
                const category = categorySource >= 0
                    ? String(categorical.categories![categorySource].values[i] ?? "")
                    : "All";
                const legendKeyRaw = legendIndex >= 0 ? categorical.categories![legendIndex].values[i] : null;
                const legendKey = legendIndex >= 0 ? String(legendKeyRaw ?? "") : "All";
                const rawValue = Number(values[i]) || 0;
                const hasHighlight = highlights && highlights[i] !== null && highlights[i] !== undefined;
                const highlightValue = hasHighlight ? (Number(highlights![i]) || 0) : 0;
                const value = hasHighlight ? highlightValue : rawValue;

                if (value > 0) {
                    if (value > maxValue) maxValue = value;
                    if (value < minValue) minValue = value;

                    categoriesSet.add(category);
                    if (legendIndex >= 0 && legendKey) {
                        legendItemsSet.add(legendKey);
                    }

                    nodes.push({
                        id: `bubble-${groupIdx}-${i}-${nodeIdCounter++}`,
                        category,
                        value,
                        radius: 0, // Will be calculated based on scale
                        groupValue,
                        legendKey: legendKey || "All",
                        index: i
                    });
                }
            }
        });

        const categories = Array.from(categoriesSet).sort();
        const legendItems = Array.from(legendItemsSet).sort();
        const groups = Array.from(groupsSet).sort();

        if (minValue === Infinity) minValue = 0;

        const hasLegendRoleData = legendIndex >= 0 && legendItems.length > 0;
        return { nodes, categories, legendItems, groups, maxValue, minValue, hasLegendRoleData, valueFormatString };
    }
}
