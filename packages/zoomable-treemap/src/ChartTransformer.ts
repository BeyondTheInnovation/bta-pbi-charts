"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface ITreeNode {
    name: string;
    value?: number;
    children?: ITreeNode[];
}

export interface IChartData extends ChartData {
    treeByGroup: Map<string, ITreeNode>;
    valueFormatString?: string;
}

function splitPath(raw: string): string[] {
    return raw
        .split(/>|\/|\|/g)
        .map((p) => p.trim())
        .filter(Boolean);
}

function addPath(root: ITreeNode, path: string[], value: number): void {
    let node = root;
    path.forEach((segment, idx) => {
        node.children = node.children ?? [];
        let next = node.children.find((c) => c.name === segment);
        if (!next) {
            next = { name: segment };
            node.children.push(next);
        }
        node = next;
        if (idx === path.length - 1) {
            node.value = (node.value ?? 0) + value;
        }
    });
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
            treeByGroup: new Map()
        };

        if (!categorical?.categories?.length || !categorical.values?.length) return empty;

        const pathCol = categorical.categories.find((c) => c.source.roles?.["category"]) ?? categorical.categories[0];
        const groupCol = categorical.categories.find((c) => c.source.roles?.["group"]);
        const valueCol = categorical.values.find((v) => v.source.roles?.["values"]) ?? categorical.values[0];

        if (!pathCol || !valueCol) return empty;

        const treeByGroup = new Map<string, ITreeNode>();
        const dataPoints: DataPoint[] = [];
        const groupsSet = new Set<string>();
        const leaves = new Set<string>();

        let maxValue = Number.NEGATIVE_INFINITY;

        for (let i = 0; i < valueCol.values.length; i++) {
            const value = Number(valueCol.values[i]);
            if (!Number.isFinite(value)) continue;
            const pathRaw = String(pathCol.values[i] ?? "(Blank)");
            const path = splitPath(pathRaw);
            if (!path.length) continue;

            const group = groupCol ? formatGroupValue(groupCol.values[i]) : "All";
            groupsSet.add(group);
            leaves.add(path[path.length - 1]);

            const root = treeByGroup.get(group) ?? { name: "root", children: [] };
            addPath(root, path, value);
            treeByGroup.set(group, root);

            dataPoints.push({
                xValue: path[path.length - 1],
                yValue: group,
                value,
                groupValue: group,
                index: i
            });
            maxValue = Math.max(maxValue, value);
        }

        if (!Number.isFinite(maxValue)) maxValue = 0;

        return {
            dataPoints,
            xValues: Array.from(leaves),
            yValues: Array.from(groupsSet),
            groups: Array.from(groupsSet),
            maxValue,
            minValue: 0,
            treeByGroup,
            valueFormatString: (valueCol.source as any)?.format as string | undefined
        };
    }
}
