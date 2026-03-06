"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import {
    IBaseVisualSettings,
    ColorScheme,
    LegendPosition,
    RotateLabelsMode,
    defaultCustomColorSettings,
    defaultLegendSettings,
    defaultSmallMultiplesSettings,
    defaultTooltipSettings,
    TooltipStyle,
    TooltipTheme
} from "@pbi-visuals/shared";

export interface IJourneyTimelineSettings {
    showTodayLine: boolean;
    spineThickness: number;
    laneGap: number;
    cardBandHeight: number;
}

export interface IJourneyCardSettings {
    minWidth: number;
    maxWidth: number;
    cornerRadius: number;
    borderWidth: number;
    shadow: boolean;
}

export interface IJourneyTextSettings {
    titleFontSize: number;
    subtitleFontSize: number;
    titleColor: string;
    subtitleColor: string;
}

export interface IJourneyMarkerSettings {
    milestoneRadius: number;
    spanThickness: number;
    connectorOpacity: number;
}

export interface IStrategicJourneyVisualSettings extends IBaseVisualSettings {
    showLegend: boolean;
    timeline: IJourneyTimelineSettings;
    card: IJourneyCardSettings;
    text: IJourneyTextSettings;
    marker: IJourneyMarkerSettings;
}

export const defaultSettings: IStrategicJourneyVisualSettings = {
    colorScheme: "pastel",
    legendPosition: defaultLegendSettings.legendPosition as LegendPosition,
    legendFontSize: defaultLegendSettings.legendFontSize!,
    maxLegendItems: defaultLegendSettings.maxLegendItems!,
    showLegend: true,
    showXAxis: true,
    xAxisFontSize: 10,
    xAxisFontFamily: "Segoe UI",
    xAxisBold: false,
    xAxisItalic: false,
    xAxisUnderline: false,
    xAxisColor: "#64748b",
    showYAxis: false,
    yAxisFontSize: 10,
    yAxisFontFamily: "Segoe UI",
    yAxisBold: false,
    yAxisItalic: false,
    yAxisUnderline: false,
    yAxisColor: "#64748b",
    rotateXLabels: "auto",
    tooltip: { ...defaultTooltipSettings },
    useCustomColors: defaultCustomColorSettings.useCustomColors,
    customColors: [...defaultCustomColorSettings.customColors],
    smallMultiples: { ...defaultSmallMultiplesSettings },
    timeline: {
        showTodayLine: true,
        spineThickness: 2,
        laneGap: 26,
        cardBandHeight: 210
    },
    card: {
        minWidth: 120,
        maxWidth: 170,
        cornerRadius: 8,
        borderWidth: 1,
        shadow: true
    },
    text: {
        titleFontSize: 12,
        subtitleFontSize: 10,
        titleColor: "#1f2937",
        subtitleColor: "#64748b"
    },
    marker: {
        milestoneRadius: 7,
        spanThickness: 4,
        connectorOpacity: 0.42
    }
};

