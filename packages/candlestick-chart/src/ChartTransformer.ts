"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface ICandle {
    x: string;
    group: string;
    open: number;
    high: number;
    low: number;
    close: number;
    index: number;
}

export interface IChartData extends ChartData {
    candles: ICandle[];
    valueFormatString?: string;
    xIsDate: boolean;
}

function formatDateLabel(raw: unknown): string {
    if (raw === null || raw === undefined) return "";
    if (raw instanceof Date && !isNaN(raw.getTime())) {
        return raw.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    const s = String(raw);
    const d = new Date(s);
    if (!isNaN(d.getTime()) && /\d{4}/.test(s)) {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return s;
}

export class ChartTransformer {
    public static transform(dataView: DataView): IChartData {
        const empty: IChartData = {
            dataPoints: [],
            xValues: [],
            yValues: [],
            groups: [],
            maxValue: 0,
            minValue: 0,
            candles: [],
            xIsDate: false
        };

        interface CandleAccumulator {
            x: string;
            group: string;
            open: number;
            high: number;
            low: number;
            close: number;
            index: number;
            lastIndex: number;
        }

        const byKey = new Map<string, CandleAccumulator>();
        let valueFormatString: string | undefined;
        let xIsDate = false;

        const addRow = (
            xRaw: unknown,
            groupRaw: unknown,
            openRaw: unknown,
            highRaw: unknown,
            lowRaw: unknown,
            closeRaw: unknown,
            rowIndex: number
        ): void => {
            const open = Number(openRaw);
            const high = Number(highRaw);
            const low = Number(lowRaw);
            const close = Number(closeRaw);
            if (![open, high, low, close].every((n) => Number.isFinite(n))) return;

            const xLabel = formatDateLabel(xRaw);
            const x = xLabel || ("Point " + (rowIndex + 1));
            if (!xIsDate && xRaw instanceof Date) xIsDate = true;
            if (!xIsDate && typeof xRaw === "string" && /\d{4}/.test(xRaw) && !isNaN(new Date(xRaw).getTime())) xIsDate = true;
            const group = groupRaw !== undefined && groupRaw !== null ? formatGroupValue(groupRaw) : "All";
            const resolvedHigh = Math.max(high, open, close);
            const resolvedLow = Math.min(low, open, close);
            const key = group + "\u001f" + x;

            const existing = byKey.get(key);
            if (!existing) {
                byKey.set(key, {
                    x,
                    group,
                    open,
                    high: resolvedHigh,
                    low: resolvedLow,
                    close,
                    index: rowIndex,
                    lastIndex: rowIndex
                });
                return;
            }

            existing.high = Math.max(existing.high, resolvedHigh);
            existing.low = Math.min(existing.low, resolvedLow);
            if (rowIndex <= existing.index) {
                existing.open = open;
                existing.index = rowIndex;
            }
            if (rowIndex >= existing.lastIndex) {
                existing.close = close;
                existing.lastIndex = rowIndex;
            }
        };

        const categorical = dataView.categorical;
        if (categorical?.categories?.length && categorical.values?.length) {
            const xCol = categorical.categories.find((c) => c.source.roles?.["xAxis"]) ?? categorical.categories[0];
            const groupCol = categorical.categories.find((c) => c.source.roles?.["group"]);
            const openCol = categorical.values.find((v) => v.source.roles?.["open"]);
            const highCol = categorical.values.find((v) => v.source.roles?.["high"]);
            const lowCol = categorical.values.find((v) => v.source.roles?.["low"]);
            const closeCol = categorical.values.find((v) => v.source.roles?.["close"]);

            if (xCol && openCol && highCol && lowCol && closeCol) {
                valueFormatString = (closeCol.source as any)?.format as string | undefined;
                const rowCount = Math.max(
                    xCol.values.length,
                    openCol.values.length,
                    highCol.values.length,
                    lowCol.values.length,
                    closeCol.values.length
                );

                for (let i = 0; i < rowCount; i++) {
                    addRow(
                        xCol.values[i],
                        groupCol ? groupCol.values[i] : undefined,
                        openCol.values[i],
                        highCol.values[i],
                        lowCol.values[i],
                        closeCol.values[i],
                        i
                    );
                }
            }
        }

        const table = dataView.table;
        if (!byKey.size && table?.rows?.length && table.columns?.length) {
            const columns = table.columns;
            const xIdx = columns.findIndex((c) => c.roles?.["xAxis"]);
            const groupIdx = columns.findIndex((c) => c.roles?.["group"]);
            const openIdx = columns.findIndex((c) => c.roles?.["open"]);
            const highIdx = columns.findIndex((c) => c.roles?.["high"]);
            const lowIdx = columns.findIndex((c) => c.roles?.["low"]);
            const closeIdx = columns.findIndex((c) => c.roles?.["close"]);

            if (xIdx >= 0 && openIdx >= 0 && highIdx >= 0 && lowIdx >= 0 && closeIdx >= 0) {
                valueFormatString = (columns[closeIdx] as any)?.format as string | undefined;
                table.rows.forEach((row, rowIndex) => {
                    addRow(
                        row[xIdx],
                        groupIdx >= 0 ? row[groupIdx] : undefined,
                        row[openIdx],
                        row[highIdx],
                        row[lowIdx],
                        row[closeIdx],
                        rowIndex
                    );
                });
            }
        }

        if (!byKey.size) {
            return empty;
        }

        const sortedCandles = Array.from(byKey.values()).sort((a, b) => a.index - b.index);
        const candles: ICandle[] = [];
        const dataPoints: DataPoint[] = [];
        const xValues: string[] = [];
        const xSet = new Set<string>();
        const groupsSet = new Set<string>();
        let maxValue = Number.NEGATIVE_INFINITY;
        let minValue = Number.POSITIVE_INFINITY;

        sortedCandles.forEach((item, index) => {
            const candle: ICandle = {
                x: item.x,
                group: item.group,
                open: item.open,
                high: item.high,
                low: item.low,
                close: item.close,
                index
            };

            candles.push(candle);
            dataPoints.push({
                xValue: candle.x,
                yValue: candle.group,
                value: candle.close,
                groupValue: candle.group,
                index
            });

            groupsSet.add(candle.group);
            if (!xSet.has(candle.x)) {
                xSet.add(candle.x);
                xValues.push(candle.x);
            }

            maxValue = Math.max(maxValue, candle.high);
            minValue = Math.min(minValue, candle.low);
        });

        if (!Number.isFinite(maxValue)) maxValue = 0;
        if (!Number.isFinite(minValue)) minValue = 0;

        return {
            dataPoints,
            xValues,
            yValues: Array.from(groupsSet),
            groups: Array.from(groupsSet),
            maxValue,
            minValue,
            candles,
            valueFormatString,
            xIsDate
        };
    }
}
