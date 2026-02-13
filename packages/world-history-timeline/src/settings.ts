"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import {
    IBaseVisualSettings,
    ColorScheme,
    LegendPosition,
    RotateLabelsMode,
    defaultLegendSettings,
    defaultCustomColorSettings,
    defaultSmallMultiplesSettings,
    defaultTooltipSettings,
    TooltipStyle,
    TooltipTheme
} from "@pbi-visuals/shared";

export type TimelineSortMode = "time" | "region" | "category" | "end" | "duration";

export interface IWorldHistoryTimelineSettings {
    sortBy: TimelineSortMode;
    sortOptions: string;
    sortControlReservePx?: number;
    legendHeightPx?: number;
    sortHeightPx?: number;
    axisHeaderHeightPx?: number;
    headerTopPaddingPx?: number;
    contentStartYPx?: number;
    lanePadding: number;
    barCornerRadius: number;
    minBarWidth: number;
    showTopAxis: boolean;
    showBottomAxis: boolean;
    showCrosshair: boolean;
    showTodayLine: boolean;
    showLabels: boolean;
}

export interface IWorldHistoryTimelineTextSizeSettings {
    xAxisFontSize: number;
    yAxisFontSize: number;
    legendFontSize: number;
    endLabelFontSize: number;
}

export interface IWorldHistoryTimelineVisualSettings extends IBaseVisualSettings {
    showLegend: boolean;
    timeline: IWorldHistoryTimelineSettings;
    textSizes: IWorldHistoryTimelineTextSizeSettings;
}

export const defaultSettings: IWorldHistoryTimelineVisualSettings = {
    colorScheme: "pastel",
    legendPosition: defaultLegendSettings.legendPosition!,
    legendFontSize: defaultLegendSettings.legendFontSize!,
    maxLegendItems: defaultLegendSettings.maxLegendItems!,
    showLegend: true,
    showXAxis: true,
    xAxisFontSize: 9,
    xAxisFontFamily: "Segoe UI",
    xAxisBold: false,
    xAxisItalic: false,
    xAxisUnderline: false,
    xAxisColor: "#4b5563",
    showYAxis: true,
    yAxisFontSize: 9,
    yAxisFontFamily: "Segoe UI",
    yAxisBold: false,
    yAxisItalic: false,
    yAxisUnderline: false,
    yAxisColor: "#111827",
    rotateXLabels: "never",
    tooltip: { ...defaultTooltipSettings },
    useCustomColors: defaultCustomColorSettings.useCustomColors,
    customColors: [...defaultCustomColorSettings.customColors],
    smallMultiples: { ...defaultSmallMultiplesSettings },
    timeline: {
        sortBy: "time",
        sortOptions: "region,time",
        lanePadding: 0.32,
        barCornerRadius: 2,
        minBarWidth: 1,
        showTopAxis: true,
        showBottomAxis: true,
        showCrosshair: true,
        showTodayLine: true,
        showLabels: true
    },
    textSizes: {
        xAxisFontSize: 0,
        yAxisFontSize: 0,
        legendFontSize: 0,
        endLabelFontSize: 0
    }
};

