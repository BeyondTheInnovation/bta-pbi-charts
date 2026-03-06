"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import DataViewCategorical = powerbi.DataViewCategorical;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import DataViewValueColumn = powerbi.DataViewValueColumn;
import {
    ChartData,
    DataPoint,
    formatDataValue,
    formatGroupValue,
    formatMeasureValue,
    getCategoricalHighlightState
} from "@pbi-visuals/shared";

export type JourneyItemKind = "milestone" | "span";
export type JourneyLane = "top" | "bottom";
export type JourneyStatusKey = string;

export interface JourneyTooltipItem {
    displayName: string;
    value: string;
}

export interface JourneyItem extends DataPoint {
    selectionKey: string;
    sourceRowIndex: number;
    title: string;
    subtitle: string;
    group: string;
    statusKey: JourneyStatusKey;
    lane: JourneyLane;
    kind: JourneyItemKind;
    anchorDateMs: number;
    startDateMs: number | null;
    endDateMs: number | null;
    milestoneDateMs: number | null;
    sortOrder: number | null;
    isHighlighted: boolean;
    tooltipItems: JourneyTooltipItem[];
}

export interface JourneyChartData extends ChartData {
    items: JourneyItem[];
    statuses: string[];
    minDateMs: number;
    maxDateMs: number;
    hasIncomingHighlights: boolean;
    droppedRowCount: number;
}

interface RoleColumn {
    source: DataViewMetadataColumn;
    values: any[];
    categoryColumn?: DataViewCategoryColumn;
}

interface RowDraft {
    rowIndex: number;
    titleRaw: any;
    subtitleRaw: any;
    groupRaw: any;
    statusRaw: any;
    laneRaw: any;
    startRaw: any;
    endRaw: any;
    milestoneRaw: any;
    sortRaw: any;
    tooltipRows: JourneyTooltipItem[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeLane(value: any): JourneyLane | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "top" || normalized === "upper" || normalized === "up") return "top";
    if (normalized === "bottom" || normalized === "lower" || normalized === "down") return "bottom";
    return null;
}

function parseNumeric(value: any): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function parseUtcDateMs(value: any): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (value instanceof Date) {
        const t = value.getTime();
        return Number.isFinite(t) ? t : null;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        const abs = Math.abs(value);
        if (abs >= 1_000_000_000 && abs <= 99_999_999_999) {
            return Math.round(value * 1000);
        }
        if (abs >= 1_000_000_000_000 && abs <= 9_999_999_999_999) {
            return Math.round(value);
        }
        return null;
    }

    const text = String(value).trim();
    if (!text) return null;

    const parsed = Date.parse(text);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return Math.round(parsed);
}

function getRoleColumns(categorical: DataViewCategorical | undefined, roleName: string): RoleColumn[] {
    if (!categorical) return [];

    const matches: RoleColumn[] = [];

    (categorical.categories ?? []).forEach((column) => {
        if (column?.source?.roles?.[roleName]) {
            matches.push({
                source: column.source,
                values: (column.values as any[]) ?? [],
                categoryColumn: column
            });
        }
    });

    const valueColumns = ((categorical.values as unknown as DataViewValueColumn[] | undefined) ?? []);
    valueColumns.forEach((column) => {
        if (column?.source?.roles?.[roleName]) {
            matches.push({
                source: column.source,
                values: ((column as any).values as any[]) ?? []
            });
        }
    });

    return matches;
}

function getCategoryRoleColumns(categorical: DataViewCategorical | undefined, roleName: string): RoleColumn[] {
    if (!categorical) return [];

    const matches: RoleColumn[] = [];
    (categorical.categories ?? []).forEach((column) => {
        if (column?.source?.roles?.[roleName]) {
            matches.push({
                source: column.source,
                values: (column.values as any[]) ?? [],
                categoryColumn: column
            });
        }
    });

    return matches;
}

function firstRoleColumn(categorical: DataViewCategorical | undefined, roleName: string): RoleColumn | null {
    const columns = getRoleColumns(categorical, roleName);
    return columns.length > 0 ? columns[0] : null;
}

function getDeepestValue(columns: RoleColumn[], rowIndex: number): any {
    for (let i = columns.length - 1; i >= 0; i--) {
        const value = columns[i].values[rowIndex];
        if (value !== null && value !== undefined && String(value).trim() !== "") {
            return value;
        }
    }
    return columns.length > 0 ? columns[0].values[rowIndex] : null;
}

