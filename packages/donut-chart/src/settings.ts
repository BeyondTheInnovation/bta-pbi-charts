"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import {
    IBaseVisualSettings,
    ColorScheme,
    LegendPosition,
    defaultSmallMultiplesSettings,
    defaultLegendSettings,
    defaultCustomColorSettings,
    defaultFontScaleFactor,
    defaultTooltipSettings,
    TooltipStyle,
    TooltipTheme
} from "@pbi-visuals/shared";

export type CenterValueMode = "total" | "none";
export type DonutLabelMode = "category" | "value" | "percent" | "categoryPercent";
export type DonutLabelPosition = "inside" | "outside";

export interface IDonutSettings {
    innerRadiusRatio: number;
    padAngle: number; // radians
    cornerRadius: number;
    roundedCorners: boolean;
    showCenter: boolean;
    centerLabel: string;
    centerValueMode: CenterValueMode;
    enableHover: boolean;
    showZeroSlices: boolean;
}

export interface IDonutLabelSettings {
    showLabels: boolean;
    autoFit: boolean;
    minFontSize: number;
    overflowToOutside: boolean;
    labelMode: DonutLabelMode;
    labelPosition: DonutLabelPosition;
    minLabelAngle: number; // radians
}

export interface IDonutTextSizeSettings {
    legendFontSize: number;
    panelTitleFontSize: number;
    sliceLabelFontSize: number;
    centerLabelFontSize: number;
    centerValueFontSize: number;
}

export interface IDonutVisualSettings extends IBaseVisualSettings {
    donut: IDonutSettings;
    donutLabels: IDonutLabelSettings;
    textSizes: IDonutTextSizeSettings;
}

export const defaultSettings: IDonutVisualSettings = {
    colorScheme: "rainbow",
    showLegend: true,
    legendPosition: "bottom",
    legendFontSize: defaultLegendSettings.legendFontSize!,
    maxLegendItems: defaultLegendSettings.maxLegendItems!,
    showXAxis: false,
    xAxisFontSize: 10,
    showYAxis: false,
    yAxisFontSize: 11,
    rotateXLabels: "never",
    responsiveText: true,
    fontScaleFactor: defaultFontScaleFactor,
    tooltip: { ...defaultTooltipSettings },
    useCustomColors: defaultCustomColorSettings.useCustomColors,
    customColors: [...defaultCustomColorSettings.customColors],
    donut: {
        innerRadiusRatio: 0.67,
        padAngle: 0.02,
        cornerRadius: 6,
        roundedCorners: true,
        showCenter: true,
        centerLabel: "Total",
        centerValueMode: "total",
        enableHover: true,
        showZeroSlices: false
    },
    donutLabels: {
        showLabels: true,
        autoFit: true,
        minFontSize: 9,
        overflowToOutside: true,
        labelMode: "categoryPercent",
        labelPosition: "inside",
        minLabelAngle: 0.25
    },
    textSizes: {
        legendFontSize: 0,
        panelTitleFontSize: 0,
        sliceLabelFontSize: 0,
        centerLabelFontSize: 0,
        centerValueFontSize: 0
    },
    smallMultiples: { ...defaultSmallMultiplesSettings }
};

