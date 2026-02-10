"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import {
    IBaseVisualSettings,
    RotateLabelsMode,
    defaultSmallMultiplesSettings,
    defaultLegendSettings,
    defaultCustomColorSettings,
    defaultTooltipSettings,
    defaultTextSizeSettings,
    ITextSizeSettings,
    TooltipStyle,
    TooltipTheme,
    LegendPosition,
    ColorScheme
} from "@pbi-visuals/shared";

export type LineCurve = "linear" | "monotone";
export type MarkerMode = "none" | "last" | "last2";
export type InlineLabelContent = "name_value_delta" | "name_value" | "name_only" | "value_delta";
export type InlineDeltaMode = "percent" | "absolute" | "both" | "none";
export type PointValueLabelDensity = "auto" | "all";

export interface ILineSettings {
    curve: LineCurve;
    lineWidth: number;
    showAreaFill: boolean;
    areaOpacity: number;
}

export interface IMarkerSettings {
    mode: MarkerMode;
    lastMarkerSize: number;
    prevMarkerSize: number;
}

export interface IInlineLabelSettings {
    enabled: boolean;
    content: InlineLabelContent;
    deltaMode: InlineDeltaMode;
    showLeaderLines: boolean;
    labelFontSize: number;
    valueFontSize: number;
    deltaFontSize: number;
    labelPadding: number;
    labelGap: number;
}

export interface IPointValueLabelSettings {
    enabled: boolean;
    density: PointValueLabelDensity;
    fontSize: number;
    color: string;
    showBackground: boolean;
    backgroundColor: string;
    backgroundOpacity: number;
    offset: number;
}

export interface IInlineLabelsLineVisualSettings extends IBaseVisualSettings {
    // Legend add-on
    showLegend: boolean;
    // Shared text sizes (0 = auto)
    textSizes: ITextSizeSettings;
    // Custom settings
    lineSettings: ILineSettings;
    markerSettings: IMarkerSettings;
    inlineLabelSettings: IInlineLabelSettings;
    pointValueLabels: IPointValueLabelSettings;
}

export const defaultSettings: IInlineLabelsLineVisualSettings = {
    colorScheme: "vibrant" as ColorScheme,
    legendPosition: defaultLegendSettings.legendPosition as LegendPosition,
    legendFontSize: defaultLegendSettings.legendFontSize!,
    maxLegendItems: defaultLegendSettings.maxLegendItems!,
    showLegend: false,

    showXAxis: true,
    xAxisFontSize: 10,
    xAxisFontFamily: "Segoe UI",
    xAxisBold: false,
    xAxisItalic: false,
    xAxisUnderline: false,
    xAxisColor: "#6b7280",

    showYAxis: true,
    yAxisFontSize: 11,
    yAxisFontFamily: "Segoe UI",
    yAxisBold: false,
    yAxisItalic: false,
    yAxisUnderline: false,
    yAxisColor: "#374151",

    rotateXLabels: "auto" as RotateLabelsMode,

    tooltip: { ...defaultTooltipSettings },

    useCustomColors: defaultCustomColorSettings.useCustomColors,
    customColors: [...defaultCustomColorSettings.customColors],

    smallMultiples: { ...defaultSmallMultiplesSettings },
    textSizes: { ...defaultTextSizeSettings },

    lineSettings: {
        curve: "monotone",
        lineWidth: 2.5,
        showAreaFill: true,
        areaOpacity: 0.12
    },
    markerSettings: {
        mode: "last2",
        lastMarkerSize: 7,
        prevMarkerSize: 6
    },
    inlineLabelSettings: {
        enabled: true,
        content: "name_value_delta",
        deltaMode: "percent",
        showLeaderLines: true,
        labelFontSize: 12,
        valueFontSize: 11,
        deltaFontSize: 10,
        labelPadding: 8,
        labelGap: 6
    },
    pointValueLabels: {
        enabled: true,
        density: "auto",
        fontSize: 10,
        color: "#111827",
        showBackground: true,
        backgroundColor: "#ffffff",
        backgroundOpacity: 0.85,
        offset: 8
    }
};

