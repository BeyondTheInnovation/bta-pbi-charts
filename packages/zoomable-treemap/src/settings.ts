"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import {
    IBaseVisualSettings,
    ColorScheme,
    LegendPosition,
    RotateLabelsMode,
    defaultSmallMultiplesSettings,
    defaultLegendSettings,
    defaultCustomColorSettings,
    defaultTooltipSettings,
    defaultTextSizeSettings,
    ITextSizeSettings,
    TooltipStyle,
    TooltipTheme
} from "@pbi-visuals/shared";

export interface IVisualSettings extends IBaseVisualSettings {
    showLegend: boolean;
    textSizes: ITextSizeSettings;
    treemapBorderColor: string;
    treemapBorderWidth: number;
}

export const defaultSettings: IVisualSettings = {
    colorScheme: "vibrant",
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
    treemapBorderColor: "#ffffff",
    treemapBorderWidth: 2
};

export function parseSettings(dataView: DataView): IVisualSettings {
    const objects = dataView?.metadata?.objects;
    const settings: IVisualSettings = JSON.parse(JSON.stringify(defaultSettings));

    if (!objects) {
        return settings;
    }

    const treemapObj = objects["treemapAppearance"];
    if (treemapObj) {
        const bc = treemapObj["borderColor"] as any;
        if (bc?.solid?.color) settings.treemapBorderColor = bc.solid.color;
        const bw = treemapObj["borderWidth"] as number;
        if (bw != null) settings.treemapBorderWidth = Math.max(0, Math.min(8, Number(bw) || 0));
    }

    const colorSchemeObj = objects["colorScheme"];
    if (colorSchemeObj) {
        settings.colorScheme = (colorSchemeObj["scheme"] as ColorScheme) ?? defaultSettings.colorScheme;
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

    const legendObj = objects["legend"];
    if (legendObj) {
        settings.showLegend = (legendObj["show"] as boolean) ?? defaultSettings.showLegend;
        settings.legendPosition = (legendObj["position"] as LegendPosition) ?? defaultSettings.legendPosition;
        settings.legendFontSize = (legendObj["fontSize"] as number) ?? defaultSettings.legendFontSize;
        settings.maxLegendItems = (legendObj["maxItems"] as number) ?? defaultSettings.maxLegendItems;
    }

    const textSizesObj = objects["textSizes"];
    if (textSizesObj) {
        const clamp = (value: number): number => {
            const n = Number(value);
            if (!Number.isFinite(n) || n <= 0) return 0;
            return Math.max(6, Math.min(40, n));
        };

        settings.textSizes.xAxisFontSize = clamp((textSizesObj["xAxisFontSize"] as number) ?? settings.textSizes.xAxisFontSize);
        settings.textSizes.yAxisFontSize = clamp((textSizesObj["yAxisFontSize"] as number) ?? settings.textSizes.yAxisFontSize);
        settings.textSizes.legendFontSize = clamp((textSizesObj["legendFontSize"] as number) ?? settings.textSizes.legendFontSize);
        settings.textSizes.panelTitleFontSize = clamp((textSizesObj["panelTitleFontSize"] as number) ?? settings.textSizes.panelTitleFontSize);
    }

    const smallMultObj = objects["smallMultiples"];
    if (smallMultObj) {
        settings.smallMultiples.spacing = (smallMultObj["spacing"] as number) ?? defaultSettings.smallMultiples.spacing;
        settings.smallMultiples.showTitle = (smallMultObj["showTitle"] as boolean) ?? defaultSettings.smallMultiples.showTitle;
        settings.smallMultiples.titleFontSize = (smallMultObj["titleFontSize"] as number) ?? defaultSettings.smallMultiples.titleFontSize;
        settings.smallMultiples.titleSpacing = (smallMultObj["titleSpacing"] as number) ?? defaultSettings.smallMultiples.titleSpacing;

        settings.smallMultiples.spacing = Math.max(10, Math.min(200, Number(settings.smallMultiples.spacing) || defaultSettings.smallMultiples.spacing));
        settings.smallMultiples.titleFontSize = Math.max(6, Math.min(40, Number(settings.smallMultiples.titleFontSize) || defaultSettings.smallMultiples.titleFontSize));
        settings.smallMultiples.titleSpacing = Math.max(10, Math.min(120, Number(settings.smallMultiples.titleSpacing) || defaultSettings.smallMultiples.titleSpacing));
    }

    return settings;
}
