"use strict";

import powerbi from "powerbi-visuals-api";
import ISelectionId = powerbi.visuals.ISelectionId;
import DataView = powerbi.DataView;
import { ColorScheme, RotateLabelsMode } from "./settings";

/**
 * Gets the array of colors for a given color scheme.
 */
export function getSchemeColors(colorScheme: ColorScheme): string[] {
    switch (colorScheme) {
        case "blues":
            return ["#08519c", "#3182bd", "#6baed6", "#9ecae1", "#c6dbef", "#deebf7"];
        case "greens":
            return ["#006d2c", "#31a354", "#74c476", "#a1d99b", "#c7e9c0", "#e5f5e0"];
        case "reds":
            return ["#a50f15", "#de2d26", "#fb6a4a", "#fc9272", "#fcbba1", "#fee5d9"];
        case "purples":
            return ["#54278f", "#756bb1", "#9e9ac8", "#bcbddc", "#dadaeb", "#f2f0f7"];
        case "warm":
            return ["#bd0026", "#f03b20", "#fd8d3c", "#fecc5c", "#ffffb2", "#ffffcc"];
        case "oranges":
            return ["#d94701", "#f16913", "#fd8d3c", "#fdae6b", "#fdd0a2", "#feedde"];
        case "teals":
            return ["#0d9488", "#14b8a6", "#2dd4bf", "#5eead4", "#99f6e4", "#ccfbf1"];
        case "pinks":
            return ["#be185d", "#db2777", "#ec4899", "#f472b6", "#f9a8d4", "#fce7f3"];
        case "rainbow":
            return ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"];
        case "pastel":
            return ["#fcd34d", "#a3e635", "#34d399", "#22d3ee", "#a78bfa", "#f472b6"];
        case "vibrant":
            return ["#f43f5e", "#f97316", "#facc15", "#4ade80", "#22d3ee", "#a855f7"];
        default:
            return ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];
    }
}

/**
 * Creates a FormattingCard for Data Colors with individual color pickers for each category.
 */
export function createDataColorsCard(
    categories: string[],
    categorySelectionIds: Map<string, ISelectionId>,
    categoryColors: Map<string, string>,
    defaultColors: string[]
): powerbi.visuals.FormattingCard {
    const slices: powerbi.visuals.FormattingSlice[] = categories.map((category, index) => {
        const selectionId = categorySelectionIds.get(category);
        const currentColor = categoryColors.get(category) || defaultColors[index % defaultColors.length];

        return {
            uid: `dataColors_${category}_${index}`,
            displayName: category,
            control: {
                type: powerbi.visuals.FormattingComponent.ColorPicker,
                properties: {
                    descriptor: {
                        objectName: "categoryColors",
                        propertyName: "fill",
                        selector: selectionId ? selectionId.getSelector() : null
                    },
                    value: { value: currentColor }
                }
            }
        } as powerbi.visuals.FormattingSlice;
    });

    return {
        displayName: "Data Colors",
        uid: "dataColors_card",
        groups: [{
            displayName: "Colors",
            uid: "dataColors_group",
            slices: slices
        }]
    };
}

/**
 * Reads category colors from dataView objects.
 */
export function readCategoryColorsFromDataView(
    dataView: DataView,
    categoryIndex: number
): Map<string, string> {
    const colorMap = new Map<string, string>();

    if (!dataView?.categorical?.categories?.[categoryIndex]) {
        return colorMap;
    }

    const categoryColumn = dataView.categorical.categories[categoryIndex];
    const objects = categoryColumn.objects;

    if (!objects) {
        return colorMap;
    }

    for (let i = 0; i < categoryColumn.values.length; i++) {
        const categoryValue = String(categoryColumn.values[i] ?? "");
        const obj = objects[i];

        if (obj?.categoryColors?.fill) {
            const fill = obj.categoryColors.fill as { solid?: { color?: string } };
            if (fill.solid?.color) {
                colorMap.set(categoryValue, fill.solid.color);
            }
        }
    }

    return colorMap;
}

/**
 * Finds the index of the category column based on role name.
 */
export function findCategoryIndex(dataView: DataView, roleName: string): number {
    if (!dataView?.categorical?.categories) {
        return -1;
    }

    return dataView.categorical.categories.findIndex(
        cat => cat.source.roles && cat.source.roles[roleName]
    );
}

/**
 * Creates a FormattingCard for gradient Data Colors.
 */