export function parseSettings(dataView: DataView): IDonutVisualSettings {
    const objects = dataView?.metadata?.objects;
    const settings: IDonutVisualSettings = JSON.parse(JSON.stringify(defaultSettings));

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

    const generalObj = objects["general"];
    if (generalObj) {
        settings.responsiveText = (generalObj["responsiveText"] as boolean) ?? defaultSettings.responsiveText;
        settings.fontScaleFactor = (generalObj["fontScaleFactor"] as number) ?? defaultSettings.fontScaleFactor;
        settings.fontScaleFactor = Math.max(0.5, Math.min(2.0, settings.fontScaleFactor));
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

    const donutObj = objects["donutSettings"];
    if (donutObj) {
        settings.donut.innerRadiusRatio = (donutObj["innerRadiusRatio"] as number) ?? defaultSettings.donut.innerRadiusRatio;
        settings.donut.padAngle = (donutObj["padAngle"] as number) ?? defaultSettings.donut.padAngle;
        settings.donut.cornerRadius = (donutObj["cornerRadius"] as number) ?? defaultSettings.donut.cornerRadius;
        settings.donut.roundedCorners = (donutObj["roundedCorners"] as boolean) ?? defaultSettings.donut.roundedCorners;
        settings.donut.showCenter = (donutObj["showCenter"] as boolean) ?? defaultSettings.donut.showCenter;
        settings.donut.centerLabel = (donutObj["centerLabel"] as string) ?? defaultSettings.donut.centerLabel;
        settings.donut.centerValueMode = (donutObj["centerValueMode"] as CenterValueMode) ?? defaultSettings.donut.centerValueMode;
        settings.donut.enableHover = (donutObj["enableHover"] as boolean) ?? defaultSettings.donut.enableHover;
        settings.donut.showZeroSlices = (donutObj["showZeroSlices"] as boolean) ?? defaultSettings.donut.showZeroSlices;

        settings.donut.innerRadiusRatio = Math.max(0.2, Math.min(0.85, settings.donut.innerRadiusRatio));
        settings.donut.padAngle = Math.max(0, Math.min(0.12, settings.donut.padAngle));
        settings.donut.cornerRadius = Math.max(0, Math.min(20, settings.donut.cornerRadius));
        settings.donut.centerLabel = (settings.donut.centerLabel ?? "").toString();
    }

    const labelsObj = objects["donutLabels"];
    if (labelsObj) {
        settings.donutLabels.showLabels = (labelsObj["showLabels"] as boolean) ?? defaultSettings.donutLabels.showLabels;
        settings.donutLabels.autoFit = (labelsObj["autoFit"] as boolean) ?? defaultSettings.donutLabels.autoFit;
        settings.donutLabels.minFontSize = (labelsObj["minFontSize"] as number) ?? defaultSettings.donutLabels.minFontSize;
        settings.donutLabels.overflowToOutside = (labelsObj["overflowToOutside"] as boolean) ?? defaultSettings.donutLabels.overflowToOutside;
        settings.donutLabels.labelMode = (labelsObj["labelMode"] as DonutLabelMode) ?? defaultSettings.donutLabels.labelMode;
        settings.donutLabels.labelPosition = (labelsObj["labelPosition"] as DonutLabelPosition) ?? defaultSettings.donutLabels.labelPosition;
        settings.donutLabels.minLabelAngle = (labelsObj["minLabelAngle"] as number) ?? defaultSettings.donutLabels.minLabelAngle;
        settings.donutLabels.minLabelAngle = Math.max(0, Math.min(Math.PI, settings.donutLabels.minLabelAngle));

        settings.donutLabels.minFontSize = Math.max(4, Math.min(16, settings.donutLabels.minFontSize));
    }

    const textSizesObj = objects["textSizes"];
    if (textSizesObj) {
        settings.textSizes.legendFontSize = (textSizesObj["legendFontSize"] as number) ?? defaultSettings.textSizes.legendFontSize;
        settings.textSizes.panelTitleFontSize = (textSizesObj["panelTitleFontSize"] as number) ?? defaultSettings.textSizes.panelTitleFontSize;
        settings.textSizes.sliceLabelFontSize = (textSizesObj["sliceLabelFontSize"] as number) ?? defaultSettings.textSizes.sliceLabelFontSize;
        settings.textSizes.centerLabelFontSize = (textSizesObj["centerLabelFontSize"] as number) ?? defaultSettings.textSizes.centerLabelFontSize;
        settings.textSizes.centerValueFontSize = (textSizesObj["centerValueFontSize"] as number) ?? defaultSettings.textSizes.centerValueFontSize;

        const clamp = (v: number): number => v === 0 ? 0 : Math.max(8, Math.min(32, v));
        settings.textSizes.legendFontSize = clamp(settings.textSizes.legendFontSize);
        settings.textSizes.panelTitleFontSize = clamp(settings.textSizes.panelTitleFontSize);
        settings.textSizes.sliceLabelFontSize = clamp(settings.textSizes.sliceLabelFontSize);
        settings.textSizes.centerLabelFontSize = clamp(settings.textSizes.centerLabelFontSize);
        settings.textSizes.centerValueFontSize = clamp(settings.textSizes.centerValueFontSize);
    }

    const smallMultObj = objects["smallMultiples"];
    if (smallMultObj) {
        settings.smallMultiples.columns = (smallMultObj["columns"] as number) ?? defaultSettings.smallMultiples.columns;
        settings.smallMultiples.spacing = (smallMultObj["spacing"] as number) ?? defaultSettings.smallMultiples.spacing;
        settings.smallMultiples.showTitle = (smallMultObj["showTitle"] as boolean) ?? defaultSettings.smallMultiples.showTitle;
        settings.smallMultiples.titleFontSize = (smallMultObj["titleFontSize"] as number) ?? defaultSettings.smallMultiples.titleFontSize;
        settings.smallMultiples.titleSpacing = (smallMultObj["titleSpacing"] as number) ?? defaultSettings.smallMultiples.titleSpacing;
        settings.smallMultiples.columns = Math.max(1, Math.min(6, settings.smallMultiples.columns));
        settings.smallMultiples.spacing = Math.max(10, Math.min(60, settings.smallMultiples.spacing));
        settings.smallMultiples.titleSpacing = Math.max(10, Math.min(60, settings.smallMultiples.titleSpacing));
    }

    return settings;
}
