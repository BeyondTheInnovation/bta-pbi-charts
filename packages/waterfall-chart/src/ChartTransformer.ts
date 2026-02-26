"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { ChartData, DataPoint, formatGroupValue } from "@pbi-visuals/shared";

export interface IWaterfallSegmentValue {
    name: string;
    value: number;
}

export interface IWaterfallStep {
    step: string;
    header: string;
    group: string;
    type: string;
    isTotal: boolean;
    start: number;
    end: number;
    total: number;
    contributionPct: number;
    explicitPct: number | null;
    segments: IWaterfallSegmentValue[];
}

export interface IChartData extends ChartData {
    steps: IWaterfallStep[];
    segmentKeys: string[];
    groups: string[];
    valueFormatString?: string;
    valueDisplayName?: string;
    percentageFormatString?: string;
    percentageDisplayName?: string;
}

interface IInputRow {
    index: number;
    step: string;
    header: string;
    segment: string;
    type: string;
    group: string;
    value: number;
    explicitPct: number | null;
}

interface IGroupedStep {
    step: string;
    header: string;
    order: number;
    segments: Map<string, number>;
    typeVotes: Map<string, number>;
    headerVotes: Map<string, number>;
    explicitPctSum: number;
    explicitPctCount: number;
}

function normalizeType(raw: unknown): string {
    return String(raw ?? "").trim().toLowerCase();
}

function isTotalStep(stepName: string, type: string): boolean {
    const normalizedName = String(stepName || "").trim().toLowerCase();
    if (["total", "subtotal", "absolute", "balance", "grand", "grand total"].includes(type)) return true;
    if (normalizedName === "total" || normalizedName === "subtotal" || normalizedName === "grand total") return true;
    if (normalizedName.includes("grand total")) return true;
    return false;
}

function normalizeExplicitPercentage(rawValue: number, formatString?: string): number {
    const hasPercentFormat = typeof formatString === "string" && formatString.includes("%");
    if (hasPercentFormat) return rawValue * 100;
    if (Math.abs(rawValue) <= 1) return rawValue * 100;
    return rawValue;
}