export function parseSettings(dataView: DataView): IInlineLabelsLineVisualSettings {
    const objects = dataView?.metadata?.objects;
    const settings: IInlineLabelsLineVisualSettings = JSON.parse(JSON.stringify(defaultSettings));

    if (!objects) {
        return settings;
    }

    // Tooltip
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

    // Legend
    const legendObj = objects["legend"];
    if (legendObj) {
        settings.showLegend = (legendObj["show"] as boolean) ?? defaultSettings.showLegend;
        settings.legendPosition = (legendObj["position"] as LegendPosition) ?? defaultSettings.legendPosition;
        settings.legendFontSize = (legendObj["fontSize"] as number) ?? defaultSettings.legendFontSize;
        settings.maxLegendItems = (legendObj["maxItems"] as number) ?? defaultSettings.maxLegendItems;
        settings.legendFontSize = Math.max(6, Math.min(40, Number(settings.legendFontSize) || defaultSettings.legendFontSize));
        settings.maxLegendItems = Math.max(1, Math.min(50, Number(settings.maxLegendItems) || defaultSettings.maxLegendItems));
    }

    // X-Axis
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
        settings.xAxisFontSize = Math.max(6, Math.min(40, Number(settings.xAxisFontSize) || defaultSettings.xAxisFontSize));
    }

    // Y-Axis
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
        settings.yAxisFontSize = Math.max(6, Math.min(40, Number(settings.yAxisFontSize) || defaultSettings.yAxisFontSize));
    }

    // Text Sizes
    const textSizesObj = objects["textSizes"];
    if (textSizesObj) {
        const clampFontSize = (v: number): number => {
            const n = Number(v);
            if (!Number.isFinite(n) || n <= 0) return 0;
            return Math.max(6, Math.min(40, n));
        };

        settings.textSizes.xAxisFontSize = clampFontSize((textSizesObj["xAxisFontSize"] as number) ?? settings.textSizes.xAxisFontSize);
        settings.textSizes.yAxisFontSize = clampFontSize((textSizesObj["yAxisFontSize"] as number) ?? settings.textSizes.yAxisFontSize);
        settings.textSizes.legendFontSize = clampFontSize((textSizesObj["legendFontSize"] as number) ?? settings.textSizes.legendFontSize);
        settings.textSizes.panelTitleFontSize = clampFontSize((textSizesObj["panelTitleFontSize"] as number) ?? settings.textSizes.panelTitleFontSize);
    }

    // Small multiples
    const smallMultObj = objects["smallMultiples"];
    if (smallMultObj) {
        settings.smallMultiples.columns = (smallMultObj["columns"] as number) ?? defaultSettings.smallMultiples.columns;
        settings.smallMultiples.spacing = (smallMultObj["spacing"] as number) ?? defaultSettings.smallMultiples.spacing;
        settings.smallMultiples.showTitle = (smallMultObj["showTitle"] as boolean) ?? defaultSettings.smallMultiples.showTitle;
        settings.smallMultiples.titleFontSize = (smallMultObj["titleFontSize"] as number) ?? defaultSettings.smallMultiples.titleFontSize;
        settings.smallMultiples.titleSpacing = (smallMultObj["titleSpacing"] as number) ?? defaultSettings.smallMultiples.titleSpacing;

        settings.smallMultiples.columns = Math.max(1, Math.min(6, Number(settings.smallMultiples.columns) || defaultSettings.smallMultiples.columns));
        settings.smallMultiples.spacing = Math.max(10, Math.min(200, Number(settings.smallMultiples.spacing) || defaultSettings.smallMultiples.spacing));
        settings.smallMultiples.titleFontSize = Math.max(6, Math.min(40, Number(settings.smallMultiples.titleFontSize) || defaultSettings.smallMultiples.titleFontSize));
        settings.smallMultiples.titleSpacing = Math.max(10, Math.min(120, Number(settings.smallMultiples.titleSpacing) || defaultSettings.smallMultiples.titleSpacing));
    }

    // Line settings
    const lineObj = objects["lineSettings"];
    if (lineObj) {
        settings.lineSettings.curve = (lineObj["curve"] as LineCurve) ?? defaultSettings.lineSettings.curve;
        settings.lineSettings.lineWidth = (lineObj["lineWidth"] as number) ?? defaultSettings.lineSettings.lineWidth;
        settings.lineSettings.showAreaFill = (lineObj["showAreaFill"] as boolean) ?? defaultSettings.lineSettings.showAreaFill;
        settings.lineSettings.areaOpacity = (lineObj["areaOpacity"] as number) ?? defaultSettings.lineSettings.areaOpacity;

        settings.lineSettings.lineWidth = Math.max(1, Math.min(6, Number(settings.lineSettings.lineWidth) || defaultSettings.lineSettings.lineWidth));
        settings.lineSettings.areaOpacity = Math.max(0, Math.min(0.4, Number(settings.lineSettings.areaOpacity) || defaultSettings.lineSettings.areaOpacity));
        if (settings.lineSettings.curve !== "linear" && settings.lineSettings.curve !== "monotone") {
            settings.lineSettings.curve = defaultSettings.lineSettings.curve;
        }
    }

    // Marker settings
    const markerObj = objects["markerSettings"];
    if (markerObj) {
        settings.markerSettings.mode = (markerObj["mode"] as MarkerMode) ?? defaultSettings.markerSettings.mode;
        settings.markerSettings.lastMarkerSize = (markerObj["lastMarkerSize"] as number) ?? defaultSettings.markerSettings.lastMarkerSize;
        settings.markerSettings.prevMarkerSize = (markerObj["prevMarkerSize"] as number) ?? defaultSettings.markerSettings.prevMarkerSize;

        const clampSize = (v: number, fallback: number): number => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(0, Math.min(20, n));
        };
        settings.markerSettings.lastMarkerSize = clampSize(settings.markerSettings.lastMarkerSize, defaultSettings.markerSettings.lastMarkerSize);
        settings.markerSettings.prevMarkerSize = clampSize(settings.markerSettings.prevMarkerSize, defaultSettings.markerSettings.prevMarkerSize);
        if (settings.markerSettings.mode !== "none" && settings.markerSettings.mode !== "last" && settings.markerSettings.mode !== "last2") {
            settings.markerSettings.mode = defaultSettings.markerSettings.mode;
        }
    }

    // Inline label settings
    const labelObj = objects["inlineLabelSettings"];
    if (labelObj) {
        settings.inlineLabelSettings.enabled = (labelObj["enabled"] as boolean) ?? defaultSettings.inlineLabelSettings.enabled;
        settings.inlineLabelSettings.content = (labelObj["content"] as InlineLabelContent) ?? defaultSettings.inlineLabelSettings.content;
        settings.inlineLabelSettings.deltaMode = (labelObj["deltaMode"] as InlineDeltaMode) ?? defaultSettings.inlineLabelSettings.deltaMode;
        settings.inlineLabelSettings.showLeaderLines = (labelObj["showLeaderLines"] as boolean) ?? defaultSettings.inlineLabelSettings.showLeaderLines;

        const clampFont = (v: number, fallback: number): number => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(6, Math.min(40, n));
        };
        settings.inlineLabelSettings.labelFontSize = clampFont((labelObj["labelFontSize"] as number) ?? settings.inlineLabelSettings.labelFontSize, defaultSettings.inlineLabelSettings.labelFontSize);
        settings.inlineLabelSettings.valueFontSize = clampFont((labelObj["valueFontSize"] as number) ?? settings.inlineLabelSettings.valueFontSize, defaultSettings.inlineLabelSettings.valueFontSize);
        settings.inlineLabelSettings.deltaFontSize = clampFont((labelObj["deltaFontSize"] as number) ?? settings.inlineLabelSettings.deltaFontSize, defaultSettings.inlineLabelSettings.deltaFontSize);

        const clampPad = (v: number, fallback: number): number => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(2, Math.min(24, n));
        };
        settings.inlineLabelSettings.labelPadding = clampPad((labelObj["labelPadding"] as number) ?? settings.inlineLabelSettings.labelPadding, defaultSettings.inlineLabelSettings.labelPadding);
        const clampGap = (v: number, fallback: number): number => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(0, Math.min(24, n));
        };
        settings.inlineLabelSettings.labelGap = clampGap((labelObj["labelGap"] as number) ?? settings.inlineLabelSettings.labelGap, defaultSettings.inlineLabelSettings.labelGap);

        const c = settings.inlineLabelSettings.content;
        if (c !== "name_value_delta" && c !== "name_value" && c !== "name_only" && c !== "value_delta") {
            settings.inlineLabelSettings.content = defaultSettings.inlineLabelSettings.content;
        }
        const d = settings.inlineLabelSettings.deltaMode;
        if (d !== "percent" && d !== "absolute" && d !== "both" && d !== "none") {
            settings.inlineLabelSettings.deltaMode = defaultSettings.inlineLabelSettings.deltaMode;
        }
    }

    // Point value labels
    const pointLabelsObj = objects["pointValueLabels"];
    if (pointLabelsObj) {
        settings.pointValueLabels.enabled = (pointLabelsObj["enabled"] as boolean) ?? defaultSettings.pointValueLabels.enabled;
        settings.pointValueLabels.density = (pointLabelsObj["density"] as PointValueLabelDensity) ?? defaultSettings.pointValueLabels.density;
        settings.pointValueLabels.fontSize = (pointLabelsObj["fontSize"] as number) ?? defaultSettings.pointValueLabels.fontSize;
        const c = pointLabelsObj["color"] as any;
        if (c?.solid?.color) settings.pointValueLabels.color = c.solid.color;
        settings.pointValueLabels.showBackground = (pointLabelsObj["showBackground"] as boolean) ?? defaultSettings.pointValueLabels.showBackground;
        const bg = pointLabelsObj["backgroundColor"] as any;
        if (bg?.solid?.color) settings.pointValueLabels.backgroundColor = bg.solid.color;
        settings.pointValueLabels.backgroundOpacity = (pointLabelsObj["backgroundOpacity"] as number) ?? defaultSettings.pointValueLabels.backgroundOpacity;
        settings.pointValueLabels.offset = (pointLabelsObj["offset"] as number) ?? defaultSettings.pointValueLabels.offset;

        const clampFont = (v: number, fallback: number): number => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(6, Math.min(40, n));
        };
        settings.pointValueLabels.fontSize = clampFont(settings.pointValueLabels.fontSize, defaultSettings.pointValueLabels.fontSize);

        const clampOpacity = (v: number, fallback: number): number => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(0, Math.min(1, n));
        };
        settings.pointValueLabels.backgroundOpacity = clampOpacity(settings.pointValueLabels.backgroundOpacity, defaultSettings.pointValueLabels.backgroundOpacity);

        const clampOffset = (v: number, fallback: number): number => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(0, Math.min(24, n));
        };
        settings.pointValueLabels.offset = clampOffset(settings.pointValueLabels.offset, defaultSettings.pointValueLabels.offset);

        if (settings.pointValueLabels.density !== "auto" && settings.pointValueLabels.density !== "all") {
            settings.pointValueLabels.density = defaultSettings.pointValueLabels.density;
        }
    }

    return settings;
}
