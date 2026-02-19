"use strict";

import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ITooltipService = powerbi.extensibility.ITooltipService;
import ISelectionId = powerbi.visuals.ISelectionId;

import {
    d3,
    createExportControl,
    ExportControl,
    RenderContext,
    createDataColorsCard,
    createSmallMultiplesCard,
    createTextSizesCard,
    createTooltipCard,
    createXAxisCard,
    createYAxisCard,
    findCategoryIndex,
    getSchemeColors,
    readCategoryColorsFromDataView,
    HtmlTooltip,
    bindSelectionByDataKey
} from "@pbi-visuals/shared";

import { IInlineLabelsLineVisualSettings, parseSettings } from "./settings";
import { InlineLabelsLineTransformer } from "./InlineLabelsLineTransformer";
import { InlineLabelsLineRenderer } from "./InlineLabelsLineRenderer";

function findCategoryIndicesForRole(dataView: powerbi.DataView, roleName: string): number[] {
    const indices: number[] = [];
    const cats = dataView?.categorical?.categories;
    if (!cats) return indices;
    for (let i = 0; i < cats.length; i++) {
        const roles = cats[i]?.source?.roles;
        if (roles && roles[roleName]) indices.push(i);
    }
    return indices;
}

function createLineSettingsCard(settings: IInlineLabelsLineVisualSettings["lineSettings"]): powerbi.visuals.FormattingCard {
    return {
        displayName: "Lines & Fill",
        uid: "lineSettings_card",
        groups: [{
            displayName: "Settings",
            uid: "lineSettings_group",
            slices: [
                {
                    uid: "line_curve",
                    displayName: "Curve",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "lineSettings", propertyName: "curve" },
                            value: settings.curve
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "line_width",
                    displayName: "Line Width",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "lineSettings", propertyName: "lineWidth" },
                            value: settings.lineWidth,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 1 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 6 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "line_showAreaFill",
                    displayName: "Show Area Fill",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "lineSettings", propertyName: "showAreaFill" },
                            value: settings.showAreaFill
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "line_areaOpacity",
                    displayName: "Area Opacity",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "lineSettings", propertyName: "areaOpacity" },
                            value: settings.areaOpacity,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 0.4 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

function createMarkerSettingsCard(settings: IInlineLabelsLineVisualSettings["markerSettings"]): powerbi.visuals.FormattingCard {
    return {
        displayName: "Markers",
        uid: "markerSettings_card",
        groups: [{
            displayName: "Settings",
            uid: "markerSettings_group",
            slices: [
                {
                    uid: "marker_mode",
                    displayName: "Mode",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "markerSettings", propertyName: "mode" },
                            value: settings.mode
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "marker_lastSize",
                    displayName: "Last Marker Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "markerSettings", propertyName: "lastMarkerSize" },
                            value: settings.lastMarkerSize,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 20 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "marker_prevSize",
                    displayName: "Previous Marker Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "markerSettings", propertyName: "prevMarkerSize" },
                            value: settings.prevMarkerSize,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 20 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

function createInlineLabelCard(settings: IInlineLabelsLineVisualSettings["inlineLabelSettings"]): powerbi.visuals.FormattingCard {
    return {
        displayName: "Inline Labels",
        uid: "inlineLabelSettings_card",
        groups: [{
            displayName: "Settings",
            uid: "inlineLabelSettings_group",
            slices: [
                {
                    uid: "inline_enabled",
                    displayName: "Enabled",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "inlineLabelSettings", propertyName: "enabled" },
                            value: settings.enabled
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "inline_content",
                    displayName: "Content",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "inlineLabelSettings", propertyName: "content" },
                            value: settings.content
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "inline_deltaMode",
                    displayName: "Delta Mode",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "inlineLabelSettings", propertyName: "deltaMode" },
                            value: settings.deltaMode
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "inline_leader",
                    displayName: "Show Leader Lines",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "inlineLabelSettings", propertyName: "showLeaderLines" },
                            value: settings.showLeaderLines
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "inline_labelFont",
                    displayName: "Name Font Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "inlineLabelSettings", propertyName: "labelFontSize" },
                            value: settings.labelFontSize,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 6 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 40 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "inline_valueFont",
                    displayName: "Value Font Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "inlineLabelSettings", propertyName: "valueFontSize" },
                            value: settings.valueFontSize,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 6 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 40 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "inline_deltaFont",
                    displayName: "Delta Font Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "inlineLabelSettings", propertyName: "deltaFontSize" },
                            value: settings.deltaFontSize,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 6 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 40 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "inline_padding",
                    displayName: "Padding",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "inlineLabelSettings", propertyName: "labelPadding" },
                            value: settings.labelPadding,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 2 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 24 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "inline_gap",
                    displayName: "Gap",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "inlineLabelSettings", propertyName: "labelGap" },
                            value: settings.labelGap,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 24 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

function createPointValueLabelsCard(settings: IInlineLabelsLineVisualSettings["pointValueLabels"]): powerbi.visuals.FormattingCard {
    return {
        displayName: "Point Values",
        uid: "pointValueLabels_card",
        groups: [{
            displayName: "Settings",
            uid: "pointValueLabels_group",
            slices: [
                {
                    uid: "pointValues_enabled",
                    displayName: "Show Values",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "enabled" },
                            value: settings.enabled
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_placement",
                    displayName: "Placement",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "placement" },
                            value: (settings as any).placement
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_showValue2",
                    displayName: "Show Value 2",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "showValue2" },
                            value: (settings as any).showValue2
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_value2Position",
                    displayName: "Value 2 Position",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "value2Position" },
                            value: (settings as any).value2Position
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_density",
                    displayName: "Density",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "density" },
                            value: settings.density
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_fontSize",
                    displayName: "Font Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "fontSize" },
                            value: settings.fontSize,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 6 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 40 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_color",
                    displayName: "Color",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ColorPicker,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "color" },
                            value: { value: settings.color }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_value2FontSize",
                    displayName: "Value 2 Font Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "value2FontSize" },
                            value: (settings as any).value2FontSize,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 6 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 40 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_value2Color",
                    displayName: "Value 2 Color",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ColorPicker,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "value2Color" },
                            value: { value: (settings as any).value2Color }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_valueLineGap",
                    displayName: "Value Line Gap",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "valueLineGap" },
                            value: (settings as any).valueLineGap,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 24 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_bg",
                    displayName: "Background",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "showBackground" },
                            value: settings.showBackground
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_bgColor",
                    displayName: "Background Color",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ColorPicker,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "backgroundColor" },
                            value: { value: settings.backgroundColor }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_bgOpacity",
                    displayName: "Background Opacity",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "backgroundOpacity" },
                            value: settings.backgroundOpacity,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 1 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_offset",
                    displayName: "Offset",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "offset" },
                            value: settings.offset,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 24 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_insideOffset",
                    displayName: "Inside Offset",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "insideOffset" },
                            value: (settings as any).insideOffset,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 24 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "pointValues_haloWidth",
                    displayName: "Halo Width",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "pointValueLabels", propertyName: "haloWidth" },
                            value: (settings as any).haloWidth,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 12 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

