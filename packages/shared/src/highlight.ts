"use strict";

import powerbi from "powerbi-visuals-api";
import DataViewCategorical = powerbi.DataViewCategorical;
import DataViewValueColumn = powerbi.DataViewValueColumn;

export type RowHighlightState = "highlighted" | "dimmed" | "normal";

export interface HighlightStateResult {
    hasIncomingHighlights: boolean;
    isHighlightedRow: (rowIndex: number) => boolean;
    highlightedRows: Set<number>;
}

export interface HighlightStateOptions {
    preferredRoles?: string[];
}

function hasPreferredRole(column: DataViewValueColumn, preferredRoles: string[]): boolean {
    if (!preferredRoles.length) {
        return false;
    }

    const roles = column?.source?.roles ?? {};
    return preferredRoles.some((roleName) => roles?.[roleName] === true);
}

function getValueColumnsWithHighlights(categorical: DataViewCategorical): DataViewValueColumn[] {
    const valueColumns = (categorical.values as unknown as DataViewValueColumn[] | undefined) ?? [];
    return valueColumns.filter((column) => Array.isArray((column as any)?.highlights));
}

export function getCategoricalHighlightState(
    categorical: DataViewCategorical,
    options?: HighlightStateOptions
): HighlightStateResult {
    const preferredRoles = options?.preferredRoles ?? [];
    const valueColumnsWithHighlights = getValueColumnsWithHighlights(categorical);

    if (!valueColumnsWithHighlights.length) {
        return {
            hasIncomingHighlights: false,
            isHighlightedRow: () => false,
            highlightedRows: new Set<number>()
        };
    }

    const valuesAreEqual = (left: any, right: any): boolean => {
        if (left === right) return true;
        if (typeof left === "number" && typeof right === "number" && Number.isFinite(left) && Number.isFinite(right)) {
            return Math.abs(left - right) <= 1e-9;
        }
        return false;
    };

    const isNumeric = (value: any): value is number => typeof value === "number" && Number.isFinite(value);

    const collectHighlightRows = (columns: DataViewValueColumn[]): {
        highlightedRows: Set<number>;
        hasIncomingHighlights: boolean;
    } => {
        const highlightedRows = new Set<number>();
        let hasIncomingHighlights = false;

        columns.forEach((column) => {
            const highlights = ((column as any)?.highlights as any[] | undefined) ?? [];
            const values = ((column as any)?.values as any[] | undefined) ?? [];
            let columnHasNullHighlight = false;
            let columnHasNonNullHighlight = false;
            let columnDiffersFromBase = false;
            const columnSelectedRows = new Set<number>();

            highlights.forEach((highlightValue, rowIndex) => {
                const baseValue = values[rowIndex];
                if (highlightValue === null || highlightValue === undefined) {
                    columnHasNullHighlight = true;
                    return;
                }

                columnHasNonNullHighlight = true;
                if (!valuesAreEqual(highlightValue, baseValue)) {
                    columnDiffersFromBase = true;
                }

                // Power BI often emits 0 for non-selected rows in highlights.
                // Treat those as non-selected when the base value is present and not zero.
                const isZeroSuppressedNumeric =
                    highlightValue === 0
                    && baseValue !== null
                    && baseValue !== undefined
                    && !valuesAreEqual(baseValue, 0);

                if (!isZeroSuppressedNumeric) {
                    columnSelectedRows.add(rowIndex);
                }
            });

            const columnHasIncomingHighlights = columnHasNonNullHighlight && (columnHasNullHighlight || columnDiffersFromBase);
            if (columnHasIncomingHighlights) {
                hasIncomingHighlights = true;
                columnSelectedRows.forEach((rowIndex) => highlightedRows.add(rowIndex));
            }
        });

        return { highlightedRows, hasIncomingHighlights };
    };

    const preferredColumns = valueColumnsWithHighlights.filter((column) => hasPreferredRole(column, preferredRoles));
    let selectedColumns = preferredColumns.length > 0 ? preferredColumns : valueColumnsWithHighlights;
    let collected = collectHighlightRows(selectedColumns);

    // If preferred role columns carry no highlight payload, fall back to any highlight-bearing value columns.
    if (!collected.hasIncomingHighlights && preferredColumns.length > 0) {
        selectedColumns = valueColumnsWithHighlights;
        collected = collectHighlightRows(selectedColumns);
    }

    const highlightedRows = collected.highlightedRows;
    const hasIncomingHighlights = collected.hasIncomingHighlights;

    return {
        hasIncomingHighlights,
        isHighlightedRow: (rowIndex: number) => highlightedRows.has(rowIndex),
        highlightedRows
    };
}