function formatTooltipValue(value: any, formatString?: string): string {
    if (value === null || value === undefined || value === "") return "(Blank)";
    if (typeof value === "number" && Number.isFinite(value)) {
        return formatMeasureValue(value, formatString);
    }
    if (value instanceof Date) {
        return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: "UTC"
        }).format(value);
    }
    return String(value);
}

function buildCategoricalRows(dataView: DataView): {
    rows: RowDraft[];
    titleCategoryColumn: DataViewCategoryColumn | null;
    hasIncomingHighlights: boolean;
    highlightedRows: Set<number>;
} {
    const categorical = dataView.categorical;
    if (!categorical) {
        return {
            rows: [],
            titleCategoryColumn: null,
            hasIncomingHighlights: false,
            highlightedRows: new Set<number>()
        };
    }

    const titleColumns = getCategoryRoleColumns(categorical, "title");
    if (!titleColumns.length) {
        return {
            rows: [],
            titleCategoryColumn: null,
            hasIncomingHighlights: false,
            highlightedRows: new Set<number>()
        };
    }

    const subtitleColumns = getCategoryRoleColumns(categorical, "subtitle");
    const groupColumns = getCategoryRoleColumns(categorical, "group");
    const statusColumns = getCategoryRoleColumns(categorical, "status");
    const laneColumns = getCategoryRoleColumns(categorical, "lane");
    const startDateColumns = getCategoryRoleColumns(categorical, "startDate");
    const endDateColumns = getRoleColumns(categorical, "endDate");
    const milestoneDateColumns = getCategoryRoleColumns(categorical, "milestoneDate");
    const sortOrder = firstRoleColumn(categorical, "sortOrder");
    const tooltipColumns = getRoleColumns(categorical, "tooltips");

    const rowCount = Math.max(
        ...titleColumns.map((column) => column.values.length),
        ...subtitleColumns.map((column) => column.values.length),
        ...groupColumns.map((column) => column.values.length),
        ...statusColumns.map((column) => column.values.length),
        ...laneColumns.map((column) => column.values.length),
        ...startDateColumns.map((column) => column.values.length),
        ...endDateColumns.map((column) => column.values.length),
        ...milestoneDateColumns.map((column) => column.values.length),
        sortOrder?.values.length ?? 0
    );

    const highlightState = getCategoricalHighlightState(categorical, {
        preferredRoles: ["sortOrder", "endDate", "startDate", "milestoneDate"]
    });

    const rows: RowDraft[] = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const tooltipRows: JourneyTooltipItem[] = tooltipColumns.map((column) => ({
            displayName: column.source.displayName || "Tooltip",
            value: formatTooltipValue(column.values[rowIndex], (column.source as any)?.format as string | undefined)
        }));

        rows.push({
            rowIndex,
            titleRaw: getDeepestValue(titleColumns, rowIndex),
            subtitleRaw: getDeepestValue(subtitleColumns, rowIndex),
            groupRaw: getDeepestValue(groupColumns, rowIndex),
            statusRaw: getDeepestValue(statusColumns, rowIndex),
            laneRaw: getDeepestValue(laneColumns, rowIndex),
            startRaw: getDeepestValue(startDateColumns, rowIndex),
            endRaw: getDeepestValue(endDateColumns, rowIndex),
            milestoneRaw: getDeepestValue(milestoneDateColumns, rowIndex),
            sortRaw: sortOrder?.values[rowIndex],
            tooltipRows
        });
    }

        return {
            rows,
            titleCategoryColumn: titleColumns[titleColumns.length - 1]?.categoryColumn ?? null,
            hasIncomingHighlights: highlightState.hasIncomingHighlights,
            highlightedRows: highlightState.highlightedRows
        };
}