function createDateLogicCard(settings: IInlineLabelsLineVisualSettings["dateLogic"]): powerbi.visuals.FormattingCard {
    return {
        displayName: "Date Logic",
        uid: "dateLogicSettings_card",
        groups: [{
            displayName: "Settings",
            uid: "dateLogicSettings_group",
            slices: [
                {
                    uid: "dateLogic_enabled",
                    displayName: "Enabled",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "dateLogicSettings", propertyName: "enabled" },
                            value: settings.enabled
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "dateLogic_cutoff",
                    displayName: "Cutoff",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "dateLogicSettings", propertyName: "cutoff" },
                            value: settings.cutoff
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "dateLogic_customDate",
                    displayName: "Custom Date",
                    control: {
                        type: powerbi.visuals.FormattingComponent.TextInput,
                        properties: {
                            descriptor: { objectName: "dateLogicSettings", propertyName: "customDate" },
                            value: settings.customDate
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "dateLogic_futureStyle",
                    displayName: "Future Style",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "dateLogicSettings", propertyName: "futureStyle" },
                            value: settings.futureStyle
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "dateLogic_pastStyle",
                    displayName: "Past Style",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "dateLogicSettings", propertyName: "pastStyle" },
                            value: settings.pastStyle
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "dateLogic_dimOpacity",
                    displayName: "Dim Opacity",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "dateLogicSettings", propertyName: "dimOpacity" },
                            value: settings.dimOpacity,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 1 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "dateLogic_applyTo",
                    displayName: "Apply To",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "dateLogicSettings", propertyName: "applyTo" },
                            value: settings.applyTo
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

function createYAxis2Card(settings: IInlineLabelsLineVisualSettings): powerbi.visuals.FormattingCard {
    return {
        displayName: "Y-Axis (Value 2)",
        uid: "yAxis2Settings_card",
        groups: [{
            displayName: "Settings",
            uid: "yAxis2Settings_group",
            slices: [
                {
                    uid: "yAxis2_show",
                    displayName: "Show Y-Axis",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "yAxis2Settings", propertyName: "show" },
                            value: settings.showYAxis2
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "yAxis2_fontSize",
                    displayName: "Font Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "yAxis2Settings", propertyName: "fontSize" },
                            value: settings.yAxis2FontSize,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 6 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 40 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "yAxis2_fontFamily",
                    displayName: "Font Family",
                    control: {
                        type: powerbi.visuals.FormattingComponent.FontPicker,
                        properties: {
                            descriptor: { objectName: "yAxis2Settings", propertyName: "fontFamily" },
                            value: settings.yAxis2FontFamily
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "yAxis2_color",
                    displayName: "Color",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ColorPicker,
                        properties: {
                            descriptor: { objectName: "yAxis2Settings", propertyName: "color" },
                            value: { value: settings.yAxis2Color }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "yAxis2_bold",
                    displayName: "Bold",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "yAxis2Settings", propertyName: "bold" },
                            value: settings.yAxis2Bold
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "yAxis2_italic",
                    displayName: "Italic",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "yAxis2Settings", propertyName: "italic" },
                            value: settings.yAxis2Italic
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "yAxis2_underline",
                    displayName: "Underline",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "yAxis2Settings", propertyName: "underline" },
                            value: settings.yAxis2Underline
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

function createLegendWithShowCard(settings: IInlineLabelsLineVisualSettings): powerbi.visuals.FormattingCard {
    return {
        displayName: "Legend",
        uid: "legend_card",
        groups: [{
            displayName: "Legend Settings",
            uid: "legend_group",
            slices: [
                {
                    uid: "legend_show",
                    displayName: "Show Legend",
                    control: {
                        type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                        properties: {
                            descriptor: { objectName: "legend", propertyName: "show" },
                            value: settings.showLegend
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "legend_position",
                    displayName: "Position",
                    control: {
                        type: powerbi.visuals.FormattingComponent.Dropdown,
                        properties: {
                            descriptor: { objectName: "legend", propertyName: "position" },
                            value: settings.legendPosition
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "legend_fontSize",
                    displayName: "Font Size",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "legend", propertyName: "fontSize" },
                            value: settings.legendFontSize,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 6 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 40 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice,
                {
                    uid: "legend_maxItems",
                    displayName: "Max Items",
                    control: {
                        type: powerbi.visuals.FormattingComponent.NumUpDown,
                        properties: {
                            descriptor: { objectName: "legend", propertyName: "maxItems" },
                            value: settings.maxLegendItems,
                            options: {
                                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 1 },
                                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 50 }
                            }
                        }
                    }
                } as powerbi.visuals.FormattingSlice
            ]
        }]
    };
}

export class Visual implements IVisual {
    private static instanceCounter: number = 0;

    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private host: IVisualHost;
    private tooltipService: ITooltipService;
    private selectionManager: powerbi.extensibility.ISelectionManager;
    private settings: IInlineLabelsLineVisualSettings | null = null;
    private renderer: InlineLabelsLineRenderer | null = null;
    private htmlTooltip: HtmlTooltip | null = null;
    private tooltipOwnerId: string;
    private emptySelectionId: ISelectionId;
    private applySelectionState: ((ids: ISelectionId[]) => void) | null = null;
    private allowInteractions: boolean;

    // Data-bound colors / selection ids (legend)
    private categorySelectionIds: Map<string, ISelectionId> = new Map();
    private categories: string[] = [];
    private categoryColors: Map<string, string> = new Map();
    private categoryFieldIndex: number = -1;
    private exportControl: ExportControl;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipOwnerId = `bta-inline-labels-line-${Visual.instanceCounter++}`;
        this.emptySelectionId = this.host.createSelectionIdBuilder().createSelectionId();
        this.allowInteractions = this.host.hostCapabilities?.allowInteractions !== false;

        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            this.applySelectionState?.(ids);
        });

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("inline-labels-line-visual", true);

        this.svg
            .style("position", "absolute")
            .style("inset", "0");

        this.container = this.svg.append("g")
            .classed("chart-container", true);

        this.exportControl = createExportControl({
            host: this.host,
            root: this.target,
            fileNamePrefix: "inline-labels-line"
        });
    }

    public update(options: VisualUpdateOptions): void {
        const eventService = this.host.eventService;
        eventService?.renderingStarted(options);
        let completed = true;

        try {
            this.svg.selectAll("*").remove();
            this.container = this.svg.append("g").classed("chart-container", true);
            this.htmlTooltip?.hide();

            const width = options.viewport.width;
            const height = options.viewport.height;

            this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
            this.exportControl.setSnapshotSource({
                svgElement: this.svg.node(),
                viewportWidth: width,
                viewportHeight: height,
                scrollLeft: this.target.scrollLeft || 0,
                scrollTop: this.target.scrollTop || 0
            });
            this.exportControl.setHasData(false);
            void this.exportControl.refreshCapability();

            this.svg.on("mouseleave", () => {
                this.htmlTooltip?.hide();
                this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
            });

            if (!options.dataViews || !options.dataViews[0] || !options.dataViews[0].categorical) {
                this.renderNoData();
                return;
            }

            const dataView = options.dataViews[0];
            this.settings = parseSettings(dataView);
            this.syncHtmlTooltip();

            // Prefer Legend. If not provided, allow the 2nd X-Axis field to act as series split.
            const legendIdx = findCategoryIndex(dataView, "legend");
            const xAxisIdxs = findCategoryIndicesForRole(dataView, "xAxis");
            const secondaryXAxisIdx = xAxisIdxs.length > 1 ? xAxisIdxs[1] : -1;
            this.categoryFieldIndex = legendIdx >= 0 ? legendIdx : secondaryXAxisIdx;
            this.buildCategorySelectionIds(dataView);
            const rawColorMap = readCategoryColorsFromDataView(dataView, this.categoryFieldIndex);
            // Normalize keys to match transformer (trim + blank->All)
            this.categoryColors = new Map(Array.from(rawColorMap.entries()).map(([k, v]) => {
                const key = String(k ?? "").trim() ? String(k ?? "").trim() : "All";
                return [key, v] as [string, string];
            }));

            const context: RenderContext = {
                svg: this.svg,
                container: this.container,
                tooltipService: this.tooltipService,
                selectionManager: this.selectionManager,
                root: this.target,
                width,
                height,
                htmlTooltip: this.htmlTooltip,
                colorPalette: this.host.colorPalette,
                isHighContrast: Boolean((this.host.colorPalette as any)?.isHighContrast)
            };

            this.renderer = new InlineLabelsLineRenderer(context);

            const chartData = InlineLabelsLineTransformer.transform(dataView.categorical);
            if (!chartData.dataPoints || chartData.dataPoints.length === 0) {
                this.renderNoData();
                return;
            }

            // Auto-enable stacked point values when Value 2 is bound, unless the user explicitly set a preference.
            const objects = (dataView.metadata as any)?.objects as any;
            const pointObj = objects?.pointValueLabels as any;
            const y2Obj = objects?.yAxis2Settings as any;
            const hasPointEnabledPref = !!(pointObj && Object.prototype.hasOwnProperty.call(pointObj, "enabled"));
            const hasShowValue2Pref = !!(pointObj && Object.prototype.hasOwnProperty.call(pointObj, "showValue2"));
            const hasYAxis2ShowPref = !!(y2Obj && Object.prototype.hasOwnProperty.call(y2Obj, "show"));

            if (chartData.hasValue2) {
                if (!hasPointEnabledPref) this.settings.pointValueLabels.enabled = true;
                if (!hasShowValue2Pref) this.settings.pointValueLabels.showValue2 = true;
                if (!hasYAxis2ShowPref) this.settings.showYAxis2 = true;
            }

            chartData.categoryColorMap = this.categoryColors;
            this.exportControl.setHasData(true);
            this.renderer.render(chartData, this.settings);
            this.bindInteractions();
        } catch (error) {
            completed = false;
            eventService?.renderingFailed(options, error instanceof Error ? error.message : String(error));
            throw error;
        } finally {
            if (completed) {
                eventService?.renderingFinished(options);
            }
        }
    }

    private renderNoData(): void {
        this.container.selectAll("*").remove();
    }

    private syncHtmlTooltip(): void {
        const tooltip = this.settings?.tooltip;
        const shouldUseCustom = !!(tooltip?.enabled && tooltip.style === "custom" && typeof document !== "undefined");

        if (!shouldUseCustom) {
            if (this.htmlTooltip) {
                this.htmlTooltip.destroy();
                this.htmlTooltip = null;
            }
            return;
        }

        if (!this.htmlTooltip) {
            this.htmlTooltip = new HtmlTooltip(this.target, tooltip!, this.tooltipOwnerId);
        } else {
            this.htmlTooltip.updateSettings(tooltip!);
        }
    }

    private buildCategorySelectionIds(dataView: powerbi.DataView): void {
        this.categorySelectionIds.clear();
        this.categories = [];

        if (this.categoryFieldIndex < 0 || !dataView.categorical?.categories?.[this.categoryFieldIndex]) {
            return;
        }

        const categoryColumn = dataView.categorical.categories[this.categoryFieldIndex];
        const seen = new Set<string>();

        for (let i = 0; i < categoryColumn.values.length; i++) {
            const raw = String(categoryColumn.values[i] ?? "");
            const categoryValue = raw.trim() ? raw.trim() : "All";
            if (seen.has(categoryValue)) continue;
            seen.add(categoryValue);

            this.categories.push(categoryValue);
            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(categoryColumn, i)
                .createSelectionId();
            this.categorySelectionIds.set(categoryValue, selectionId);
        }

        // Keep category ordering stable and consistent with transformer series ordering
        // (transformer sorts series keys alphabetically).
        this.categories.sort((a, b) => a.localeCompare(b));
    }

    private bindInteractions(): void {
        this.applySelectionState = null;
        if (!this.allowInteractions) return;
        if (!this.settings) return;
        if (!this.categorySelectionIds.size) return;

        const { applySelection } = bindSelectionByDataKey({
            root: this.target,
            selectionManager: this.selectionManager,
            markSelector: ".line-path[data-selection-key], .area-path[data-selection-key], .line-marker[data-selection-key], .end-label-group[data-selection-key]",
            selectionIdsByKey: this.categorySelectionIds
        });

        this.applySelectionState = applySelection;

        this.svg.on("click", async (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest(".line-path[data-selection-key], .area-path[data-selection-key], .line-marker[data-selection-key], .end-label-group[data-selection-key]")) {
                return;
            }

            await this.selectionManager.clear();
            this.applySelectionState?.([]);
        });

        this.svg.on("contextmenu", (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest(".line-path[data-selection-key], .area-path[data-selection-key], .line-marker[data-selection-key], .end-label-group[data-selection-key]")) {
                return;
            }

            event.preventDefault();
            this.selectionManager.showContextMenu(this.emptySelectionId, { x: event.clientX, y: event.clientY })
                .catch(() => undefined);
        });
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const cards: powerbi.visuals.FormattingCard[] = [];

        if (!this.settings) {
            return { cards };
        }

        if (this.categories.length > 0) {
            const defaultColors = this.settings.useCustomColors && this.settings.customColors?.length > 0
                ? this.settings.customColors
                : getSchemeColors(this.settings.colorScheme);
            cards.push(createDataColorsCard(
                this.categories,
                this.categorySelectionIds,
                this.categoryColors,
                defaultColors
            ));
        }

        cards.push(createLineSettingsCard(this.settings.lineSettings));
        cards.push(createMarkerSettingsCard(this.settings.markerSettings));
        cards.push(createInlineLabelCard(this.settings.inlineLabelSettings));
        cards.push(createPointValueLabelsCard(this.settings.pointValueLabels));
        cards.push(createDateLogicCard(this.settings.dateLogic));

        cards.push(createLegendWithShowCard(this.settings));

        cards.push(createTooltipCard(this.settings.tooltip));

        cards.push(createYAxisCard({
            show: this.settings.showYAxis,
            fontSize: this.settings.yAxisFontSize,
            fontFamily: this.settings.yAxisFontFamily,
            bold: this.settings.yAxisBold,
            italic: this.settings.yAxisItalic,
            underline: this.settings.yAxisUnderline,
            color: this.settings.yAxisColor
        }));

        cards.push(createYAxis2Card(this.settings));

        cards.push(createXAxisCard({
            show: this.settings.showXAxis,
            fontSize: this.settings.xAxisFontSize,
            rotateLabels: this.settings.rotateXLabels,
            fontFamily: this.settings.xAxisFontFamily,
            bold: this.settings.xAxisBold,
            italic: this.settings.xAxisItalic,
            underline: this.settings.xAxisUnderline,
            color: this.settings.xAxisColor
        }));

        cards.push(createTextSizesCard({
            xAxisFontSize: this.settings.textSizes.xAxisFontSize || this.settings.xAxisFontSize,
            yAxisFontSize: this.settings.textSizes.yAxisFontSize || this.settings.yAxisFontSize,
            legendFontSize: this.settings.textSizes.legendFontSize || this.settings.legendFontSize,
            panelTitleFontSize: this.settings.textSizes.panelTitleFontSize || this.settings.smallMultiples.titleFontSize
        }));

        cards.push(createSmallMultiplesCard({
            columns: this.settings.smallMultiples.columns,
            spacing: this.settings.smallMultiples.spacing,
            showTitle: this.settings.smallMultiples.showTitle,
            titleFontSize: this.settings.smallMultiples.titleFontSize,
            titleSpacing: this.settings.smallMultiples.titleSpacing
        }));

        return { cards };
    }

    public destroy(): void {
        try {
            this.exportControl.destroy();
            this.htmlTooltip?.destroy();
            this.htmlTooltip = null;
            this.target.querySelectorAll('[data-bta-tooltip="true"]').forEach(el => el.remove());
        } catch {
            // ignore
        }
        try {
            this.svg?.remove();
        } catch {
            // ignore
        }
        this.renderer = null;
        this.settings = null;
    }
}
