"use strict";

import powerbi from "powerbi-visuals-api";
import DataViewCategorical = powerbi.DataViewCategorical;
import { ChartData, DataPoint, formatDataValue, formatGroupValue } from "@pbi-visuals/shared";

type RoleColumn = {
    values: any[];
    source: powerbi.DataViewMetadataColumn;
};

export type TimelineTemporalLevel = "none" | "date" | "year" | "quarter" | "month" | "day";

export interface WorldHistoryTimelinePoint extends DataPoint {
    civilization: string;
    region: string;
    startYear: number;
    endYear: number;
    duration: number;
}

export interface WorldHistoryTimelineData extends ChartData {
    items: WorldHistoryTimelinePoint[];
    regions: string[];
    minYear: number;
    maxYear: number;
    hasRegionRoleData: boolean;
    startFormatString?: string;
    endFormatString?: string;
    timeScaleMode: "numeric" | "date";
    timeTemporalLevel: TimelineTemporalLevel;
    timeHasYearContext: boolean;
}

export class WorldHistoryTimelineTransformer {
    private static getValueColumnsByRole(categorical: DataViewCategorical, roleName: string): RoleColumn[] {
        const values = categorical.values || [];
        const matches: RoleColumn[] = [];
        for (const valueColumn of values) {
            const roles = valueColumn.source?.roles;
            if (roles?.[roleName]) {
                matches.push(valueColumn as unknown as RoleColumn);
            }
        }
        return matches;
    }

    private static fallbackValueColumn(
        categorical: DataViewCategorical,
        preferredRoleName: string,
        exclude: Set<RoleColumn>
    ): RoleColumn | null {
        const preferred = WorldHistoryTimelineTransformer.getValueColumnsByRole(categorical, preferredRoleName)
            .find((column) => !exclude.has(column));
        if (preferred) {
            return preferred;
        }

        const values = categorical.values || [];
        for (const valueColumn of values) {
            const candidate = valueColumn as unknown as RoleColumn;
            if (!exclude.has(candidate)) {
                return candidate;
            }
        }

        return null;
    }

    private static normalizeEpochNumber(value: number): number {
        if (!Number.isFinite(value)) {
            return value;
        }
        const abs = Math.abs(value);
        // Treat epoch-seconds as dates and normalize to milliseconds.
        if (abs >= 1_000_000_000 && abs <= 99_999_999_999) {
            return value * 1000;
        }
        return value;
    }

    private static isEpochLike(value: number): boolean {
        if (!Number.isFinite(value)) return false;
        const abs = Math.abs(value);
        return (abs >= 1_000_000_000 && abs <= 99_999_999_999)
            || (abs >= 1_000_000_000_000 && abs <= 9_999_999_999_999);
    }

    private static parseQuarterDate(value: string): number | null {
        const trimmed = value.trim();
        if (!trimmed) return null;

        const q1 = trimmed.match(/^(?:q|qtr|quarter)\s*([1-4])(?:[\s\-\/,]+)(\d{4})$/i);
        if (q1) {
            const quarter = Math.max(1, Math.min(4, Number(q1[1])));
            const year = Number(q1[2]);
            return Number.isFinite(year)
                ? Date.UTC(year, (quarter - 1) * 3, 1)
                : null;
        }

        const q2 = trimmed.match(/^(\d{4})(?:[\s\-\/,]+)(?:q|qtr|quarter)\s*([1-4])$/i);
        if (q2) {
            const year = Number(q2[1]);
            const quarter = Math.max(1, Math.min(4, Number(q2[2])));
            return Number.isFinite(year)
                ? Date.UTC(year, (quarter - 1) * 3, 1)
                : null;
        }

        return null;
    }

    private static parseMonthValue(value: any): number | null {
        if (value === null || value === undefined) return null;
        if (typeof value === "number" && Number.isFinite(value)) {
            const n = Math.round(value);
            return n >= 1 && n <= 12 ? n : null;
        }

        const text = String(value).trim().toLowerCase();
        if (!text) return null;
        const asNum = Number(text);
        if (Number.isFinite(asNum)) {
            const n = Math.round(asNum);
            return n >= 1 && n <= 12 ? n : null;
        }

        const months = new Map<string, number>([
            ["jan", 1], ["january", 1],
            ["feb", 2], ["february", 2],
            ["mar", 3], ["march", 3],
            ["apr", 4], ["april", 4],
            ["may", 5],
            ["jun", 6], ["june", 6],
            ["jul", 7], ["july", 7],
            ["aug", 8], ["august", 8],
            ["sep", 9], ["sept", 9], ["september", 9],
            ["oct", 10], ["october", 10],
            ["nov", 11], ["november", 11],
            ["dec", 12], ["december", 12]
        ]);
        return months.get(text) ?? null;
    }