function buildTableRows(dataView: DataView): RowDraft[] {
    const table = dataView.table;
    if (!table?.rows?.length || !table.columns?.length) {
        return [];
    }

    const findRoleIndex = (roleName: string): number => table.columns.findIndex((column) => column.roles?.[roleName]);

    const titleIdx = findRoleIndex("title");
    if (titleIdx < 0) {
        return [];
    }

    const subtitleIdx = findRoleIndex("subtitle");
    const groupIdx = findRoleIndex("group");
    const statusIdx = findRoleIndex("status");
    const laneIdx = findRoleIndex("lane");
    const startIdx = findRoleIndex("startDate");
    const endIdx = findRoleIndex("endDate");
    const milestoneIdx = findRoleIndex("milestoneDate");
    const sortIdx = findRoleIndex("sortOrder");
    const tooltipIndexes = table.columns
        .map((column, index) => ({ column, index }))
        .filter(({ column }) => column.roles?.["tooltips"])
        .map(({ index }) => index);

    return table.rows.map((row, rowIndex) => ({
        rowIndex,
        titleRaw: row[titleIdx],
        subtitleRaw: subtitleIdx >= 0 ? row[subtitleIdx] : null,
        groupRaw: groupIdx >= 0 ? row[groupIdx] : null,
        statusRaw: statusIdx >= 0 ? row[statusIdx] : null,
        laneRaw: laneIdx >= 0 ? row[laneIdx] : null,
        startRaw: startIdx >= 0 ? row[startIdx] : null,
        endRaw: endIdx >= 0 ? row[endIdx] : null,
        milestoneRaw: milestoneIdx >= 0 ? row[milestoneIdx] : null,
        sortRaw: sortIdx >= 0 ? row[sortIdx] : null,
        tooltipRows: tooltipIndexes.map((idx) => ({
            displayName: table.columns[idx].displayName || "Tooltip",
            value: formatTooltipValue(row[idx], (table.columns[idx] as any)?.format as string | undefined)
        }))
    }));
}