export function parseSettings(dataView: DataView): IStrategicJourneyVisualSettings {
    const objects = dataView?.metadata?.objects;
    const settings: IStrategicJourneyVisualSettings = JSON.parse(JSON.stringify(defaultSettings));

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
        settings.legendFontSize = Math.max(6, Math.min(40, Number(settings.legendFontSize) || defaultSettings.legendFontSize));
        settings.maxLegendItems = Math.max(1, Math.min(200, Number(settings.maxLegendItems) || defaultSettings.maxLegendItems));
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
            const parsed = colorListStr
                .split(",")
                .map(color => color.trim())
                .filter(color => color.length > 0 && (color.startsWith("#") || /^[a-fA-F0-9]{6}$/.test(color)));
            settings.customColors = parsed.map(color => color.startsWith("#") ? color : `#${color}`);
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

        settings.xAxisFontSize = Math.max(6, Math.min(24, Number(settings.xAxisFontSize) || defaultSettings.xAxisFontSize));
    }

    const timelineObj = objects["timelineSettings"];
    if (timelineObj) {
        settings.timeline.showTodayLine = (timelineObj["showTodayLine"] as boolean) ?? defaultSettings.timeline.showTodayLine;
        settings.timeline.spineThickness = (timelineObj["spineThickness"] as number) ?? defaultSettings.timeline.spineThickness;
        settings.timeline.laneGap = (timelineObj["laneGap"] as number) ?? defaultSettings.timeline.laneGap;
        settings.timeline.cardBandHeight = (timelineObj["cardBandHeight"] as number) ?? defaultSettings.timeline.cardBandHeight;

        settings.timeline.spineThickness = Math.max(1, Math.min(8, Number(settings.timeline.spineThickness) || defaultSettings.timeline.spineThickness));
        settings.timeline.laneGap = Math.max(10, Math.min(80, Number(settings.timeline.laneGap) || defaultSettings.timeline.laneGap));
        settings.timeline.cardBandHeight = Math.max(80, Math.min(500, Number(settings.timeline.cardBandHeight) || defaultSettings.timeline.cardBandHeight));
    }

    const cardObj = objects["cardSettings"];
    if (cardObj) {
        settings.card.minWidth = (cardObj["minWidth"] as number) ?? defaultSettings.card.minWidth;
        settings.card.maxWidth = (cardObj["maxWidth"] as number) ?? defaultSettings.card.maxWidth;
        settings.card.cornerRadius = (cardObj["cornerRadius"] as number) ?? defaultSettings.card.cornerRadius;
        settings.card.borderWidth = (cardObj["borderWidth"] as number) ?? defaultSettings.card.borderWidth;
        settings.card.shadow = (cardObj["shadow"] as boolean) ?? defaultSettings.card.shadow;

        settings.card.minWidth = Math.max(80, Math.min(300, Number(settings.card.minWidth) || defaultSettings.card.minWidth));
        settings.card.maxWidth = Math.max(settings.card.minWidth, Math.min(360, Number(settings.card.maxWidth) || defaultSettings.card.maxWidth));
        settings.card.cornerRadius = Math.max(0, Math.min(20, Number(settings.card.cornerRadius) || defaultSettings.card.cornerRadius));
        settings.card.borderWidth = Math.max(0, Math.min(4, Number(settings.card.borderWidth) || defaultSettings.card.borderWidth));
    }

    const textObj = objects["textSettings"];
    if (textObj) {
        settings.text.titleFontSize = (textObj["titleFontSize"] as number) ?? defaultSettings.text.titleFontSize;
        settings.text.subtitleFontSize = (textObj["subtitleFontSize"] as number) ?? defaultSettings.text.subtitleFontSize;
        const titleColor = textObj["titleColor"] as any;
        const subtitleColor = textObj["subtitleColor"] as any;
        if (titleColor?.solid?.color) settings.text.titleColor = titleColor.solid.color;
        if (subtitleColor?.solid?.color) settings.text.subtitleColor = subtitleColor.solid.color;

        settings.text.titleFontSize = Math.max(8, Math.min(36, Number(settings.text.titleFontSize) || defaultSettings.text.titleFontSize));
        settings.text.subtitleFontSize = Math.max(7, Math.min(32, Number(settings.text.subtitleFontSize) || defaultSettings.text.subtitleFontSize));
    }

    const markerObj = objects["markerSettings"];
    if (markerObj) {
        settings.marker.milestoneRadius = (markerObj["milestoneRadius"] as number) ?? defaultSettings.marker.milestoneRadius;
        settings.marker.spanThickness = (markerObj["spanThickness"] as number) ?? defaultSettings.marker.spanThickness;
        settings.marker.connectorOpacity = (markerObj["connectorOpacity"] as number) ?? defaultSettings.marker.connectorOpacity;

        settings.marker.milestoneRadius = Math.max(3, Math.min(20, Number(settings.marker.milestoneRadius) || defaultSettings.marker.milestoneRadius));
        settings.marker.spanThickness = Math.max(1, Math.min(12, Number(settings.marker.spanThickness) || defaultSettings.marker.spanThickness));
        settings.marker.connectorOpacity = Math.max(0.08, Math.min(1, Number(settings.marker.connectorOpacity) || defaultSettings.marker.connectorOpacity));
    }

    return settings;
}
