"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import DataViewMatrix = powerbi.DataViewMatrix;
import DataViewMatrixNode = powerbi.DataViewMatrixNode;
import DataViewHierarchyLevel = powerbi.DataViewHierarchyLevel;
import DataViewMatrixGroupValue = powerbi.DataViewMatrixGroupValue;

import { ChartData, DataPoint, formatDataValue, formatGroupValue } from "@pbi-visuals/shared";
import { IHeatmapVisualSettings } from "./settings";

export interface AxisSpan {
    level: number;
    startLeafIndex: number; // inclusive
    endLeafIndex: number; // inclusive
    label: string;
    key: string; // prefix key
}

export interface AxisHierarchy {
    depth: number;
    leafKeys: string[];
    leafPaths: string[][];
    spansByLevel: AxisSpan[][];
    keyToPath: Map<string, string[]>;
}

export interface HeatmapMatrixData extends ChartData {
    xAxis: AxisHierarchy;
    yAxisByGroup: Map<string, AxisHierarchy>;
    totalsByGroup: Map<string, HeatmapGroupTotals>;
    overallGrandTotal: number;
    totalRowKey: string;
    totalColumnKey: string;
}

const KEY_SEP = "\u001f";
const TOTAL_ROW_KEY = "__bta_total_row__";
const TOTAL_COL_KEY = "__bta_total_col__";
const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

function parseMonthYearKey(s: string): number | null {
    const str = (s ?? "").trim();
    if (!str) return null;

    // "MMM YYYY" / "MMM-YYYY" / "MMM YY" / "MMM-YY"
    const m = str.match(/^([A-Za-z]{3})[-\s](\d{2}|\d{4})$/);
    if (m) {
        const month = MONTHS[m[1].toLowerCase()];
        if (!month) return null;
        const yearRaw = Number(m[2]);
        if (!Number.isFinite(yearRaw)) return null;
        const year = m[2].length === 2
            ? (yearRaw <= 79 ? 2000 + yearRaw : 1900 + yearRaw)
            : yearRaw;
        return year * 100 + month;
    }

    // "YYYY-MM"
    const ym = str.match(/^(\d{4})-(\d{2})$/);
    if (ym) {
        const year = Number(ym[1]);
        const month = Number(ym[2]);
        if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
        return year * 100 + month;
    }

    return null;
}

export interface HeatmapGroupTotals {
    rowTotalsByX: Map<string, number>;
    colTotalsByY: Map<string, number>;
    grandTotal: number;
}

type SortValue = number | string;

function normalizeSortValue(value: any, labelFallback: string): SortValue {
    if (value instanceof Date) {
        return value.getTime();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = parseMonthYearKey(value);
        if (parsed !== null) return parsed;
        return value.toLowerCase();
    }
    if (typeof value === "boolean") {
        return value ? 1 : 0;
    }
    const asLabel = (labelFallback ?? "").toString();
    const parsed = parseMonthYearKey(asLabel);
    if (parsed !== null) return parsed;
    return asLabel.toLowerCase();
}

function nodeIsLeaf(node: DataViewMatrixNode): boolean {
    return !node.children || node.children.length === 0;
}

function isSubtotalNode(node: DataViewMatrixNode): boolean {
    return Boolean(node.isSubtotal);
}

function valueToLabel(value: any, fallbackIndex: number): string {
    return formatDataValue(value, fallbackIndex);
}

function getNodeRoleParts(
    node: DataViewMatrixNode,
    levels: DataViewHierarchyLevel[],
    fallbackIndex: number
): { yAxisParts: string[]; xAxisParts: string[]; groupParts: string[] } {
    const yAxisParts: string[] = [];
    const xAxisParts: string[] = [];
    const groupParts: string[] = [];

    if (node.level === undefined || node.level === null) {
        return { yAxisParts, xAxisParts, groupParts };
    }

    const level = levels[node.level];
    const levelValues = (node.levelValues ?? []) as DataViewMatrixGroupValue[];

    for (const lv of levelValues) {
        const source = level?.sources?.[lv.levelSourceIndex];
        const roles = source?.roles ?? {};
        const label = roles["group"]
            ? formatGroupValue(lv.value)
            : valueToLabel(lv.value, fallbackIndex);

        if (roles["yAxis"]) yAxisParts.push(label);
        if (roles["xAxis"]) xAxisParts.push(label);
        if (roles["group"]) groupParts.push(label);
    }

    return { yAxisParts, xAxisParts, groupParts };
}