export class StrategicJourneyTransformer {
    public static transform(dataView: DataView): JourneyChartData {
        const empty: JourneyChartData = {
            dataPoints: [],
            xValues: [],
            yValues: [],
            groups: [],
            maxValue: 0,
            minValue: 0,
            items: [],
            statuses: [],
            minDateMs: 0,
            maxDateMs: 0,
            hasIncomingHighlights: false,
            droppedRowCount: 0
        };

        if (!dataView) {
            return empty;
        }

        const categoricalResult = buildCategoricalRows(dataView);
        const tableRows = buildTableRows(dataView);

        const sourceRows = categoricalResult.rows.length > 0 ? categoricalResult.rows : tableRows;
        if (!sourceRows.length) {
            return empty;
        }

        const items: JourneyItem[] = [];
        let droppedRowCount = 0;

        sourceRows.forEach((rowDraft) => {
            const title = formatDataValue(rowDraft.titleRaw, rowDraft.rowIndex + 1).trim();
            if (!title) {
                droppedRowCount++;
                return;
            }

            let startDateMs = parseUtcDateMs(rowDraft.startRaw);
            let endDateMs = parseUtcDateMs(rowDraft.endRaw);
            const milestoneDateMs = parseUtcDateMs(rowDraft.milestoneRaw);

            let kind: JourneyItemKind | null = null;
            let anchorDateMs: number | null = null;

            if (startDateMs !== null && endDateMs !== null) {
                if (endDateMs < startDateMs) {
                    const tmp = startDateMs;
                    startDateMs = endDateMs;
                    endDateMs = tmp;
                }
                kind = "span";
                const midpointDateMs = Math.round(startDateMs + ((endDateMs - startDateMs) / 2));
                const milestoneWithinSpan = milestoneDateMs !== null
                    && milestoneDateMs >= startDateMs
                    && milestoneDateMs <= endDateMs;
                anchorDateMs = milestoneWithinSpan ? milestoneDateMs : midpointDateMs;
            } else if (milestoneDateMs !== null) {
                kind = "milestone";
                anchorDateMs = milestoneDateMs;
            } else if (startDateMs !== null && endDateMs === null) {
                kind = "milestone";
                anchorDateMs = startDateMs;
            }

            if (!kind || anchorDateMs === null || !Number.isFinite(anchorDateMs)) {
                droppedRowCount++;
                return;
            }

            const subtitle = rowDraft.subtitleRaw === null || rowDraft.subtitleRaw === undefined
                ? ""
                : String(rowDraft.subtitleRaw).trim();
            const group = formatGroupValue(rowDraft.groupRaw);
            const statusKey = formatGroupValue(rowDraft.statusRaw);
            const laneFromData = normalizeLane(rowDraft.laneRaw);
            const sortOrder = parseNumeric(rowDraft.sortRaw);

            const anchorDate = new Date(anchorDateMs);

            const selectionKey = `${title}\u001f${rowDraft.rowIndex}`;
            const isHighlighted = categoricalResult.hasIncomingHighlights
                ? categoricalResult.highlightedRows.has(rowDraft.rowIndex)
                : true;

            const defaultDateLabel = new Intl.DateTimeFormat(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                timeZone: "UTC"
            }).format(anchorDate);

            const tooltipItems: JourneyTooltipItem[] = [
                {
                    displayName: "Status",
                    value: statusKey
                },
                {
                    displayName: kind === "span" ? "Start" : "Date",
                    value: startDateMs !== null
                        ? new Intl.DateTimeFormat(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC"
                        }).format(new Date(startDateMs))
                        : defaultDateLabel
                }
            ];

            if (kind === "span" && endDateMs !== null) {
                tooltipItems.push({
                    displayName: "End",
                    value: new Intl.DateTimeFormat(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC"
                    }).format(new Date(endDateMs))
                });

                if (milestoneDateMs !== null) {
                    tooltipItems.push({
                        displayName: "Milestone",
                        value: new Intl.DateTimeFormat(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC"
                        }).format(new Date(milestoneDateMs))
                    });
                }
            }

            if (group && group !== "(Blank)") {
                tooltipItems.push({
                    displayName: "Group",
                    value: group
                });
            }

            tooltipItems.push(...rowDraft.tooltipRows);

            items.push({
                selectionKey,
                sourceRowIndex: rowDraft.rowIndex,
                title,
                subtitle,
                group,
                statusKey,
                lane: laneFromData ?? "top",
                kind,
                anchorDateMs,
                startDateMs,
                endDateMs,
                milestoneDateMs,
                sortOrder,
                isHighlighted,
                tooltipItems,
                xValue: title,
                yValue: statusKey,
                value: anchorDateMs,
                groupValue: group,
                date: anchorDate,
                index: rowDraft.rowIndex
            });
        });

        if (!items.length) {
            return {
                ...empty,
                droppedRowCount
            };
        }

        items.sort((a, b) => {
            const aSort = a.sortOrder ?? Number.POSITIVE_INFINITY;
            const bSort = b.sortOrder ?? Number.POSITIVE_INFINITY;
            if (aSort !== bSort) return aSort - bSort;
            if (a.anchorDateMs !== b.anchorDateMs) return a.anchorDateMs - b.anchorDateMs;
            return a.title.localeCompare(b.title);
        });

        // Lane fallback alternation for rows with no explicit top/bottom value.
        let autoLaneCounter = 0;
        items.forEach((item) => {
            const explicitLane = normalizeLane(sourceRows[item.sourceRowIndex]?.laneRaw);
            if (explicitLane) {
                item.lane = explicitLane;
                return;
            }

            item.lane = autoLaneCounter % 2 === 0 ? "top" : "bottom";
            autoLaneCounter++;
        });

        const statuses = Array.from(new Set(items.map((item) => item.statusKey))).sort((a, b) => a.localeCompare(b));
        const groups = Array.from(new Set(items.map((item) => item.group))).filter((group) => group && group !== "(Blank)");

        const allBoundaryValues = items.flatMap((item) => {
            if (item.kind === "span" && item.startDateMs !== null && item.endDateMs !== null) {
                return [item.startDateMs, item.endDateMs, item.anchorDateMs];
            }
            return [item.anchorDateMs];
        });

        let minDateMs = Math.min(...allBoundaryValues);
        let maxDateMs = Math.max(...allBoundaryValues);

        if (!Number.isFinite(minDateMs) || !Number.isFinite(maxDateMs)) {
            return {
                ...empty,
                droppedRowCount
            };
        }

        if (minDateMs === maxDateMs) {
            minDateMs -= 7 * DAY_MS;
            maxDateMs += 7 * DAY_MS;
        } else {
            const pad = Math.max(DAY_MS, (maxDateMs - minDateMs) * 0.04);
            minDateMs -= pad;
            maxDateMs += pad;
        }

        return {
            dataPoints: items,
            xValues: items.map((item) => item.title),
            yValues: statuses,
            groups,
            minValue: minDateMs,
            maxValue: maxDateMs,
            items,
            statuses,
            minDateMs,
            maxDateMs,
            hasIncomingHighlights: categoricalResult.hasIncomingHighlights,
            droppedRowCount
        };
    }
}
