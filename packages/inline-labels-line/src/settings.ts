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
export type PointValueLabelPlacement = "floating" | "insideLine";
export type PointValue2Position = "below" | "above";
export type DateLogicCutoff = "today" | "now" | "custom";
export type DateLogicFutureStyle = "dotted" | "solid";
export type DateLogicPastStyle = "dimSeries" | "grey";
export type DateLogicApplyTo = "lineArea" | "lineOnly" | "everything";

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
    placement: PointValueLabelPlacement;
    showValue2: boolean;
    value2Position: PointValue2Position;
    density: PointValueLabelDensity;
    fontSize: number;
    color: string;
    value2FontSize: number;
    value2Color: string;
    valueLineGap: number;
    showBackground: boolean;
    backgroundColor: string;
    backgroundOpacity: number;
    offset: number;
    insideOffset: number;
    haloWidth: number;
}

export interface IDateLogicSettings {
    enabled: boolean;
    cutoff: DateLogicCutoff;
    customDate: string;
    futureStyle: DateLogicFutureStyle;
    pastStyle: DateLogicPastStyle;
    dimOpacity: number;
    applyTo: DateLogicApplyTo;
}

export interface IInlineLabelsLineVisualSettings extends IBaseVisualSettings {
    // Legend add-on
    showLegend: boolean;
    // Secondary Y axis (Value 2)
    showYAxis2: boolean;
    yAxis2FontSize: number;
    yAxis2FontFamily: string;
    yAxis2Bold: boolean;
    yAxis2Italic: boolean;
    yAxis2Underline: boolean;
    yAxis2Color: string;
    // Shared text sizes (0 = auto)
    textSizes: ITextSizeSettings;
    // Custom settings
    lineSettings: ILineSettings;
    markerSettings: IMarkerSettings;
    inlineLabelSettings: IInlineLabelSettings;
    pointValueLabels: IPointValueLabelSettings;
    dateLogic: IDateLogicSettings;
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