function traverseMatrix(
    node: DataViewMatrixNode,
    visit: (n: DataViewMatrixNode, path: DataViewMatrixNode[]) => void,
    path: DataViewMatrixNode[] = []
): void {
    if (isSubtotalNode(node)) {
        return;
    }
    const nextPath = node.level !== undefined ? [...path, node] : path;
    visit(node, nextPath);

    if (!node.children) return;
    for (const child of node.children) {
        traverseMatrix(child, visit, nextPath);
    }
}

function buildAxisHierarchyFromLeafPaths(leafKeys: string[], leafPaths: string[][]): AxisHierarchy {
    const depth = leafPaths.reduce((m, p) => Math.max(m, p.length), 0);
    const keyToPath = new Map<string, string[]>();
    leafKeys.forEach((k, i) => keyToPath.set(k, leafPaths[i] ?? []));

    const spansByLevel: AxisSpan[][] = [];
    for (let level = 0; level < depth; level++) {
        const spans: AxisSpan[] = [];
        let i = 0;
        while (i < leafPaths.length) {
            const prefixParts = (leafPaths[i] ?? []).slice(0, level + 1);
            const prefixKey = prefixParts.join(KEY_SEP);
            const label = prefixParts[level] ?? "";

            let j = i + 1;
            while (j < leafPaths.length) {
                const nextPrefix = (leafPaths[j] ?? []).slice(0, level + 1).join(KEY_SEP);
                if (nextPrefix !== prefixKey) break;
                j++;
            }

            spans.push({
                level,
                startLeafIndex: i,
                endLeafIndex: j - 1,
                label,
                key: prefixKey
            });
            i = j;
        }
        spansByLevel.push(spans);
    }

    return { depth, leafKeys, leafPaths, spansByLevel, keyToPath };
}

export class HeatmapTransformer {
    public static transform(dataView: DataView, settings?: IHeatmapVisualSettings): HeatmapMatrixData {
        if (dataView.matrix) {
            return HeatmapTransformer.transformMatrix(dataView.matrix, settings);
        }

        // Backward-compat fallback: empty chart data (capabilities now use matrix).
        return {
            dataPoints: [],
            xValues: [],
            yValues: [],
            groups: [],
            maxValue: 0,
            minValue: 0,
            xAxis: buildAxisHierarchyFromLeafPaths([], []),
            yAxisByGroup: new Map(),
            totalsByGroup: new Map(),
            overallGrandTotal: 0,
            totalRowKey: TOTAL_ROW_KEY,
            totalColumnKey: TOTAL_COL_KEY
        };
    }