export function parseSettings(dataView: DataView): IWorldHistoryTimelineVisualSettings {
    const objects = dataView?.metadata?.objects;
    const settings: IWorldHistoryTimelineVisualSettings = JSON.parse(JSON.stringify(defaultSettings));

    if (!objects) {
        return settings;
    }

    const colorSchemeObj = objects["colorScheme"];
    if (colorSchemeObj) {
        settings.colorScheme = (colorSchemeObj["scheme"] as ColorScheme) ?? defaultSettings.colorScheme;
    }

    const legendObj = objects["legend"];
    if (legendObj) {
        settings.showLegend = (legendObj["show"] as boolean) ?? defaultSettings.showLegend;
        settings.legendPosition = (legendObj["position"] as LegendPosition) ?? defaultSettings.legendPosition;
        settings.legendFontSize = (legendObj["fontSize"] as number) ?? defaultSettings.legendFontSize;
        settings.maxLegendItems = (legendObj["maxItems"] as number) ?? defaultSettings.maxLegendItems;
    }

    const tooltipObj = objects["tooltipSettings"];
    if (tooltipObj) {
        settings.tooltip.enabled = (tooltipObj["enabled"] as boolean) ?? defaultSettings.tooltip.enabled;
        settings.tooltip.style = (tooltipObj["style"] as TooltipStyle) ?? defaultSettings.tooltip.style;
        settings.tooltip.theme = (tooltipObj["theme"] as TooltipTheme) ?? defaultSettings.tooltip.theme;

        const bg = tooltipObj["backgroundColor"] as any;
        const border = tooltipObj["borderColor"] as any;
        const text = tooltipObj["textColor"] as any;
        if (bg?.solid?.color) settings.tooltip.backgroundColor = bg.solid.color;
        if (border?.solid?.color) settings.tooltip.borderColor = border.solid.color;
        if (text?.solid?.color) settings.tooltip.textColor = text.solid.color;

        settings.tooltip.borderRadius = (tooltipObj["borderRadius"] as number) ?? defaultSettings.tooltip.borderRadius;
        settings.tooltip.shadow = (tooltipObj["shadow"] as boolean) ?? defaultSettings.tooltip.shadow;
        settings.tooltip.maxWidth = (tooltipObj["maxWidth"] as number) ?? defaultSettings.tooltip.maxWidth;
        settings.tooltip.showColorSwatch = (tooltipObj["showColorSwatch"] as boolean) ?? defaultSettings.tooltip.showColorSwatch;

        settings.tooltip.borderRadius = Math.max(0, Math.min(24, settings.tooltip.borderRadius));
        settings.tooltip.maxWidth = Math.max(160, Math.min(560, settings.tooltip.maxWidth));
    }

    const customColorsObj = objects["customColors"];
    if (customColorsObj) {
        settings.useCustomColors = (customColorsObj["useCustomColors"] as boolean) ?? defaultSettings.useCustomColors;

        const colorListStr = customColorsObj["colorList"] as string;
        if (colorListStr && typeof colorListStr === "string" && colorListStr.trim()) {
            const parsedColors = colorListStr
                .split(",")
                .map(c => c.trim())
                .filter(c => c.length > 0 && (c.startsWith("#") || c.match(/^[a-fA-F0-9]{6}$/)));

            settings.customColors = parsedColors.map(c => c.startsWith("#") ? c : `#${c}`);
        }
    }

    const xAxisObj = objects["xAxisSettings"];
    if (xAxisObj) {
        settings.showXAxis = (xAxisObj["show"] as boolean) ?? defaultSettings.showXAxis;
        settings.xAxisFontSize = (xAxisObj["fontSize"] as number) ?? defaultSettings.xAxisFontSize;
        settings.rotateXLabels = (xAxisObj["rotateLabels"] as RotateLabelsMode) ?? defaultSettings.rotateXLabels;
        settings.xAxisFontFamily = (xAxisObj["fontFamily"] as string) ?? defaultSettings.xAxisFontFamily;
        settings.xAxisBold = (xAxisObj["bold"] as boolean) ?? defaultSettings.xAxisBold;
        settings.xAxisItalic = (xAxisObj["italic"] as boolean) ?? defaultSettings.xAxisItalic;
        settings.xAxisUnderline = (xAxisObj["underline"] as boolean) ?? defaultSettings.xAxisUnderline;
        const xColor = xAxisObj["color"] as any;
        if (xColor?.solid?.color) settings.xAxisColor = xColor.solid.color;
    }

    const yAxisObj = objects["yAxisSettings"];
    if (yAxisObj) {
        settings.showYAxis = (yAxisObj["show"] as boolean) ?? defaultSettings.showYAxis;
        settings.yAxisFontSize = (yAxisObj["fontSize"] as number) ?? defaultSettings.yAxisFontSize;
        settings.yAxisFontFamily = (yAxisObj["fontFamily"] as string) ?? defaultSettings.yAxisFontFamily;
        settings.yAxisBold = (yAxisObj["bold"] as boolean) ?? defaultSettings.yAxisBold;
        settings.yAxisItalic = (yAxisObj["italic"] as boolean) ?? defaultSettings.yAxisItalic;
        settings.yAxisUnderline = (yAxisObj["underline"] as boolean) ?? defaultSettings.yAxisUnderline;
        const yColor = yAxisObj["color"] as any;
        if (yColor?.solid?.color) settings.yAxisColor = yColor.solid.color;
    }

    const textSizesObj = objects["textSizes"];
    if (textSizesObj) {
        settings.textSizes.xAxisFontSize = (textSizesObj["xAxisFontSize"] as number) ?? defaultSettings.textSizes.xAxisFontSize;
        settings.textSizes.yAxisFontSize = (textSizesObj["yAxisFontSize"] as number) ?? defaultSettings.textSizes.yAxisFontSize;
        settings.textSizes.legendFontSize = (textSizesObj["legendFontSize"] as number) ?? defaultSettings.textSizes.legendFontSize;
        settings.textSizes.endLabelFontSize = (textSizesObj["endLabelFontSize"] as number) ?? defaultSettings.textSizes.endLabelFontSize;

        const clampFontSize = (value: number): number => {
            const n = Number(value);
            if (!Number.isFinite(n) || n <= 0) return 0;
            return Math.max(6, Math.min(40, n));
        };

        settings.textSizes.xAxisFontSize = clampFontSize(settings.textSizes.xAxisFontSize);
        settings.textSizes.yAxisFontSize = clampFontSize(settings.textSizes.yAxisFontSize);
        settings.textSizes.legendFontSize = clampFontSize(settings.textSizes.legendFontSize);
        settings.textSizes.endLabelFontSize = clampFontSize(settings.textSizes.endLabelFontSize);
    }

    const timelineObj = objects["timelineSettings"];
    if (timelineObj) {
        settings.timeline.sortBy = (timelineObj["sortBy"] as TimelineSortMode) ?? defaultSettings.timeline.sortBy;
        settings.timeline.sortOptions = (timelineObj["sortOptions"] as string) ?? defaultSettings.timeline.sortOptions;
        settings.timeline.lanePadding = (timelineObj["lanePadding"] as number) ?? defaultSettings.timeline.lanePadding;
        settings.timeline.barCornerRadius = (timelineObj["barCornerRadius"] as number) ?? defaultSettings.timeline.barCornerRadius;
        settings.timeline.minBarWidth = (timelineObj["minBarWidth"] as number) ?? defaultSettings.timeline.minBarWidth;
        settings.timeline.showTopAxis = (timelineObj["showTopAxis"] as boolean) ?? defaultSettings.timeline.showTopAxis;
        settings.timeline.showBottomAxis = (timelineObj["showBottomAxis"] as boolean) ?? defaultSettings.timeline.showBottomAxis;
        settings.timeline.showCrosshair = (timelineObj["showCrosshair"] as boolean) ?? defaultSettings.timeline.showCrosshair;
        settings.timeline.showTodayLine = (timelineObj["showTodayLine"] as boolean) ?? defaultSettings.timeline.showTodayLine;
        settings.timeline.showLabels = (timelineObj["showLabels"] as boolean) ?? defaultSettings.timeline.showLabels;
        settings.timeline.sortOptions = typeof settings.timeline.sortOptions === "string" && settings.timeline.sortOptions.trim()
            ? settings.timeline.sortOptions
            : defaultSettings.timeline.sortOptions;

        settings.timeline.lanePadding = Math.max(0, Math.min(0.9, settings.timeline.lanePadding));
        settings.timeline.barCornerRadius = Math.max(0, Math.min(24, settings.timeline.barCornerRadius));
        settings.timeline.minBarWidth = Math.max(1, Math.min(20, settings.timeline.minBarWidth));
    }

    return settings;
}
