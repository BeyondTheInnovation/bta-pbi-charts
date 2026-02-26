"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface ISankeyNode {
    id: string;
}

export interface ISankeyLink {
    source: string;
    target: string;
    value: number;
    group: string;
}

export interface IChartData extends ChartData {
    nodesByGroup: Map<string, ISankeyNode[]>;
    linksByGroup: Map<string, ISankeyLink[]>;
    valueFormatString?: string;
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
            nodesByGroup: new Map(),
            linksByGroup: new Map()
        };

        if (!categorical?.categories?.length || !categorical.values?.length) {
            return empty;
        }

        const sourceCol = categorical.categories.find((c) => c.source.roles?.["source"]);
        const targetCol = categorical.categories.find((c) => c.source.roles?.["target"]);
        const groupCol = categorical.categories.find((c) => c.source.roles?.["group"]);
        const valueCol = categorical.values.find((v) => v.source.roles?.["values"]) ?? categorical.values[0];

        if (!sourceCol || !targetCol || !valueCol) {
            return empty;
        }

        const linksByGroup = new Map<string, Map<string, number>>();
        const nodesByGroup = new Map<string, Set<string>>();
        let maxValue = 0;

        for (let i = 0; i < valueCol.values.length; i++) {
            const source = String(sourceCol.values[i] ?? "(Blank)");
            const target = String(targetCol.values[i] ?? "(Blank)");
            const value = Number(valueCol.values[i]);
            // Sankey layout requires strictly positive link weights.
            if (!Number.isFinite(value) || value <= 0) continue;
            const group = groupCol ? formatGroupValue(groupCol.values[i]) : "All";

            const key = source + "\u001f" + target;
            const linkMap = linksByGroup.get(group) ?? new Map<string, number>();
            linkMap.set(key, (linkMap.get(key) ?? 0) + value);
            linksByGroup.set(group, linkMap);

            const nodeSet = nodesByGroup.get(group) ?? new Set<string>();
            nodeSet.add(source);
            nodeSet.add(target);
            nodesByGroup.set(group, nodeSet);

            maxValue = Math.max(maxValue, value);
        }

        const groups = Array.from(linksByGroup.keys());
        const linkOut = new Map<string, ISankeyLink[]>();
        const nodeOut = new Map<string, ISankeyNode[]>();
        const dataPoints: DataPoint[] = [];

        groups.forEach((group) => {
            const linkMap = linksByGroup.get(group)!;
            const links: ISankeyLink[] = [];
            for (const [key, value] of linkMap.entries()) {
                const sep = key.indexOf("\u001f");
                const source = key.slice(0, sep);
                const target = key.slice(sep + 1);
                links.push({ source, target, value, group });
                dataPoints.push({ xValue: source, yValue: target, value, groupValue: group, index: dataPoints.length });
            }
            linkOut.set(group, links);
            nodeOut.set(group, Array.from(nodesByGroup.get(group) ?? new Set<string>()).map((id) => ({ id })));
        });

        return {
            dataPoints,
            xValues: Array.from(new Set(dataPoints.map((d) => d.xValue))),
            yValues: Array.from(new Set(dataPoints.map((d) => d.yValue))),
            groups,
            maxValue,
            minValue: 0,
            nodesByGroup: nodeOut,
            linksByGroup: linkOut,
            valueFormatString: (valueCol.source as any)?.format as string | undefined
        };
    }
}