    private static transformMatrix(matrix: DataViewMatrix, settings?: IHeatmapVisualSettings): HeatmapMatrixData {
        const dataPoints: DataPoint[] = [];
        let maxValue = 0;
        let minValue = Infinity;

        const measureCount = Math.max(1, matrix.valueSources?.length ?? 1);
        const valueFormatString = (matrix.valueSources?.[0] as any)?.format as string | undefined;
        const valueDisplayName = (matrix.valueSources?.[0] as any)?.displayName as string | undefined;

        // ---- Columns (X axis) ----
        const xLeafKeys: string[] = [];
        const xLeafPaths: string[][] = [];
        const xLeafSort: SortValue[][] = [];

        let colLeafIndex = 0;
        const columnLeafKeyByIndex: string[] = [];

        const xLevelSortDirections = matrix.columns.levels.map(level => {
            const src = (level.sources ?? []).find(s => Boolean(s.roles?.["xAxis"])) ?? level.sources?.[0];
            return src?.sort;
        });

        traverseMatrix(matrix.columns.root, (n, path) => {
            if (!nodeIsLeaf(n) || n.level === undefined) {
                return;
            }
            const xParts: string[] = [];
            const sortParts: SortValue[] = [];
            path.forEach((p) => {
                const parts = getNodeRoleParts(p, matrix.columns.levels, colLeafIndex);
                // Each node can hold composite values; join to a single label per level.
                const raw = (p.levelValues?.[0] as any)?.value;
                const label = parts.xAxisParts.length ? parts.xAxisParts.join(" • ") : valueToLabel(raw, colLeafIndex);
                xParts.push(label);
                sortParts.push(normalizeSortValue(raw, label));
            });

            const key = xParts.join(KEY_SEP) || `col${colLeafIndex}`;
            xLeafKeys.push(key);
            xLeafPaths.push(xParts);
            xLeafSort.push(sortParts);
            columnLeafKeyByIndex[colLeafIndex] = key;
            colLeafIndex++;
        });

        // If the X values look like dates/numbers, sort them chronologically/numerically
        // instead of the default text ordering that can happen for formatted date labels.
        const leaves = xLeafKeys.map((key, i) => ({
            key,
            path: xLeafPaths[i] ?? [],
            sort: xLeafSort[i] ?? [],
            originalIndex: i
        }));

        const anySortableNumber = leaves.length > 0 && leaves.every(l => typeof (l.sort[l.sort.length - 1]) === "number");

        if (anySortableNumber) {
            leaves.sort((a, b) => {
                const depth = Math.max(a.sort.length, b.sort.length);
                for (let i = 0; i < depth; i++) {
                    const av = a.sort[i];
                    const bv = b.sort[i];
                    if (av === undefined && bv === undefined) continue;
                    if (av === undefined) return -1;
                    if (bv === undefined) return 1;

                    let cmp = 0;
                    if (typeof av === "number" && typeof bv === "number") {
                        cmp = av - bv;
                    } else {
                        cmp = String(av).localeCompare(String(bv));
                    }

                    const dir = xLevelSortDirections[i];
                    if (dir === powerbi.SortDirection.Descending) {
                        cmp = -cmp;
                    }
                    if (cmp !== 0) return cmp;
                }
                return a.originalIndex - b.originalIndex;
            });

            xLeafKeys.length = 0;
            xLeafPaths.length = 0;
            xLeafSort.length = 0;
            for (const l of leaves) {
                xLeafKeys.push(l.key);
                xLeafPaths.push(l.path);
                xLeafSort.push(l.sort);
            }
        }

        let xAxis = buildAxisHierarchyFromLeafPaths(xLeafKeys, xLeafPaths);

        // ---- Rows (Y axis) ----
        const groupNamesSet = new Set<string>();
        let yAxisByGroup = new Map<string, AxisHierarchy>();

        let rowLeafGlobalCounter = 0;

        const rowsByGroup = new Map<string, { leafKeys: string[]; leafPaths: string[][]; leafNodes: DataViewMatrixNode[] }>();

        traverseMatrix(matrix.rows.root, (n, path) => {
            if (!nodeIsLeaf(n) || n.level === undefined) {
                return;
            }

            const yParts: string[] = [];
            let groupValue: string | null = null;

            // Build role-based parts across the path.
            path.forEach((p) => {
                const parts = getNodeRoleParts(p, matrix.rows.levels, rowLeafGlobalCounter);
                if (groupValue === null && parts.groupParts.length) {
                    groupValue = parts.groupParts.join(" • ");
                }
                // If this hierarchy node belongs to the Group role, it should *not* appear
                // as part of the Y-axis labels (otherwise the group value is duplicated
                // in the row headers while also being used as the panel title).
                if (parts.groupParts.length && !parts.yAxisParts.length) {
                    return;
                }
                if (parts.yAxisParts.length) {
                    yParts.push(parts.yAxisParts.join(" • "));
                    return;
                }

                // Fallback when roles aren't populated on sources (or when mapping doesn't include roles):
                const fallback = valueToLabel((p.levelValues?.[0] as any)?.value, rowLeafGlobalCounter);
                if (!fallback) return;

                yParts.push(fallback);
            });

            const yKey = yParts.join(KEY_SEP) || `row${rowLeafGlobalCounter}`;
            const groupKey = (groupValue ?? "").trim() ? groupValue! : "All";
            const bucket = rowsByGroup.get(groupKey) ?? { leafKeys: [], leafPaths: [], leafNodes: [] };
            bucket.leafKeys.push(yKey);
            bucket.leafPaths.push(yParts);
            bucket.leafNodes.push(n);
            rowsByGroup.set(groupKey, bucket);
            groupNamesSet.add(groupKey);

            rowLeafGlobalCounter++;
        });

        const groupNames = Array.from(groupNamesSet);
        if (groupNames.length === 0) {
            groupNames.push("All");
            rowsByGroup.set("All", { leafKeys: [], leafPaths: [], leafNodes: [] });
        }
        groupNames.sort((a, b) => a.localeCompare(b));

        // ---- Values ----
        let dataPointIndex = 0;
        for (const groupName of groupNames) {
            const bucket = rowsByGroup.get(groupName)!;
            const yAxis = buildAxisHierarchyFromLeafPaths(bucket.leafKeys, bucket.leafPaths);
            yAxisByGroup.set(groupName, yAxis);

            for (let r = 0; r < bucket.leafNodes.length; r++) {
                const rowNode = bucket.leafNodes[r];
                const rowKey = bucket.leafKeys[r];
                const valuesObj = rowNode.values ?? {};
                const valueKeys = Object.keys(valuesObj);

                for (const k of valueKeys) {
                    const idx = Number(k);
                    if (!Number.isFinite(idx)) continue;
                    const nodeValue = valuesObj[idx];
                    const valueSourceIndex = nodeValue?.valueSourceIndex ?? 0;
                    if (valueSourceIndex !== 0) continue;

                    const colIndex = Math.floor(idx / measureCount);
                    const colKey = columnLeafKeyByIndex[colIndex];
                    if (!colKey) continue;

                    const rawValue = nodeValue?.highlight !== undefined && nodeValue?.highlight !== null
                        ? nodeValue.highlight
                        : nodeValue?.value;
                    const value = Number(rawValue) || 0;
                    if (value > maxValue) maxValue = value;
                    if (value > 0 && value < minValue) minValue = value;

                    dataPoints.push({
                        xValue: colKey,
                        yValue: rowKey,
                        value,
                        groupValue: groupName,
                        index: dataPointIndex++
                    });
                }
            }
        }

        if (minValue === Infinity) minValue = 0;

        // ---- Totals ----
        const totalsByGroup = new Map<string, HeatmapGroupTotals>();
        let overallGrandTotal = 0;
        for (const dp of dataPoints) {
            overallGrandTotal += dp.value;
            const groupKey = (dp.groupValue ?? "").trim() ? dp.groupValue : "All";

            let t = totalsByGroup.get(groupKey);
            if (!t) {
                t = {
                    rowTotalsByX: new Map(),
                    colTotalsByY: new Map(),
                    grandTotal: 0
                };
                totalsByGroup.set(groupKey, t);
            }

            t.grandTotal += dp.value;
            t.rowTotalsByX.set(dp.xValue, (t.rowTotalsByX.get(dp.xValue) ?? 0) + dp.value);
            t.colTotalsByY.set(dp.yValue, (t.colTotalsByY.get(dp.yValue) ?? 0) + dp.value);
        }
        for (const groupName of groupNames) {
            if (!totalsByGroup.has(groupName)) {
                totalsByGroup.set(groupName, {
                    rowTotalsByX: new Map(),
                    colTotalsByY: new Map(),
                    grandTotal: 0
                });
            }
        }

        const showRowTotals = Boolean(settings?.heatmap?.showRowTotals);
        const showColTotals = Boolean(settings?.heatmap?.showColumnTotals);
        const rowTotalsPosition = settings?.heatmap?.rowTotalsPosition ?? "top";
        const colTotalsPosition = settings?.heatmap?.columnTotalsPosition ?? "right";

        const makeTotalPath = (depth: number): string[] => {
            const d = Math.max(1, depth);
            const parts = new Array<string>(d).fill("");
            parts[d - 1] = "Total";
            return parts;
        };

        if (showColTotals) {
            const totalPath = makeTotalPath(xAxis.depth);
            const nextKeys = [...xAxis.leafKeys];
            const nextPaths = [...xAxis.leafPaths];
            const insertAt = colTotalsPosition === "left" ? 0 : nextKeys.length;
            nextKeys.splice(insertAt, 0, TOTAL_COL_KEY);
            nextPaths.splice(insertAt, 0, totalPath);
            xAxis = buildAxisHierarchyFromLeafPaths(nextKeys, nextPaths);
        }

        if (showRowTotals) {
            const nextByGroup = new Map<string, AxisHierarchy>();
            for (const groupName of groupNames) {
                const yAxis = yAxisByGroup.get(groupName) ?? buildAxisHierarchyFromLeafPaths([], []);
                const totalPath = makeTotalPath(yAxis.depth);
                const nextKeys = [...yAxis.leafKeys];
                const nextPaths = [...yAxis.leafPaths];
                const insertAt = rowTotalsPosition === "top" ? 0 : nextKeys.length;
                nextKeys.splice(insertAt, 0, TOTAL_ROW_KEY);
                nextPaths.splice(insertAt, 0, totalPath);
                nextByGroup.set(groupName, buildAxisHierarchyFromLeafPaths(nextKeys, nextPaths));
            }
            yAxisByGroup = nextByGroup;
        }

        // yValues is not used directly by the hierarchical renderer, but keep it reasonable.
        const yValuesAll = groupNames.flatMap(g => yAxisByGroup.get(g)?.leafKeys ?? []);

        return {
            dataPoints,
            xValues: xAxis.leafKeys,
            yValues: yValuesAll,
            groups: groupNames,
            maxValue,
            minValue,
            xAxis,
            yAxisByGroup,
            valueFormatString,
            valueDisplayName,
            totalsByGroup,
            overallGrandTotal,
            totalRowKey: TOTAL_ROW_KEY,
            totalColumnKey: TOTAL_COL_KEY
        };
    }
}
