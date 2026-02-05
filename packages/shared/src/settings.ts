"use strict";

// Color scheme types - expanded with new options
export type ColorScheme =
    | "blues" | "greens" | "reds" | "purples" | "warm"
    | "oranges" | "teals" | "pinks"      // NEW single-hue
    | "rainbow" | "pastel" | "vibrant";  // NEW multi-color

export type LegendPosition =
    | "topLeft" | "topCenter" | "topRight"
    | "topLeftStacked" | "topRightStacked"
    | "centerLeft" | "centerRight"
    | "bottomLeft" | "bottomCenter" | "bottomRight";
export type CellSize = "small" | "medium" | "large";
export type WeekStart = "sunday" | "monday";
export type RotateLabelsMode = "auto" | "always" | "never";
export type TooltipStyle = "powerbi" | "custom";
export type TooltipTheme = "light" | "dark";

// Shared settings interfaces
export interface ISmallMultiplesSettings {
    columns: number;
    spacing: number;
    showTitle: boolean;
    titleFontSize: number;
    titleSpacing: number;  // NEW - gap between title and content
}

export interface ILegendSettings {
    legendPosition: LegendPosition;
    legendFontSize: number;
    maxLegendItems: number;
}

// Custom colors for data groups - allows per-category color control
export interface ICustomColorSettings {
    useCustomColors: boolean;           // Toggle custom colors on/off
    customColors: string[];             // Array of hex colors for each data group
}

export interface IAxisSettings {
    showXAxis: boolean;
    xAxisFontSize: number;
    xAxisFontFamily: string;
    xAxisBold: boolean;
    xAxisItalic: boolean;
    xAxisUnderline: boolean;
    xAxisColor: string;
    showYAxis: boolean;
    yAxisFontSize: number;
    yAxisFontFamily: string;
    yAxisBold: boolean;
    yAxisItalic: boolean;
    yAxisUnderline: boolean;
    yAxisColor: string;
    rotateXLabels: RotateLabelsMode;  // Control X-axis label rotation
}

export interface ITooltipSettings {
    enabled: boolean;
    style: TooltipStyle;
    theme: TooltipTheme;
    backgroundColor: string;
    borderColor: string;
    textColor: string;
    borderRadius: number;
    shadow: boolean;
    maxWidth: number;
    showColorSwatch: boolean;
}

/**
 * Text size settings for manual font size control
 * Value of 0 means "auto/responsive", positive values (6-40) are manual overrides
 */
export interface ITextSizeSettings {
    xAxisFontSize: number;      // 0 = auto, 6-40 = manual
    yAxisFontSize: number;      // 0 = auto, 6-40 = manual
    legendFontSize: number;     // 0 = auto, 6-40 = manual
    panelTitleFontSize: number; // 0 = auto, 6-40 = manual
}

/**
 * Default text size settings (all auto)
 */
export const defaultTextSizeSettings: ITextSizeSettings = {
    xAxisFontSize: 0,
    yAxisFontSize: 0,
    legendFontSize: 0,
    panelTitleFontSize: 0
};

export const defaultTooltipSettings: ITooltipSettings = {
    enabled: true,
    style: "custom",
    theme: "light",
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
    textColor: "#111827",
    borderRadius: 10,
    shadow: true,
    maxWidth: 320,
    showColorSwatch: true
};

// Base settings interface that all visuals extend
export interface IBaseVisualSettings extends ILegendSettings, IAxisSettings, ICustomColorSettings {
    colorScheme: ColorScheme;
    smallMultiples: ISmallMultiplesSettings;
    tooltip: ITooltipSettings;
}

// Color scheme constants - expanded
export const colorSchemes: Record<ColorScheme, { min: string; max: string }> = {
    blues: { min: "#f7fbff", max: "#08519c" },
    greens: { min: "#f7fcf5", max: "#006d2c" },
    reds: { min: "#fff5f0", max: "#a50f15" },
    purples: { min: "#fcfbfd", max: "#54278f" },
    warm: { min: "#ffffcc", max: "#bd0026" },
    oranges: { min: "#fff5eb", max: "#d94701" },  // NEW
    teals: { min: "#f0fdfa", max: "#0d9488" },    // NEW
    pinks: { min: "#fdf2f8", max: "#be185d" },    // NEW
    rainbow: { min: "#ff0000", max: "#0000ff" },  // NEW (uses multi-stop in categorical)
    pastel: { min: "#fef3c7", max: "#a78bfa" },   // NEW
    vibrant: { min: "#22d3ee", max: "#f43f5e" }   // NEW
};

// Default small multiples settings
export const defaultSmallMultiplesSettings: ISmallMultiplesSettings = {
    columns: 2,
    spacing: 36,
    showTitle: true,
    titleFontSize: 14,
    titleSpacing: 25  // NEW
};

// Default legend settings
export const defaultLegendSettings: Partial<ILegendSettings> = {
    legendPosition: "topRight" as LegendPosition,
    legendFontSize: 11,
    maxLegendItems: 10
};

// Default custom color settings
export const defaultCustomColorSettings: ICustomColorSettings = {
    useCustomColors: false,
    customColors: [
        "#3b82f6",  // Blue
        "#ef4444",  // Red
        "#22c55e",  // Green
        "#f59e0b",  // Amber
        "#8b5cf6",  // Purple
        "#ec4899",  // Pink
        "#06b6d4",  // Cyan
        "#f97316",  // Orange
        "#14b8a6",  // Teal
        "#6366f1",  // Indigo
        "#84cc16",  // Lime
        "#a855f7"   // Violet
    ]
};
