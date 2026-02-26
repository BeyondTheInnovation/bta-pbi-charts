"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface IChordGroup {
    names: string[];
    matrix: number[][];
}

export interface IChartData extends ChartData {
    matricesByGroup: Map<string, IChordGroup>;
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
            matricesByGroup: new Map()
        };

        if (!categorical?.categories?.length || !categorical.values?.length) return empty;

        const sourceCol = categorical.categories.find((c) => c.source.roles?.["source"]);
        const targetCol = categorical.categories.find((c) => c.source.roles?.["target"]);
        const groupCol = categorical.categories.find((c) => c.source.roles?.["group"]);
        const valueCol = categorical.values.find((v) => v.source.roles?.["values"]) ?? categorical.values[0];

        if (!sourceCol || !targetCol || !valueCol) return empty;

        const flowsByGroup = new Map<string, Map<string, number>>();
        const nodesByGroup = new Map<string, Set<string>>();
        const dataPoints: DataPoint[] = [];
        let maxValue = 0;

        for (let i = 0; i < valueCol.values.length; i++) {
            const source = String(sourceCol.values[i] ?? "(Blank)");
            const target = String(targetCol.values[i] ?? "(Blank)");
            const value = Number(valueCol.values[i]);
            if (!Number.isFinite(value)) continue;
            const group = groupCol ? formatGroupValue(groupCol.values[i]) : "All";

            const key = source + "\u001f" + target;
            const map = flowsByGroup.get(group) ?? new Map<string, number>();
            map.set(key, (map.get(key) ?? 0) + value);
            flowsByGroup.set(group, map);

            const set = nodesByGroup.get(group) ?? new Set<string>();
            set.add(source);
            set.add(target);
            nodesByGroup.set(group, set);

            dataPoints.push({ xValue: source, yValue: target, value, groupValue: group, index: i });
            maxValue = Math.max(maxValue, value);
        }

        const matricesByGroup = new Map<string, IChordGroup>();
        for (const [group, flowMap] of flowsByGroup.entries()) {
            const names = Array.from(nodesByGroup.get(group) ?? new Set<string>());
            const indexByName = new Map<string, number>();
            names.forEach((n, idx) => indexByName.set(n, idx));
            const matrix = names.map(() => names.map(() => 0));

            for (const [key, value] of flowMap.entries()) {
                const sep = key.indexOf("\u001f");
                const source = key.slice(0, sep);
                const target = key.slice(sep + 1);
                const i = indexByName.get(source);
                const j = indexByName.get(target);
                if (i === undefined || j === undefined) continue;
                matrix[i][j] += value;
                matrix[j][i] += value;
            }

            matricesByGroup.set(group, { names, matrix });
        }

        return {
            dataPoints,
            xValues: Array.from(new Set(dataPoints.map((d) => d.xValue))),
            yValues: Array.from(new Set(dataPoints.map((d) => d.yValue))),
            groups: Array.from(flowsByGroup.keys()),
            maxValue,
            minValue: 0,
            matricesByGroup,
            valueFormatString: (valueCol.source as any)?.format as string | undefined
        };
    }
}