function getDominantVote(votes: Map<string, number>, fallback: string): string {
    return Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
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
            steps: [],
            segmentKeys: []
        };

        const rows: IInputRow[] = [];
        const segmentKeys: string[] = [];
        const seenSegmentKeys = new Set<string>();
        let valueFormatString: string | undefined;
        let valueDisplayName: string | undefined;
        let percentageFormatString: string | undefined;
        let percentageDisplayName: string | undefined;

        const pushRow = (
            index: number,
            stepRaw: unknown,
            segmentRaw: unknown,
            typeRaw: unknown,
            headerRaw: unknown,
            groupRaw: unknown,
            valueRaw: unknown,
            percentageRaw: unknown
        ): void => {
            const value = Number(valueRaw);
            if (!Number.isFinite(value)) return;

            const step = String(stepRaw ?? ("Step " + (index + 1)));
            const headerText = String(headerRaw ?? "").trim();
            const segment = String(segmentRaw ?? "Value");
            const type = normalizeType(typeRaw);
            const group = groupRaw !== undefined && groupRaw !== null ? formatGroupValue(groupRaw) : "All";
            const explicitPctRaw = Number(percentageRaw);
            const explicitPct = Number.isFinite(explicitPctRaw)
                ? normalizeExplicitPercentage(explicitPctRaw, percentageFormatString)
                : null;

            if (!seenSegmentKeys.has(segment)) {
                seenSegmentKeys.add(segment);
                segmentKeys.push(segment);
            }

            rows.push({
                index,
                step,
                header: headerText || step,
                segment,
                type,
                group,
                value,
                explicitPct
            });
        };

        const table = dataView.table;
        if (table?.rows?.length && table.columns?.length) {
            const cols = table.columns;
            const stepIdx = cols.findIndex((c) => c.roles?.["step"]);
            const segmentIdx = cols.findIndex((c) => c.roles?.["segment"]);
            const typeIdx = cols.findIndex((c) => c.roles?.["type"]);
            const headerIdx = cols.findIndex((c) => c.roles?.["header"]);
            const groupIdx = cols.findIndex((c) => c.roles?.["group"]);
            const valueIdx = cols.findIndex((c) => c.roles?.["values"]);
            const percentageIdx = cols.findIndex((c) => c.roles?.["percentage"]);
            const resolvedStepIdx = stepIdx >= 0 ? stepIdx : 0;

            if (resolvedStepIdx >= 0 && valueIdx >= 0) {
                valueFormatString = (cols[valueIdx] as any)?.format as string | undefined;
                valueDisplayName = (cols[valueIdx] as any)?.displayName as string | undefined;
                if (percentageIdx >= 0) {
                    percentageFormatString = (cols[percentageIdx] as any)?.format as string | undefined;
                    percentageDisplayName = (cols[percentageIdx] as any)?.displayName as string | undefined;
                }

                table.rows.forEach((row, i) => {
                    pushRow(
                        i,
                        row[resolvedStepIdx],
                        segmentIdx >= 0 ? row[segmentIdx] : undefined,
                        typeIdx >= 0 ? row[typeIdx] : undefined,
                        headerIdx >= 0 ? row[headerIdx] : undefined,
                        groupIdx >= 0 ? row[groupIdx] : undefined,
                        row[valueIdx],
                        percentageIdx >= 0 ? row[percentageIdx] : undefined
                    );
                });
            }
        }

        const categorical = dataView.categorical;
        if (categorical) {
            const stepCol = categorical.categories?.find((c) => c.source.roles?.["step"]) ?? categorical.categories?.[0];
            const segmentCol = categorical.categories?.find((c) => c.source.roles?.["segment"]);
            const typeCol = categorical.categories?.find((c) => c.source.roles?.["type"]);
            const headerCol = categorical.categories?.find((c) => c.source.roles?.["header"]);
            const groupCol = categorical.categories?.find((c) => c.source.roles?.["group"]);
            const valueCol = categorical.values?.find((v) => v.source.roles?.["values"]);
            const percentageCol = categorical.values?.find((v) => v.source.roles?.["percentage"]);
            const valueValues = valueCol?.values as any[] | undefined;
            const percentageValues = percentageCol?.values as any[] | undefined;

            if (valueValues?.length) {
                valueFormatString = (valueCol?.source as any)?.format as string | undefined;
                valueDisplayName = (valueCol?.source as any)?.displayName as string | undefined;
                if (percentageCol) {
                    percentageFormatString = (percentageCol?.source as any)?.format as string | undefined;
                    percentageDisplayName = (percentageCol?.source as any)?.displayName as string | undefined;
                }

                for (let i = 0; i < valueValues.length; i++) {
                    pushRow(
                        i,
                        stepCol ? stepCol.values[i] : undefined,
                        segmentCol ? segmentCol.values[i] : undefined,
                        typeCol ? typeCol.values[i] : undefined,
                        headerCol ? headerCol.values[i] : undefined,
                        groupCol ? groupCol.values[i] : undefined,
                        valueValues[i],
                        percentageValues ? percentageValues[i] : undefined
                    );
                }
            }
        }

        if (!rows.length) return empty;

        const grouped = new Map<string, Map<string, IGroupedStep>>();

        rows.forEach((r) => {
            if (!grouped.has(r.group)) grouped.set(r.group, new Map());
            const steps = grouped.get(r.group)!;
            const stepKey = `${r.header}\u001f${r.step}`;
            if (!steps.has(stepKey)) {
                steps.set(stepKey, {
                    step: r.step,
                    header: r.header,
                    order: r.index,
                    segments: new Map(),
                    typeVotes: new Map(),
                    headerVotes: new Map(),
                    explicitPctSum: 0,
                    explicitPctCount: 0
                });
            }

            const entry = steps.get(stepKey)!;
            entry.order = Math.min(entry.order, r.index);
            entry.segments.set(r.segment, (entry.segments.get(r.segment) ?? 0) + r.value);
            entry.headerVotes.set(r.header, (entry.headerVotes.get(r.header) ?? 0) + 1);
            if (r.type) {
                entry.typeVotes.set(r.type, (entry.typeVotes.get(r.type) ?? 0) + 1);
            }
            if (r.explicitPct !== null) {
                entry.explicitPctSum += r.explicitPct;
                entry.explicitPctCount += 1;
            }
        });

        const chartSteps: IWaterfallStep[] = [];
        const chartDataPoints: DataPoint[] = [];
        const groups = Array.from(grouped.keys());

        let globalMin = 0;
        let globalMax = 0;

        groups.forEach((group) => {
            const stepsMap = grouped.get(group)!;
            const orderedSteps = Array.from(stepsMap.entries()).sort((a, b) => a[1].order - b[1].order);

            let running = 0;
            const stepsForGroup: IWaterfallStep[] = [];

            orderedSteps.forEach(([, entry]) => {
                const segments = Array.from(entry.segments.entries())
                    .map(([name, value]) => ({ name, value }))
                    .filter((s) => Number.isFinite(s.value));

                const total = segments.reduce((sum, s) => sum + s.value, 0);
                const dominantType = getDominantVote(entry.typeVotes, "");
                const step = entry.step;
                const header = getDominantVote(entry.headerVotes, entry.header || step);
                const isTotal = isTotalStep(step, dominantType);
                const explicitPct = entry.explicitPctCount > 0
                    ? entry.explicitPctSum / entry.explicitPctCount
                    : null;

                const start = isTotal ? 0 : running;
                const end = isTotal ? total : running + total;
                running = end;

                const stepRecord: IWaterfallStep = {
                    step,
                    header,
                    group,
                    type: dominantType,
                    isTotal,
                    start,
                    end,
                    total,
                    contributionPct: 0,
                    explicitPct,
                    segments
                };

                stepsForGroup.push(stepRecord);

                globalMin = Math.min(globalMin, start, end);
                globalMax = Math.max(globalMax, start, end);
            });

            const lastStep = stepsForGroup[stepsForGroup.length - 1];
            if (lastStep) {
                lastStep.header = "Total";
                const hasEarlierTotalStep = stepsForGroup
                    .slice(0, -1)
                    .some((s) => s.step.trim().toLowerCase() === "total");
                if (!hasEarlierTotalStep) {
                    lastStep.step = "Total";
                }
                if (!lastStep.type) {
                    lastStep.type = "total";
                }
            }

            const preferredBase = stepsForGroup.slice().reverse().find((s) => s.isTotal)?.end ?? stepsForGroup[stepsForGroup.length - 1]?.end ?? 0;
            const baseAbs = Math.abs(preferredBase);
            stepsForGroup.forEach((step, i) => {
                chartDataPoints.push({
                    xValue: step.step,
                    yValue: group,
                    value: step.total,
                    groupValue: group,
                    index: i
                });
                step.contributionPct = baseAbs > 0 ? (step.total / baseAbs) * 100 : 0;
                chartSteps.push(step);
            });
        });

        return {
            dataPoints: chartDataPoints,
            xValues: Array.from(new Set(chartSteps.map((s) => s.step))),
            yValues: groups,
            groups,
            maxValue: globalMax,
            minValue: globalMin,
            steps: chartSteps,
            segmentKeys,
            valueFormatString,
            valueDisplayName,
            percentageFormatString,
            percentageDisplayName
        };
    }
}