    // Auto-show when Value 2 is bound; user can still turn it off in formatting.
    showYAxis2: true,
    yAxis2FontSize: 11,
    yAxis2FontFamily: "Segoe UI",
    yAxis2Bold: false,
    yAxis2Italic: false,
    yAxis2Underline: false,
    yAxis2Color: "#6b7280",

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
        placement: "floating",
        showValue2: false,
        value2Position: "below",
        density: "auto",
        fontSize: 10,
        color: "#111827",
        value2FontSize: 10,
        value2Color: "#6b7280",
        valueLineGap: 2,
        showBackground: true,
        backgroundColor: "#ffffff",
        backgroundOpacity: 0.85,
        offset: 8,
        insideOffset: 2,
        haloWidth: 3
    },
    dateLogic: {
        enabled: false,
        cutoff: "today",
        customDate: "",
        futureStyle: "dotted",
        pastStyle: "dimSeries",
        dimOpacity: 0.35,
        applyTo: "lineArea"
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

    // Y-Axis (Value 2)
    const yAxis2Obj = objects["yAxis2Settings"];
    if (yAxis2Obj) {
        settings.showYAxis2 = (yAxis2Obj["show"] as boolean) ?? defaultSettings.showYAxis2;
        settings.yAxis2FontSize = (yAxis2Obj["fontSize"] as number) ?? defaultSettings.yAxis2FontSize;
        settings.yAxis2FontFamily = (yAxis2Obj["fontFamily"] as string) ?? defaultSettings.yAxis2FontFamily;
        settings.yAxis2Bold = (yAxis2Obj["bold"] as boolean) ?? defaultSettings.yAxis2Bold;
        settings.yAxis2Italic = (yAxis2Obj["italic"] as boolean) ?? defaultSettings.yAxis2Italic;
        settings.yAxis2Underline = (yAxis2Obj["underline"] as boolean) ?? defaultSettings.yAxis2Underline;
        const y2Color = yAxis2Obj["color"] as any;
        if (y2Color?.solid?.color) settings.yAxis2Color = y2Color.solid.color;
        settings.yAxis2FontSize = Math.max(6, Math.min(40, Number(settings.yAxis2FontSize) || defaultSettings.yAxis2FontSize));
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
        settings.pointValueLabels.placement = (pointLabelsObj["placement"] as PointValueLabelPlacement) ?? defaultSettings.pointValueLabels.placement;
        settings.pointValueLabels.showValue2 = (pointLabelsObj["showValue2"] as boolean) ?? defaultSettings.pointValueLabels.showValue2;
        settings.pointValueLabels.value2Position = (pointLabelsObj["value2Position"] as PointValue2Position) ?? defaultSettings.pointValueLabels.value2Position;
        settings.pointValueLabels.density = (pointLabelsObj["density"] as PointValueLabelDensity) ?? defaultSettings.pointValueLabels.density;
        settings.pointValueLabels.fontSize = (pointLabelsObj["fontSize"] as number) ?? defaultSettings.pointValueLabels.fontSize;
        const c = pointLabelsObj["color"] as any;
        if (c?.solid?.color) settings.pointValueLabels.color = c.solid.color;
        settings.pointValueLabels.value2FontSize = (pointLabelsObj["value2FontSize"] as number) ?? defaultSettings.pointValueLabels.value2FontSize;
        const c2 = pointLabelsObj["value2Color"] as any;
        if (c2?.solid?.color) settings.pointValueLabels.value2Color = c2.solid.color;
        settings.pointValueLabels.valueLineGap = (pointLabelsObj["valueLineGap"] as number) ?? defaultSettings.pointValueLabels.valueLineGap;
        settings.pointValueLabels.showBackground = (pointLabelsObj["showBackground"] as boolean) ?? defaultSettings.pointValueLabels.showBackground;
        const bg = pointLabelsObj["backgroundColor"] as any;
        if (bg?.solid?.color) settings.pointValueLabels.backgroundColor = bg.solid.color;
        settings.pointValueLabels.backgroundOpacity = (pointLabelsObj["backgroundOpacity"] as number) ?? defaultSettings.pointValueLabels.backgroundOpacity;
        settings.pointValueLabels.offset = (pointLabelsObj["offset"] as number) ?? defaultSettings.pointValueLabels.offset;
        settings.pointValueLabels.insideOffset = (pointLabelsObj["insideOffset"] as number) ?? defaultSettings.pointValueLabels.insideOffset;
        settings.pointValueLabels.haloWidth = (pointLabelsObj["haloWidth"] as number) ?? defaultSettings.pointValueLabels.haloWidth;

        if (settings.pointValueLabels.placement !== "floating" && settings.pointValueLabels.placement !== "insideLine") {
            settings.pointValueLabels.placement = defaultSettings.pointValueLabels.placement;
        }
        if (settings.pointValueLabels.value2Position !== "below" && settings.pointValueLabels.value2Position !== "above") {
            settings.pointValueLabels.value2Position = defaultSettings.pointValueLabels.value2Position;
        }

        const clampFont = (v: number, fallback: number): number => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(6, Math.min(40, n));
        };
        settings.pointValueLabels.fontSize = clampFont(settings.pointValueLabels.fontSize, defaultSettings.pointValueLabels.fontSize);
        settings.pointValueLabels.value2FontSize = clampFont(settings.pointValueLabels.value2FontSize, defaultSettings.pointValueLabels.value2FontSize);

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
        settings.pointValueLabels.valueLineGap = Math.max(0, Math.min(24, Number(settings.pointValueLabels.valueLineGap) || defaultSettings.pointValueLabels.valueLineGap));
        settings.pointValueLabels.insideOffset = Math.max(0, Math.min(24, Number(settings.pointValueLabels.insideOffset) || defaultSettings.pointValueLabels.insideOffset));
        settings.pointValueLabels.haloWidth = Math.max(0, Math.min(12, Number(settings.pointValueLabels.haloWidth) || defaultSettings.pointValueLabels.haloWidth));

        if (settings.pointValueLabels.density !== "auto" && settings.pointValueLabels.density !== "all") {
            settings.pointValueLabels.density = defaultSettings.pointValueLabels.density;
        }
    }

    // Date logic
    const dateLogicObj = objects["dateLogicSettings"];
    if (dateLogicObj) {
        settings.dateLogic.enabled = (dateLogicObj["enabled"] as boolean) ?? defaultSettings.dateLogic.enabled;
        settings.dateLogic.cutoff = (dateLogicObj["cutoff"] as DateLogicCutoff) ?? defaultSettings.dateLogic.cutoff;
        settings.dateLogic.customDate = (dateLogicObj["customDate"] as string) ?? defaultSettings.dateLogic.customDate;
        settings.dateLogic.futureStyle = (dateLogicObj["futureStyle"] as DateLogicFutureStyle) ?? defaultSettings.dateLogic.futureStyle;
        settings.dateLogic.pastStyle = (dateLogicObj["pastStyle"] as DateLogicPastStyle) ?? defaultSettings.dateLogic.pastStyle;
        settings.dateLogic.dimOpacity = (dateLogicObj["dimOpacity"] as number) ?? defaultSettings.dateLogic.dimOpacity;
        settings.dateLogic.applyTo = (dateLogicObj["applyTo"] as DateLogicApplyTo) ?? defaultSettings.dateLogic.applyTo;

        const clamp01 = (v: number, fallback: number): number => {
            const n = Number(v);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(0, Math.min(1, n));
        };
        settings.dateLogic.dimOpacity = clamp01(settings.dateLogic.dimOpacity, defaultSettings.dateLogic.dimOpacity);

        if (settings.dateLogic.cutoff !== "today" && settings.dateLogic.cutoff !== "now" && settings.dateLogic.cutoff !== "custom") {
            settings.dateLogic.cutoff = defaultSettings.dateLogic.cutoff;
        }
        if (settings.dateLogic.futureStyle !== "dotted" && settings.dateLogic.futureStyle !== "solid") {
            settings.dateLogic.futureStyle = defaultSettings.dateLogic.futureStyle;
        }
        if (settings.dateLogic.pastStyle !== "dimSeries" && settings.dateLogic.pastStyle !== "grey") {
            settings.dateLogic.pastStyle = defaultSettings.dateLogic.pastStyle;
        }
        if (settings.dateLogic.applyTo !== "lineArea" && settings.dateLogic.applyTo !== "lineOnly" && settings.dateLogic.applyTo !== "everything") {
            settings.dateLogic.applyTo = defaultSettings.dateLogic.applyTo;
        }
    }

    return settings;
}
