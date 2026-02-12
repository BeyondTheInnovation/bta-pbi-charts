"use strict";

import powerbi from "powerbi-visuals-api";
import DataViewCategorical = powerbi.DataViewCategorical;
import { ChartData, DataPoint, formatDataValue, formatGroupValue } from "@pbi-visuals/shared";

export interface WorldHistoryTimelinePoint extends DataPoint {
    civilization: string;
    region: string;
    era: string;
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
    hasEraRoleData: boolean;
    startFormatString?: string;
    endFormatString?: string;
}

export class WorldHistoryTimelineTransformer {
    public static transform(categorical: DataViewCategorical): WorldHistoryTimelineData {
        const dataPoints: DataPoint[] = [];
        const items: WorldHistoryTimelinePoint[] = [];
        const regionsSet = new Set<string>();
        const erasSet = new Set<string>();

        let civilizationIndex = -1;
        let regionIndex = -1;
        let eraIndex = -1;
        let startYearIndex = -1;
        let endYearIndex = -1;

        if (categorical.categories) {
            categorical.categories.forEach((cat, idx) => {
                const roles = cat.source.roles;
                if (!roles) return;
                if (roles["civilization"]) civilizationIndex = idx;
                if (roles["region"]) regionIndex = idx;
                if (roles["era"]) eraIndex = idx;
            });
        }

        if (categorical.values) {
            categorical.values.forEach((valueCol, idx) => {
                const roles = valueCol.source.roles;
                if (!roles) return;
                if (roles["startYear"]) startYearIndex = idx;
                if (roles["endYear"]) endYearIndex = idx;
            });
        }

        if (startYearIndex < 0 && (categorical.values?.length ?? 0) > 0) {
            startYearIndex = 0;
        }
        if (endYearIndex < 0 && (categorical.values?.length ?? 0) > 1) {
            endYearIndex = 1;
        }

        if (!categorical.values || startYearIndex < 0 || endYearIndex < 0) {
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
                hasRegionRoleData: regionIndex >= 0,
                hasEraRoleData: eraIndex >= 0
            };
        }

        const startColumn = categorical.values[startYearIndex];
        const endColumn = categorical.values[endYearIndex];

        const civilizationColumn = civilizationIndex >= 0 ? categorical.categories?.[civilizationIndex] : undefined;
        const regionColumn = regionIndex >= 0 ? categorical.categories?.[regionIndex] : undefined;
        const eraColumn = eraIndex >= 0 ? categorical.categories?.[eraIndex] : undefined;

        const rowCount = Math.max(
            civilizationColumn?.values.length ?? 0,
            startColumn.values.length,
            endColumn.values.length
        );

        let minYear = Number.POSITIVE_INFINITY;
        let maxYear = Number.NEGATIVE_INFINITY;
        let maxDuration = Number.NEGATIVE_INFINITY;
        let minDuration = Number.POSITIVE_INFINITY;

        let index = 0;
        for (let i = 0; i < rowCount; i++) {
            const rawStart = startColumn.values[i];
            const rawEnd = endColumn.values[i];
            if (rawStart === null || rawStart === undefined || rawEnd === null || rawEnd === undefined) {
                continue;
            }

            let startYear = Number(rawStart);
            let endYear = Number(rawEnd);
            if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
                continue;
            }

            if (endYear < startYear) {
                const t = startYear;
                startYear = endYear;
                endYear = t;
            }

            const civilizationRaw = civilizationColumn?.values[i];
            const civilization = (civilizationRaw === null || civilizationRaw === undefined)
                ? `Entry ${index + 1}`
                : formatDataValue(civilizationRaw, i);

            const region = regionColumn
                ? formatGroupValue(regionColumn.values[i])
                : "World";
            const era = eraColumn
                ? formatGroupValue(eraColumn.values[i])
                : "All";

            const duration = Math.max(0, endYear - startYear);

            minYear = Math.min(minYear, startYear);
            maxYear = Math.max(maxYear, endYear);
            minDuration = Math.min(minDuration, duration);
            maxDuration = Math.max(maxDuration, duration);

            regionsSet.add(region);
            erasSet.add(era);

            const point: WorldHistoryTimelinePoint = {
                xValue: String(startYear),
                yValue: civilization,
                value: duration,
                groupValue: era,
                index,
                civilization,
                region,
                era,
                startYear,
                endYear,
                duration
            };

            dataPoints.push(point);
            items.push(point);
            index += 1;
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
        const eras = Array.from(erasSet).sort((a, b) => a.localeCompare(b));

        return {
            dataPoints,
            items,
            xValues: [String(minYear), String(maxYear)],
            yValues: items.map((d) => d.civilization),
            groups: eras.length ? eras : ["All"],
            regions,
            minValue: minDuration,
            maxValue: maxDuration,
            minYear,
            maxYear,
            hasRegionRoleData: regionIndex >= 0,
            hasEraRoleData: eraIndex >= 0,
            startFormatString: (startColumn.source as any)?.format as string | undefined,
            endFormatString: (endColumn.source as any)?.format as string | undefined
        };
    }
}