    private static parseIntegerValue(value: any): number | null {
        if (value === null || value === undefined) return null;
        if (typeof value === "number" && Number.isFinite(value)) {
            return Math.round(value);
        }
        const text = String(value).trim();
        if (!text) return null;
        const asNum = Number(text);
        if (!Number.isFinite(asNum)) return null;
        return Math.round(asNum);
    }

    private static parseQuarterValue(value: any): number | null {
        if (value === null || value === undefined) return null;
        if (typeof value === "number" && Number.isFinite(value)) {
            const n = Math.round(value);
            return n >= 1 && n <= 4 ? n : null;
        }

        const text = String(value).trim().toLowerCase();
        if (!text) return null;

        const asNum = Number(text);
        if (Number.isFinite(asNum)) {
            const n = Math.round(asNum);
            return n >= 1 && n <= 4 ? n : null;
        }

        const q = text.match(/(?:q|qtr|quarter)\s*([1-4])/i) || text.match(/\b([1-4])\b/);
        if (q) {
            return Number(q[1]);
        }

        return null;
    }

    private static hasYearInRow(columns: RoleColumn[], rowIndex: number): boolean {
        for (const column of columns) {
            const rawValue = column.values[rowIndex];
            if (rawValue === null || rawValue === undefined) {
                continue;
            }

            if (rawValue instanceof Date) {
                return true;
            }

            const sourceName = WorldHistoryTimelineTransformer.getColumnName(column);
            const intValue = WorldHistoryTimelineTransformer.parseIntegerValue(rawValue);
            if ((/\byear\b/.test(sourceName) || /\.year$/.test(sourceName)) && intValue !== null && intValue >= 1000 && intValue <= 9999) {
                return true;
            }

            if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
                const normalized = WorldHistoryTimelineTransformer.normalizeEpochNumber(rawValue);
                if (WorldHistoryTimelineTransformer.isEpochLike(normalized)) {
                    return true;
                }
            }

            if (typeof rawValue === "string") {
                const trimmed = rawValue.trim();
                if (!trimmed) {
                    continue;
                }
                const quarterDate = WorldHistoryTimelineTransformer.parseQuarterDate(trimmed);
                if (Number.isFinite(quarterDate)) {
                    return true;
                }
                if (!/^\d+$/.test(trimmed)) {
                    const parsedDate = Date.parse(trimmed);
                    if (Number.isFinite(parsedDate) && /\d{4}/.test(trimmed)) {
                        return true;
                    }
                }
                const asInt = WorldHistoryTimelineTransformer.parseIntegerValue(trimmed);
                if (asInt !== null && asInt >= 1000 && asInt <= 9999) {
                    return true;
                }
            }
        }