export function createGradientColorsCard(
    minColor: string,
    maxColor: string,
    objectName: string = "calendarSettings"
): powerbi.visuals.FormattingCard {
    return {
        displayName: "Data Colors",
        uid: "dataColors_card",
        groups: [{
            displayName: "Gradient",
            uid: "dataColors_gradient_group",
            slices: [
                {
                    uid: "dataColors_minColor",
                    displayName: "Min Color",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ColorPicker,
                        properties: {
                            descriptor: { objectName: objectName, propertyName: "minColor" },
                            value: { value: minColor }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "dataColors_maxColor",
                    displayName: "Max Color",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ColorPicker,
                        properties: {
                            descriptor: { objectName: objectName, propertyName: "maxColor" },
                            value: { value: maxColor }
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

// ============================================================================
// FORMATTING MODEL BUILDERS
// ============================================================================

/**
 * Creates a Text Sizes formatting card with font size controls
 */
export function createTextSizesCard(settings: {
    xAxisFontSize?: number;
    yAxisFontSize?: number;
    legendFontSize?: number;
    panelTitleFontSize?: number;
    endLabelFontSize?: number;
    valueLabelFontSize?: number;
    yearLabelFontSize?: number;
    monthLabelFontSize?: number;
    dayLabelFontSize?: number;
}): powerbi.visuals.FormattingCard {
    const slices: powerbi.visuals.FormattingSlice[] = [];

    if (settings.xAxisFontSize !== undefined) {
        slices.push({
            uid: "textSizes_xAxis",
            displayName: "X-Axis Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "textSizes", propertyName: "xAxisFontSize" },
                    value: settings.xAxisFontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.yAxisFontSize !== undefined) {
        slices.push({
            uid: "textSizes_yAxis",
            displayName: "Y-Axis Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "textSizes", propertyName: "yAxisFontSize" },
                    value: settings.yAxisFontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.legendFontSize !== undefined) {
        slices.push({
            uid: "textSizes_legend",
            displayName: "Legend Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "textSizes", propertyName: "legendFontSize" },
                    value: settings.legendFontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.panelTitleFontSize !== undefined) {
        slices.push({
            uid: "textSizes_panelTitle",
            displayName: "Panel Title Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "textSizes", propertyName: "panelTitleFontSize" },
                    value: settings.panelTitleFontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.endLabelFontSize !== undefined) {
        slices.push({
            uid: "textSizes_endLabel",
            displayName: "End Label Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "textSizes", propertyName: "endLabelFontSize" },
                    value: settings.endLabelFontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.valueLabelFontSize !== undefined) {
        slices.push({
            uid: "textSizes_valueLabel",
            displayName: "Value Label Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "textSizes", propertyName: "valueLabelFontSize" },
                    value: settings.valueLabelFontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.yearLabelFontSize !== undefined) {
        slices.push({
            uid: "textSizes_yearLabel",
            displayName: "Year Label Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "textSizes", propertyName: "yearLabelFontSize" },
                    value: settings.yearLabelFontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.monthLabelFontSize !== undefined) {
        slices.push({
            uid: "textSizes_monthLabel",
            displayName: "Month Label Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "textSizes", propertyName: "monthLabelFontSize" },
                    value: settings.monthLabelFontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.dayLabelFontSize !== undefined) {
        slices.push({
            uid: "textSizes_dayLabel",
            displayName: "Day Label Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "textSizes", propertyName: "dayLabelFontSize" },
                    value: settings.dayLabelFontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    return {
        displayName: "Text Sizes",
        uid: "textSizes_card",
        groups: [{
            displayName: "Font Sizes",
            uid: "textSizes_group",
            slices
        }]
    };
}

/**
 * Creates an X-Axis Settings formatting card
 */
export function createXAxisCard(settings: {
    show: boolean;
    fontSize?: number;
    rotateLabels?: RotateLabelsMode;
}): powerbi.visuals.FormattingCard {
    const slices: powerbi.visuals.FormattingSlice[] = [
        {
            uid: "xAxis_show",
            displayName: "Show X-Axis",
            control: {
                type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                properties: {
                    descriptor: { objectName: "xAxisSettings", propertyName: "show" },
                    value: settings.show
                }
            }
        } as powerbi.visuals.FormattingSlice
    ];

    if (settings.fontSize !== undefined) {
        slices.push({
            uid: "xAxis_fontSize",
            displayName: "Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "xAxisSettings", propertyName: "fontSize" },
                    value: settings.fontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.rotateLabels !== undefined) {
        slices.push({
            uid: "xAxis_rotateLabels",
            displayName: "Rotate Labels",
            control: {
                type: powerbi.visuals.FormattingComponent.Dropdown,
                properties: {
                    descriptor: { objectName: "xAxisSettings", propertyName: "rotateLabels" },
                    value: settings.rotateLabels
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    return {
        displayName: "X-Axis",
        uid: "xAxis_card",
        groups: [{
            displayName: "X-Axis Settings",
            uid: "xAxis_group",
            slices
        }]
    };
}

/**
 * Creates a Y-Axis Settings formatting card
 */
export function createYAxisCard(settings: {
    show: boolean;
    fontSize?: number;
}): powerbi.visuals.FormattingCard {
    const slices: powerbi.visuals.FormattingSlice[] = [
        {
            uid: "yAxis_show",
            displayName: "Show Y-Axis",
            control: {
                type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                properties: {
                    descriptor: { objectName: "yAxisSettings", propertyName: "show" },
                    value: settings.show
                }
            }
        } as powerbi.visuals.FormattingSlice
    ];

    if (settings.fontSize !== undefined) {
        slices.push({
            uid: "yAxis_fontSize",
            displayName: "Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "yAxisSettings", propertyName: "fontSize" },
                    value: settings.fontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    return {
        displayName: "Y-Axis",
        uid: "yAxis_card",
        groups: [{
            displayName: "Y-Axis Settings",
            uid: "yAxis_group",
            slices
        }]
    };
}

/**
 * Creates a Legend formatting card
 */
export function createLegendCard(settings: {
    show: boolean;
    position?: string;
    fontSize?: number;
    maxItems?: number;
}): powerbi.visuals.FormattingCard {
    const slices: powerbi.visuals.FormattingSlice[] = [
        {
            uid: "legend_show",
            displayName: "Show Legend",
            control: {
                type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                properties: {
                    descriptor: { objectName: "legend", propertyName: "show" },
                    value: settings.show
                }
            }
        } as powerbi.visuals.FormattingSlice
    ];

    if (settings.position !== undefined) {
        slices.push({
            uid: "legend_position",
            displayName: "Position",
            control: {
                type: powerbi.visuals.FormattingComponent.Dropdown,
                properties: {
                    descriptor: { objectName: "legend", propertyName: "position" },
                    value: settings.position
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.fontSize !== undefined) {
        slices.push({
            uid: "legend_fontSize",
            displayName: "Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "legend", propertyName: "fontSize" },
                    value: settings.fontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.maxItems !== undefined) {
        slices.push({
            uid: "legend_maxItems",
            displayName: "Max Items",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "legend", propertyName: "maxItems" },
                    value: settings.maxItems
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    return {
        displayName: "Legend",
        uid: "legend_card",
        groups: [{
            displayName: "Legend Settings",
            uid: "legend_group",
            slices
        }]
    };
}

/**
 * Creates a Small Multiples formatting card
 */
export function createSmallMultiplesCard(settings: {
    columns?: number;
    spacing?: number;
    showTitle?: boolean;
    titleFontSize?: number;
    titleSpacing?: number;
}): powerbi.visuals.FormattingCard {
    const slices: powerbi.visuals.FormattingSlice[] = [];

    if (settings.columns !== undefined) {
        slices.push({
            uid: "smallMultiples_columns",
            displayName: "Columns",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "smallMultiples", propertyName: "columns" },
                    value: settings.columns
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.spacing !== undefined) {
        slices.push({
            uid: "smallMultiples_spacing",
            displayName: "Spacing",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "smallMultiples", propertyName: "spacing" },
                    value: settings.spacing
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.showTitle !== undefined) {
        slices.push({
            uid: "smallMultiples_showTitle",
            displayName: "Show Panel Titles",
            control: {
                type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                properties: {
                    descriptor: { objectName: "smallMultiples", propertyName: "showTitle" },
                    value: settings.showTitle
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.titleFontSize !== undefined) {
        slices.push({
            uid: "smallMultiples_titleFontSize",
            displayName: "Title Font Size",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "smallMultiples", propertyName: "titleFontSize" },
                    value: settings.titleFontSize
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.titleSpacing !== undefined) {
        slices.push({
            uid: "smallMultiples_titleSpacing",
            displayName: "Title Spacing",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "smallMultiples", propertyName: "titleSpacing" },
                    value: settings.titleSpacing
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    return {
        displayName: "Small Multiples",
        uid: "smallMultiples_card",
        groups: [{
            displayName: "Layout",
            uid: "smallMultiples_group",
            slices
        }]
    };
}

/**
 * Creates a Color Scheme formatting card
 */
export function createColorSchemeCard(currentScheme: ColorScheme): powerbi.visuals.FormattingCard {
    return {
        displayName: "Color Scheme",
        uid: "colorScheme_card",
        groups: [{
            displayName: "Colors",
            uid: "colorScheme_group",
            slices: [{
                uid: "colorScheme_scheme",
                displayName: "Color Scheme",
                control: {
                    type: powerbi.visuals.FormattingComponent.Dropdown,
                    properties: {
                        descriptor: { objectName: "colorScheme", propertyName: "scheme" },
                        value: currentScheme
                    }
                }
            } as powerbi.visuals.FormattingSlice]
        }]
    };
}

/**
 * Creates a General Settings formatting card
 */
export function createGeneralCard(settings: {
    responsiveText?: boolean;
    fontScaleFactor?: number;
}): powerbi.visuals.FormattingCard {
    const slices: powerbi.visuals.FormattingSlice[] = [];

    if (settings.responsiveText !== undefined) {
        slices.push({
            uid: "general_responsiveText",
            displayName: "Responsive Text",
            control: {
                type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                properties: {
                    descriptor: { objectName: "general", propertyName: "responsiveText" },
                    value: settings.responsiveText
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    if (settings.fontScaleFactor !== undefined) {
        slices.push({
            uid: "general_fontScaleFactor",
            displayName: "Font Scale Factor",
            control: {
                type: powerbi.visuals.FormattingComponent.NumUpDown,
                properties: {
                    descriptor: { objectName: "general", propertyName: "fontScaleFactor" },
                    value: settings.fontScaleFactor
                }
            }
        } as powerbi.visuals.FormattingSlice);
    }

    return {
        displayName: "General",
        uid: "general_card",
        groups: [{
            displayName: "Settings",
            uid: "general_group",
            slices
        }]
    };
}

/**
 * Creates a Bump Chart Settings formatting card
 */
export function createBumpChartSettingsCard(settings: {
    lineThickness: number;
    showMarkers: boolean;
    markerSize: number;
}): powerbi.visuals.FormattingCard {
    return {
        displayName: "Bump Chart",
        uid: "bumpChart_card",
        groups: [{
            displayName: "Line Settings",
            uid: "bumpChart_group",
            slices: [
                {
                    uid: "bumpChart_lineThickness",
                    displayName: "Line Thickness",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "bumpChartSettings", propertyName: "lineThickness" },
                            value: settings.lineThickness
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "bumpChart_showMarkers",
                    displayName: "Show Markers",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "bumpChartSettings", propertyName: "showMarkers" },
                            value: settings.showMarkers
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "bumpChart_markerSize",
                    displayName: "Marker Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "bumpChartSettings", propertyName: "markerSize" },
                            value: settings.markerSize
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

/**
 * Creates a Heatmap Settings formatting card
 */
export function createHeatmapSettingsCard(settings: {
    cellPadding: number;
    showValues: boolean;
    horizontalAlignment: "left" | "center" | "right";
    verticalAlignment: "top" | "center" | "bottom";
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
}): powerbi.visuals.FormattingCard {
    return {
        displayName: "Heatmap",
        uid: "heatmap_card",
        groups: [{
            displayName: "Layout",
            uid: "heatmap_group",
            slices: [
                {
                    uid: "heatmap_cellPadding",
                    displayName: "Cell Padding",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "heatmapSettings", propertyName: "cellPadding" },
                            value: settings.cellPadding
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "heatmap_showValues",
                    displayName: "Show Values",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "heatmapSettings", propertyName: "showValues" },
                            value: settings.showValues
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "heatmap_horizontalAlignment",
                    displayName: "Horizontal Alignment",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "heatmapSettings", propertyName: "horizontalAlignment" },
                            value: settings.horizontalAlignment
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "heatmap_verticalAlignment",
                    displayName: "Vertical Alignment",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "heatmapSettings", propertyName: "verticalAlignment" },
                            value: settings.verticalAlignment
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "heatmap_marginTop",
                    displayName: "Top Margin",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "heatmapSettings", propertyName: "marginTop" },
                            value: settings.marginTop
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "heatmap_marginBottom",
                    displayName: "Bottom Margin",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "heatmapSettings", propertyName: "marginBottom" },
                            value: settings.marginBottom
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "heatmap_marginLeft",
                    displayName: "Left Margin",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "heatmapSettings", propertyName: "marginLeft" },
                            value: settings.marginLeft
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "heatmap_marginRight",
                    displayName: "Right Margin",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "heatmapSettings", propertyName: "marginRight" },
                            value: settings.marginRight
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

/**
 * Creates a Streamgraph Settings formatting card
 */
export function createStreamgraphSettingsCard(settings: {
    curveSmoothing: boolean;
    opacity: number;
}): powerbi.visuals.FormattingCard {
    return {
        displayName: "Streamgraph",
        uid: "streamgraph_card",
        groups: [{
            displayName: "Appearance",
            uid: "streamgraph_group",
            slices: [
                {
                    uid: "streamgraph_curveSmoothing",
                    displayName: "Smooth Curves",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "streamgraphSettings", propertyName: "curveSmoothing" },
                            value: settings.curveSmoothing
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "streamgraph_opacity",
                    displayName: "Opacity",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "streamgraphSettings", propertyName: "opacity" },
                            value: settings.opacity
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

/**
 * Creates a Packed Bubble Settings formatting card
 */
export function createBubbleSettingsCard(settings: {
    minBubbleSize: number;
    maxBubbleSize: number;
    showLabels: boolean;
    clusterByCategory: boolean;
    labelSizeMode: "auto" | "fixed";
    labelFontSize: number;
    minLabelFontSize: number;
    maxLabelFontSize: number;
}): powerbi.visuals.FormattingCard {
    return {
        displayName: "Packed Bubble",
        uid: "bubble_card",
        groups: [{
            displayName: "Bubbles",
            uid: "bubble_group",
            slices: [
                {
                    uid: "bubble_minBubbleSize",
                    displayName: "Min Bubble Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "bubbleSettings", propertyName: "minBubbleSize" },
                            value: settings.minBubbleSize
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "bubble_maxBubbleSize",
                    displayName: "Max Bubble Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "bubbleSettings", propertyName: "maxBubbleSize" },
                            value: settings.maxBubbleSize
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "bubble_clusterByCategory",
                    displayName: "Cluster by Category",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "bubbleSettings", propertyName: "clusterByCategory" },
                            value: settings.clusterByCategory
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "bubble_showLabels",
                    displayName: "Show Labels",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "bubbleSettings", propertyName: "showLabels" },
                            value: settings.showLabels
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "bubble_labelSizeMode",
                    displayName: "Label Size Mode",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "bubbleSettings", propertyName: "labelSizeMode" },
                            value: settings.labelSizeMode
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "bubble_labelFontSize",
                    displayName: "Label Font Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "bubbleSettings", propertyName: "labelFontSize" },
                            value: settings.labelFontSize
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "bubble_minLabelFontSize",
                    displayName: "Min Label Font Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "bubbleSettings", propertyName: "minLabelFontSize" },
                            value: settings.minLabelFontSize
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "bubble_maxLabelFontSize",
                    displayName: "Max Label Font Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "bubbleSettings", propertyName: "maxLabelFontSize" },
                            value: settings.maxLabelFontSize
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

/**
 * Creates a Calendar Heatmap Settings formatting card
 */
export function createCalendarSettingsCard(settings: {
    cellSize: string;
    showMonthLabels: boolean;
    weekStartsOn: string;
}): powerbi.visuals.FormattingCard {
    return {
        displayName: "Calendar Heatmap",
        uid: "calendar_card",
        groups: [{
            displayName: "Layout",
            uid: "calendar_group",
            slices: [
                {
                    uid: "calendar_cellSize",
                    displayName: "Cell Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "calendarSettings", propertyName: "cellSize" },
                            value: settings.cellSize
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "calendar_weekStartsOn",
                    displayName: "Week Starts On",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "calendarSettings", propertyName: "weekStartsOn" },
                            value: settings.weekStartsOn
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "calendar_showMonthLabels",
                    displayName: "Show Month Labels",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "calendarSettings", propertyName: "showMonthLabels" },
                            value: settings.showMonthLabels
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}