        return false;
    }

    private static resolveDateWithReferenceYear(columns: RoleColumn[], rowIndex: number, referenceYear: number): number | null {
        let quarter: number | null = null;
        let month: number | null = null;
        let day: number | null = null;

        for (const column of columns) {
            const rawValue = column.values[rowIndex];
            if (rawValue === null || rawValue === undefined) continue;

            const sourceName = WorldHistoryTimelineTransformer.getColumnName(column);
            const monthValue = WorldHistoryTimelineTransformer.parseMonthValue(rawValue);
            const dayValue = WorldHistoryTimelineTransformer.parseIntegerValue(rawValue);
            const quarterValue = WorldHistoryTimelineTransformer.parseQuarterValue(rawValue);

            if ((/\bquarter\b|\bqtr\b|\.quarter$/.test(sourceName)) && quarterValue !== null) {
                quarter = quarterValue;
                continue;
            }
            if ((/\bmonth\b|\.month$/.test(sourceName)) && monthValue !== null) {
                month = monthValue;
                continue;
            }
            if ((/\bday\b|\.day$/.test(sourceName)) && dayValue !== null && dayValue >= 1 && dayValue <= 31) {
                day = dayValue;
                continue;
            }

            if (month === null && monthValue !== null) {
                month = monthValue;
                continue;
            }
            if (day === null && dayValue !== null && dayValue >= 1 && dayValue <= 31) {
                day = dayValue;
                continue;
            }
            if (quarter === null && quarterValue !== null) {
                quarter = quarterValue;
            }
        }

        if (month !== null) {
            return Date.UTC(referenceYear, Math.max(0, Math.min(11, month - 1)), Math.max(1, Math.min(31, day ?? 1)));
        }
        if (quarter !== null) {
            return Date.UTC(referenceYear, (Math.max(1, Math.min(4, quarter)) - 1) * 3, 1);
        }
        if (day !== null) {
            return Date.UTC(referenceYear, 0, Math.max(1, Math.min(31, day)));
        }

        return null;
    }

    private static parseDateFromHierarchyLevel(column: RoleColumn, rowIndex: number): number | null {
        const rawValue = column.values[rowIndex];
        if (rawValue === null || rawValue === undefined) {
            return null;
        }

        if (rawValue instanceof Date) {
            const t = rawValue.getTime();
            return Number.isFinite(t) ? t : null;
        }

        const sourceName = WorldHistoryTimelineTransformer.getColumnName(column);

        if (typeof rawValue === "string") {
            const trimmed = rawValue.trim();
            if (trimmed) {
                const quarterDate = WorldHistoryTimelineTransformer.parseQuarterDate(trimmed);
                if (Number.isFinite(quarterDate)) {
                    return Number(quarterDate);
                }

                // Keep plain-number strings from being parsed as "ms since epoch".
                if (!/^\d+$/.test(trimmed)) {
                    const parsedDate = Date.parse(trimmed);
                    if (Number.isFinite(parsedDate) && /\d{4}/.test(trimmed)) {
                        return Number(parsedDate);
                    }
                }
            }
        }

        const intValue = WorldHistoryTimelineTransformer.parseIntegerValue(rawValue);
        const monthValue = WorldHistoryTimelineTransformer.parseMonthValue(rawValue);
        const quarterValue = WorldHistoryTimelineTransformer.parseQuarterValue(rawValue);

        if ((/\byear\b/.test(sourceName) || /\.year$/.test(sourceName)) && intValue !== null) {
            return Date.UTC(intValue, 0, 1);
        }
        if ((/\bquarter\b/.test(sourceName) || /\bqtr\b/.test(sourceName) || /\.quarter$/.test(sourceName)) && quarterValue !== null) {
            return null;
        }
        if ((/\bmonth\b/.test(sourceName) || /\.month$/.test(sourceName)) && monthValue !== null) {
            return null;
        }
        if ((/\bday\b/.test(sourceName) || /\.day$/.test(sourceName)) && intValue !== null && intValue >= 1 && intValue <= 31) {
            return null;
        }

        const numericValue = WorldHistoryTimelineTransformer.toTimelineValue(rawValue);
        if (numericValue !== null) {
            if (WorldHistoryTimelineTransformer.isEpochLike(numericValue)) {
                return Number(numericValue);
            }
            if (intValue !== null && intValue >= 1000 && intValue <= 9999) {
                return Date.UTC(intValue, 0, 1);
            }
        }

        return null;
    }

    private static getColumnName(column: RoleColumn | undefined): string {
        if (!column) return "";
        return `${String(column.source?.displayName || "")} ${String(column.source?.queryName || "")}`.toLowerCase();
    }

    private static hasHierarchyHints(columns: RoleColumn[]): boolean {
        return columns.some((column) => {
            const name = WorldHistoryTimelineTransformer.getColumnName(column);
            return /\byear\b|\bquarter\b|\bqtr\b|\bmonth\b|\bday\b|\.year$|\.quarter$|\.month$|\.day$/.test(name);
        });
    }

    private static getTemporalLevelRank(level: TimelineTemporalLevel): number {
        switch (level) {
            case "day":
                return 5;
            case "month":
                return 4;
            case "quarter":
                return 3;
            case "year":
                return 2;
            case "date":
                return 1;
            default:
                return 0;
        }
    }

    private static inferTemporalLevel(columns: RoleColumn[]): {
        level: TimelineTemporalLevel;
        hasYearContext: boolean;
    } {
        let level: TimelineTemporalLevel = "none";
        let hasYearContext = false;

        const setLevel = (next: TimelineTemporalLevel): void => {
            if (WorldHistoryTimelineTransformer.getTemporalLevelRank(next) > WorldHistoryTimelineTransformer.getTemporalLevelRank(level)) {
                level = next;
            }
        };

        for (const column of columns) {
            const name = WorldHistoryTimelineTransformer.getColumnName(column);
            let columnLevel: TimelineTemporalLevel = "none";
            if (/\bday\b|\.day$/.test(name)) {
                columnLevel = "day";
            } else if (/\bmonth\b|\.month$/.test(name)) {
                columnLevel = "month";
            } else if (/\bquarter\b|\bqtr\b|\.quarter$/.test(name)) {
                columnLevel = "quarter";
            } else if (/\byear\b|\.year$/.test(name)) {
                columnLevel = "year";
            }

            const sourceType = (column.source as any)?.type;
            if (sourceType?.dateTime === true || sourceType?.temporal === true) {
                columnLevel = "date";
            }

            let columnHasValue = false;
            let columnHasYear = false;
            for (let i = 0; i < column.values.length; i++) {
                const value = column.values[i];
                if (value === null || value === undefined) {
                    continue;
                }
                columnHasValue = true;

                if (value instanceof Date) {
                    columnHasYear = true;
                    columnLevel = "date";
                    continue;
                }

                if (typeof value === "number" && Number.isFinite(value)) {
                    const normalized = WorldHistoryTimelineTransformer.normalizeEpochNumber(value);
                    if (WorldHistoryTimelineTransformer.isEpochLike(normalized)) {
                        columnHasYear = true;
                        columnLevel = "date";
                        continue;
                    }
                    const asInt = Math.round(value);
                    if (asInt >= 1000 && asInt <= 9999) {
                        columnHasYear = true;
                        if (columnLevel === "none") {
                            columnLevel = "year";
                        }
                    } else if (columnLevel === "none") {
                        if (asInt >= 1 && asInt <= 4) {
                            columnLevel = "quarter";
                        } else if (asInt >= 1 && asInt <= 12) {
                            columnLevel = "month";
                        } else if (asInt >= 1 && asInt <= 31) {
                            columnLevel = "day";
                        }
                    }
                    continue;
                }

                const text = String(value).trim();
                if (!text) {
                    continue;
                }

                const quarterDate = WorldHistoryTimelineTransformer.parseQuarterDate(text);
                if (Number.isFinite(quarterDate)) {
                    columnHasYear = true;
                    if (columnLevel === "none") {
                        columnLevel = "quarter";
                    }
                    continue;
                }

                if (!/^\d+$/.test(text)) {
                    const parsedDate = Date.parse(text);
                    if (Number.isFinite(parsedDate) && /\d{4}/.test(text)) {
                        columnHasYear = true;
                        columnLevel = "date";
                        continue;
                    }
                }

                const asInt = WorldHistoryTimelineTransformer.parseIntegerValue(text);
                if (asInt !== null && asInt >= 1000 && asInt <= 9999) {
                    columnHasYear = true;
                    if (columnLevel === "none") {
                        columnLevel = "year";
                    }
                    continue;
                }

                if (columnLevel === "none") {
                    if (WorldHistoryTimelineTransformer.parseQuarterValue(text) !== null) {
                        columnLevel = "quarter";
                    } else if (WorldHistoryTimelineTransformer.parseMonthValue(text) !== null) {
                        columnLevel = "month";
                    } else if (asInt !== null && asInt >= 1 && asInt <= 31) {
                        columnLevel = "day";
                    }
                }
            }

            if (!columnHasValue) {
                continue;
            }
            if (columnHasYear) {
                hasYearContext = true;
            }
            setLevel(columnLevel);
        }

        if (level === "none" && hasYearContext) {
            level = "year";
        }

        const resolvedLevel = level as TimelineTemporalLevel;
        switch (resolvedLevel) {
            case "day":
            case "month":
            case "quarter":
                return { level: resolvedLevel, hasYearContext: hasYearContext ? true : false };
            case "year":
            case "date":
                return { level: resolvedLevel, hasYearContext: true };
            default:
                return { level: resolvedLevel, hasYearContext };
        }
    }

    private static inferReferenceYear(columns: RoleColumn[]): number | null {
        if (!columns.length) {
            return null;
        }

        const years: number[] = [];
        const rowCount = Math.max(...columns.map((column) => column.values.length), 0);

        for (let i = 0; i < rowCount; i++) {
            const resolvedDate = WorldHistoryTimelineTransformer.resolveTimelineDateFromHierarchy(columns, i);
            if (Number.isFinite(resolvedDate)) {
                years.push(new Date(Number(resolvedDate)).getUTCFullYear());
                continue;
            }

            for (const column of columns) {
                const parsedDate = WorldHistoryTimelineTransformer.parseDateFromHierarchyLevel(column, i);
                if (Number.isFinite(parsedDate)) {
                    years.push(new Date(Number(parsedDate)).getUTCFullYear());
                    break;
                }

                const intValue = WorldHistoryTimelineTransformer.parseIntegerValue(column.values[i]);
                if (intValue !== null && intValue >= 1000 && intValue <= 9999) {
                    years.push(intValue);
                    break;
                }
            }
        }

        if (!years.length) {
            return null;
        }

        years.sort((a, b) => a - b);
        return years[Math.floor(years.length / 2)];
    }

    private static resolveTimelineOrdinalFromHierarchy(columns: RoleColumn[], rowIndex: number, fallbackYear: number = 2000): number | null {
        let quarter: number | null = null;
        let month: number | null = null;
        let day: number | null = null;

        for (const column of columns) {
            const rawValue = column.values[rowIndex];
            if (rawValue === null || rawValue === undefined) continue;

            const sourceName = WorldHistoryTimelineTransformer.getColumnName(column);
            const monthValue = WorldHistoryTimelineTransformer.parseMonthValue(rawValue);
            const dayValue = WorldHistoryTimelineTransformer.parseIntegerValue(rawValue);
            const quarterValue = WorldHistoryTimelineTransformer.parseQuarterValue(rawValue);

            if ((/\bquarter\b|\bqtr\b|\.quarter$/.test(sourceName)) && quarterValue !== null) {
                quarter = quarterValue;
                continue;
            }
            if ((/\bmonth\b|\.month$/.test(sourceName)) && monthValue !== null) {
                month = monthValue;
                continue;
            }
            if ((/\bday\b|\.day$/.test(sourceName)) && dayValue !== null && dayValue >= 1 && dayValue <= 31) {
                day = dayValue;
                continue;
            }

            if (month === null && monthValue !== null) {
                month = monthValue;
                continue;
            }
            if (day === null && dayValue !== null && dayValue >= 1 && dayValue <= 31) {
                day = dayValue;
                continue;
            }
            if (quarter === null && quarterValue !== null) {
                quarter = quarterValue;
            }
        }

        // Build a synthetic anchor date when level context has no year (e.g., Month-only or Day-only drill).
        const safeYear = Number.isFinite(fallbackYear) ? Math.round(fallbackYear) : 2000;
        if (month !== null) {
            return Date.UTC(safeYear, Math.max(0, Math.min(11, month - 1)), Math.max(1, Math.min(31, day ?? 1)));
        }
        if (quarter !== null) {
            return Date.UTC(safeYear, (Math.max(1, Math.min(4, quarter)) - 1) * 3, 1);
        }
        if (day !== null) {
            return Date.UTC(safeYear, 0, Math.max(1, Math.min(31, day)));
        }

        return null;
    }

    private static resolveTimelineDateFromHierarchy(columns: RoleColumn[], rowIndex: number): number | null {
        let year: number | null = null;
        let quarter: number | null = null;
        let month: number | null = null;
        let day: number | null = null;

        for (const column of columns) {
            const rawValue = column.values[rowIndex];
            if (rawValue === null || rawValue === undefined) {
                continue;
            }

            if (rawValue instanceof Date) {
                const t = rawValue.getTime();
                if (Number.isFinite(t)) {
                    return t;
                }
            }

            if (typeof rawValue === "string") {
                const trimmed = rawValue.trim();
                if (trimmed) {
                    const quarterDate = WorldHistoryTimelineTransformer.parseQuarterDate(trimmed);
                    if (Number.isFinite(quarterDate)) {
                        return Number(quarterDate);
                    }
                    const parsedDate = Date.parse(trimmed);
                    if (Number.isFinite(parsedDate) && /\d{4}/.test(trimmed)) {
                        return parsedDate;
                    }
                }
            }

            const sourceName = WorldHistoryTimelineTransformer.getColumnName(column);
            const intValue = WorldHistoryTimelineTransformer.parseIntegerValue(rawValue);
            const monthValue = WorldHistoryTimelineTransformer.parseMonthValue(rawValue);
            const quarterValue = WorldHistoryTimelineTransformer.parseQuarterValue(rawValue);

            if ((/\byear\b/.test(sourceName) || /\.year$/.test(sourceName)) && intValue !== null) {
                year = intValue;
                continue;
            }
            if ((/\bquarter\b/.test(sourceName) || /\bqtr\b/.test(sourceName) || /\.quarter$/.test(sourceName))) {
                if (quarterValue !== null) {
                    quarter = quarterValue;
                    continue;
                }
                if (typeof rawValue === "string") {
                    const q = rawValue.match(/([1-4])/);
                    if (q) {
                        quarter = Number(q[1]);
                        continue;
                    }
                }
            }
            if ((/\bmonth\b/.test(sourceName) || /\.month$/.test(sourceName)) && monthValue !== null) {
                month = monthValue;
                continue;
            }
            if ((/\bday\b/.test(sourceName) || /\.day$/.test(sourceName)) && intValue !== null && intValue >= 1 && intValue <= 31) {
                day = intValue;
                continue;
            }

            // Fallback heuristics when source names are unavailable/ambiguous.
            if (intValue !== null) {
                if (year === null && intValue >= 1000 && intValue <= 9999) {
                    year = intValue;
                    continue;
                }
                if (quarter === null && intValue >= 1 && intValue <= 4 && /\bq\b/.test(String(rawValue).toLowerCase())) {
                    quarter = intValue;
                    continue;
                }
                if (month === null && intValue >= 1 && intValue <= 12) {
                    month = intValue;
                    continue;
                }
                if (day === null && intValue >= 1 && intValue <= 31) {
                    day = intValue;
                    continue;
                }
            }
            if (month === null && monthValue !== null) {
                month = monthValue;
            }
        }

        if (year === null) {
            return null;
        }

        const resolvedMonth = month ?? (quarter !== null ? ((quarter - 1) * 3 + 1) : 1);
        const resolvedDay = day ?? 1;
        const composed = Date.UTC(year, Math.max(0, Math.min(11, resolvedMonth - 1)), Math.max(1, Math.min(31, resolvedDay)));
        return Number.isFinite(composed) ? composed : null;
    }

    private static getRoleColumns(
        categorical: DataViewCategorical,
        roleName: string,
        options?: { includeValues?: boolean; includeCategories?: boolean }
    ): RoleColumn[] {
        const includeValues = options?.includeValues !== false;
        const includeCategories = options?.includeCategories !== false;
        const columns: RoleColumn[] = [];

        if (includeValues && categorical.values) {
            for (const valueColumn of categorical.values) {
                const roles = valueColumn.source?.roles;
                if (roles?.[roleName]) {
                    columns.push(valueColumn as unknown as RoleColumn);
                }
            }
        }

        if (includeCategories && categorical.categories) {
            for (const categoryColumn of categorical.categories) {
                const roles = categoryColumn.source?.roles;
                if (roles?.[roleName]) {
                    columns.push(categoryColumn as unknown as RoleColumn);
                }
            }
        }

        return columns;
    }

    private static toTimelineValue(rawValue: any): number | null {
        if (rawValue === null || rawValue === undefined) {
            return null;
        }

        if (rawValue instanceof Date) {
            const t = rawValue.getTime();
            return Number.isFinite(t) ? t : null;
        }

        if (typeof rawValue === "number") {
            if (!Number.isFinite(rawValue)) return null;
            return WorldHistoryTimelineTransformer.normalizeEpochNumber(rawValue);
        }

        if (typeof rawValue === "string") {
            const trimmed = rawValue.trim();
            if (!trimmed) return null;

            const asQuarterDate = WorldHistoryTimelineTransformer.parseQuarterDate(trimmed);
            if (Number.isFinite(asQuarterDate)) {
                return Number(asQuarterDate);
            }

            const asNumber = Number(trimmed);
            if (Number.isFinite(asNumber)) {
                return WorldHistoryTimelineTransformer.normalizeEpochNumber(asNumber);
            }

            const asDate = Date.parse(trimmed);
            return Number.isFinite(asDate) ? asDate : null;
        }

        return null;
    }

    private static isDateLikeColumn(column: RoleColumn | undefined): boolean {
        if (!column) return false;

        const sourceType = (column.source as any)?.type;
        if (sourceType?.dateTime === true || sourceType?.temporal === true) {
            return true;
        }
        const sourceFormat = String((column.source as any)?.format || "").toLowerCase();
            if (sourceFormat.includes("yyyy") || sourceFormat.includes("yy")
                || sourceFormat.includes("mmm") || sourceFormat.includes("mm")
                || sourceFormat.includes("dd")) {
            return true;
        }
        const sourceName = WorldHistoryTimelineTransformer.getColumnName(column);
        if (/\byear\b|\bquarter\b|\bqtr\b|\bmonth\b|\bday\b|\.year$|\.quarter$|\.month$|\.day$/.test(sourceName)) {
            return true;
        }

        const looksLikeDateString = (value: string): boolean => {
            const s = value.trim();
            if (!s) return false;

            if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(s)) return true;
            if (/^\d{4}\/\d{2}\/\d{2}(?:[T\s].*)?$/.test(s)) return true;
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return true;
            if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(s)) return true;
            if (/^(?:q|qtr|quarter)\s*[1-4](?:[\s\-\/,]+)\d{4}$/i.test(s)) return true;
            if (/^\d{4}(?:[\s\-\/,]+)(?:q|qtr|quarter)\s*[1-4]$/i.test(s)) return true;
            if (/^(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)$/i.test(s)) return true;
            if (/^\d{9,14}$/.test(s)) {
                const n = Number(s);
                const abs = Math.abs(n);
                if ((abs >= 1_000_000_000 && abs <= 99_999_999_999)
                    || (abs >= 1_000_000_000_000 && abs <= 9_999_999_999_999)) {
                    return true;
                }
            }

            return false;
        };

        const looksLikeUnixTimestamp = (value: number): boolean => {
            if (!Number.isFinite(value)) return false;
            const abs = Math.abs(value);
            // Supports epoch seconds or milliseconds in modern ranges.
            return (abs >= 1_000_000_000 && abs <= 99_999_999_999)
                || (abs >= 1_000_000_000_000 && abs <= 9_999_999_999_999);
        };

        return column.values.some((v) => {
            if (v instanceof Date) return true;
            if (typeof v === "number") return looksLikeUnixTimestamp(v);
            if (typeof v === "string") return looksLikeDateString(v);
            return false;
        });
    }

    private static isDateLikeColumns(columns: RoleColumn[]): boolean {
        return columns.some((column) => WorldHistoryTimelineTransformer.isDateLikeColumn(column));
    }

    private static resolveTimelineValue(
        columns: RoleColumn[],
        rowIndex: number,
        preferDateHierarchy: boolean,
        fallbackYear: number | null = null
    ): number | null {
        if (preferDateHierarchy) {
            const resolvedFromHierarchy = WorldHistoryTimelineTransformer.resolveTimelineDateFromHierarchy(columns, rowIndex);
            if (Number.isFinite(resolvedFromHierarchy)) {
                return Number(resolvedFromHierarchy);
            }

            // Fall back to deepest level parsing only when a full date cannot be reconstructed.
            for (let i = columns.length - 1; i >= 0; i--) {
                const parsedFromLevel = WorldHistoryTimelineTransformer.parseDateFromHierarchyLevel(columns[i], rowIndex);
                if (Number.isFinite(parsedFromLevel)) {
                    return Number(parsedFromLevel);
                }
            }

            const resolvedFromOrdinalHierarchy = WorldHistoryTimelineTransformer.resolveTimelineOrdinalFromHierarchy(
                columns,
                rowIndex,
                Number.isFinite(fallbackYear) ? Number(fallbackYear) : 2000
            );
            if (Number.isFinite(resolvedFromOrdinalHierarchy)) {
                return Number(resolvedFromOrdinalHierarchy);
            }
        }

        for (let i = columns.length - 1; i >= 0; i--) {
            const parsed = WorldHistoryTimelineTransformer.toTimelineValue(columns[i].values[rowIndex]);
            if (Number.isFinite(parsed)) {
                return Number(parsed);
            }
        }
        return null;
    }

    private static getFormatString(columns: RoleColumn[]): string | undefined {
        for (let i = columns.length - 1; i >= 0; i--) {
            const fmt = (columns[i].source as any)?.format as string | undefined;
            if (typeof fmt === "string" && fmt.trim()) {
                return fmt;
            }
        }
        return undefined;
    }

    private static joinCategoryLabel(columns: RoleColumn[], rowIndex: number, fallback: string): string {
        if (!columns.length) {
            return fallback;
        }

        const parts: string[] = [];
        for (const column of columns) {
            const rawValue = column.values[rowIndex];
            if (rawValue === null || rawValue === undefined) {
                continue;
            }

            const label = formatDataValue(rawValue, rowIndex);
            if (label.trim()) {
                parts.push(label);
            }
        }

        return WorldHistoryTimelineTransformer.joinUniqueLabelParts(parts, fallback);
    }

    private static joinGroupLabel(columns: RoleColumn[], rowIndex: number, fallback: string): string {
        if (!columns.length) {
            return fallback;
        }

        const parts = columns.map((column) => formatGroupValue(column.values[rowIndex]));
        return WorldHistoryTimelineTransformer.joinUniqueLabelParts(parts, fallback);
    }

    private static joinUniqueLabelParts(parts: string[], fallback: string): string {
        if (!parts.length) {
            return fallback;
        }

        const merged: string[] = [];
        const seen = new Set<string>();

        for (const part of parts) {
            const value = String(part ?? "").trim();
            if (!value) {
                continue;
            }

            const normalized = value.toLocaleLowerCase();
            if (seen.has(normalized)) {
                continue;
            }

            seen.add(normalized);
            merged.push(value);
        }

        return merged.length ? merged.join(" • ") : fallback;
    }

    public static transform(categorical: DataViewCategorical): WorldHistoryTimelineData {
        const dataPoints: DataPoint[] = [];
        const items: WorldHistoryTimelinePoint[] = [];
        const regionsSet = new Set<string>();

        const civilizationColumns = WorldHistoryTimelineTransformer.getRoleColumns(categorical, "civilization", {
            includeValues: false
        });
        const regionColumns = WorldHistoryTimelineTransformer.getRoleColumns(categorical, "region", {
            includeValues: false
        });

        const startColumns = WorldHistoryTimelineTransformer.getRoleColumns(categorical, "startYear");
        const endColumns = WorldHistoryTimelineTransformer.getRoleColumns(categorical, "endYear");

        const occupiedColumns = new Set<RoleColumn>([...startColumns, ...endColumns]);
        if (!startColumns.length) {
            const fallbackStart = WorldHistoryTimelineTransformer.fallbackValueColumn(categorical, "startYear", occupiedColumns);
            if (fallbackStart) {
                startColumns.push(fallbackStart);
                occupiedColumns.add(fallbackStart);
            }
        }
        if (!endColumns.length) {
            const fallbackEnd = WorldHistoryTimelineTransformer.fallbackValueColumn(categorical, "endYear", occupiedColumns);
            if (fallbackEnd) {
                endColumns.push(fallbackEnd);
                occupiedColumns.add(fallbackEnd);
            }
        }
        if (!endColumns.length && startColumns.length) {
            endColumns.push(startColumns[startColumns.length - 1]);
        }

        if (!startColumns.length || !endColumns.length) {
            return {
                dataPoints,
                items,
                xValues: [],
                yValues: [],
                groups: [],
                regions: [],
                maxValue: 0,
                minValue: 0,
                minYear: 0,
                maxYear: 0,
                hasRegionRoleData: regionColumns.length > 0,
                timeScaleMode: "numeric",
                timeTemporalLevel: "none",
                timeHasYearContext: true
            };
        }

        const isDateScale = WorldHistoryTimelineTransformer.hasHierarchyHints(startColumns)
            || WorldHistoryTimelineTransformer.hasHierarchyHints(endColumns)
            || WorldHistoryTimelineTransformer.isDateLikeColumns(startColumns)
            || WorldHistoryTimelineTransformer.isDateLikeColumns(endColumns);
        const temporalColumns = startColumns.length > 0 ? startColumns : endColumns;
        const temporalContext = WorldHistoryTimelineTransformer.inferTemporalLevel(temporalColumns);
        const combinedTemporalContext = WorldHistoryTimelineTransformer.inferTemporalLevel([...startColumns, ...endColumns]);
        const fallbackReferenceYear = isDateScale
            ? WorldHistoryTimelineTransformer.inferReferenceYear([...startColumns, ...endColumns])
            : null;
        const allColumns = [
            ...civilizationColumns,
            ...regionColumns,
            ...startColumns,
            ...endColumns
        ];
        const rowCount = allColumns.length > 0
            ? Math.max(...allColumns.map((column) => column.values.length))
            : 0;

        let minYear = Number.POSITIVE_INFINITY;
        let maxYear = Number.NEGATIVE_INFINITY;
        let maxDuration = Number.NEGATIVE_INFINITY;
        let minDuration = Number.POSITIVE_INFINITY;

        let itemOrdinal = 0;
        for (let i = 0; i < rowCount; i++) {
            const startHasYear = WorldHistoryTimelineTransformer.hasYearInRow(startColumns, i);
            const endHasYear = WorldHistoryTimelineTransformer.hasYearInRow(endColumns, i);

            let startYear = WorldHistoryTimelineTransformer.resolveTimelineValue(
                startColumns,
                i,
                isDateScale,
                fallbackReferenceYear
            );
            let endYear = WorldHistoryTimelineTransformer.resolveTimelineValue(
                endColumns,
                i,
                isDateScale,
                fallbackReferenceYear
            );

            if (isDateScale) {
                if (!startHasYear && endHasYear && Number.isFinite(endYear)) {
                    const endYearNumber = new Date(Number(endYear)).getUTCFullYear();
                    const anchoredStart = WorldHistoryTimelineTransformer.resolveDateWithReferenceYear(startColumns, i, endYearNumber);
                    if (Number.isFinite(anchoredStart)) {
                        startYear = Number(anchoredStart);
                    }
                }

                if (!endHasYear && startHasYear && Number.isFinite(startYear)) {
                    const startYearNumber = new Date(Number(startYear)).getUTCFullYear();
                    const anchoredEnd = WorldHistoryTimelineTransformer.resolveDateWithReferenceYear(endColumns, i, startYearNumber);
                    if (Number.isFinite(anchoredEnd)) {
                        endYear = Number(anchoredEnd);
                    }
                }
            }

            if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
                if (Number.isFinite(startYear)) {
                    endYear = startYear;
                } else if (Number.isFinite(endYear)) {
                    startYear = endYear;
                } else {
                    continue;
                }
            }
            if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
                continue;
            }

            startYear = Number(startYear);
            endYear = Number(endYear);
            if (endYear < startYear) {
                const t = startYear;
                startYear = endYear;
                endYear = t;
            }

            const civilization = WorldHistoryTimelineTransformer.joinCategoryLabel(civilizationColumns, i, `Entry ${itemOrdinal + 1}`);
            const region = WorldHistoryTimelineTransformer.joinGroupLabel(regionColumns, i, "World");

            const duration = Math.max(0, endYear - startYear);

            minYear = Math.min(minYear, startYear);
            maxYear = Math.max(maxYear, endYear);
            minDuration = Math.min(minDuration, duration);
            maxDuration = Math.max(maxDuration, duration);

            regionsSet.add(region);

            const point: WorldHistoryTimelinePoint = {
                xValue: String(startYear),
                yValue: civilization,
                value: duration,
                groupValue: "All",
                index: i,
                civilization,
                region,
                startYear,
                endYear,
                duration
            };

            dataPoints.push(point);
            items.push(point);
            itemOrdinal += 1;
        }

        if (!Number.isFinite(minYear) || !Number.isFinite(maxYear)) {
            minYear = 0;
            maxYear = 0;
        }

        if (!Number.isFinite(minDuration)) {
            minDuration = 0;
        }

        if (!Number.isFinite(maxDuration)) {
            maxDuration = 0;
        }

        const regions = Array.from(regionsSet).sort((a, b) => a.localeCompare(b));

        return {
            dataPoints,
            items,
            xValues: [String(minYear), String(maxYear)],
            yValues: items.map((d) => d.civilization),
            groups: ["All"],
            regions,
            minValue: minDuration,
            maxValue: maxDuration,
            minYear,
            maxYear,
            hasRegionRoleData: regionColumns.length > 0,
            startFormatString: WorldHistoryTimelineTransformer.getFormatString(startColumns),
            endFormatString: WorldHistoryTimelineTransformer.getFormatString(endColumns),
            timeScaleMode: isDateScale ? "date" : "numeric",
            timeTemporalLevel: temporalContext.level,
            timeHasYearContext: combinedTemporalContext.hasYearContext || fallbackReferenceYear !== null
        };
    }
}
