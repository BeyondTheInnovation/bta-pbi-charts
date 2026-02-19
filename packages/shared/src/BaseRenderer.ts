"use strict";

import * as d3 from "./d3";
import powerbi from "powerbi-visuals-api";
import ITooltipService = powerbi.extensibility.ITooltipService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IColorPalette = powerbi.extensibility.IColorPalette;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import { IBaseVisualSettings, colorSchemes } from "./settings";
import { measureMaxLabelWidth } from "./textUtils";
import { formatMeasureValue } from "./utils";
import { HtmlTooltip, TooltipMeta, toTooltipRows } from "./tooltip";

export interface RenderContext {
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    container: d3.Selection<SVGGElement, unknown, null, undefined>;
    tooltipService: ITooltipService;
    selectionManager?: ISelectionManager;
    root: HTMLElement;
    width: number;
    height: number;
    htmlTooltip?: HtmlTooltip | null;
    colorPalette?: IColorPalette | ISandboxExtendedColorPalette;
    isHighContrast?: boolean;
}

export interface ChartData {
    dataPoints: DataPoint[];
    xValues: string[];
    yValues: string[];
    groups: string[];
    maxValue: number;
    minValue: number;
    categoryColorMap?: Map<string, string>;
    valueFormatString?: string;
    // Name of the bound measure in the Values bucket (e.g. "Sales"), used for tooltips.
    valueDisplayName?: string;
}

export interface DataPoint {
    xValue: string;
    yValue: string;
    value: number;
    groupValue: string;
    index: number;
    date?: Date;
}

export interface LegendAlignFrame {
    x: number;
    y: number;
    width: number;
    height: number;
}

export abstract class BaseRenderer<TSettings extends IBaseVisualSettings = IBaseVisualSettings> {
    protected context: RenderContext;
    protected settings!: TSettings;
    private static gradientCounter: number = 0;

    constructor(context: RenderContext) {
        this.context = context;
    }

    public abstract render(data: ChartData, settings: TSettings): void;

    // Snap to pixel grid for crisp 1px strokes (adds 0.5 offset)
    protected snapToPixel(value: number): number {
        return Math.round(value) + 0.5;
    }

    // Snap to pixel grid for rect positions (integer values)
    protected snapToPixelInt(value: number): number {
        return Math.round(value);
    }

    private static colorParseCanvas: HTMLCanvasElement | null = null;
    private static colorParseCtx: CanvasRenderingContext2D | null = null;

    private static getColorParseCtx(): CanvasRenderingContext2D | null {
        if (BaseRenderer.colorParseCtx) return BaseRenderer.colorParseCtx;
        if (typeof document === "undefined") return null;
        BaseRenderer.colorParseCanvas = BaseRenderer.colorParseCanvas || document.createElement("canvas");
        BaseRenderer.colorParseCtx = BaseRenderer.colorParseCanvas.getContext("2d");
        return BaseRenderer.colorParseCtx;
    }

    private static parseCssColorToRgb(color: string): { r: number; g: number; b: number } | null {
        const ctx = BaseRenderer.getColorParseCtx();
        if (!ctx) return null;

        // Browser-normalize any CSS color.
        try {
            ctx.fillStyle = "#000000";
            ctx.fillStyle = color;
        } catch {
            return null;
        }

        const normalized = String(ctx.fillStyle || "").trim().toLowerCase();
        if (!normalized) return null;

        // Most browsers return rgb(...) for non-hex inputs, and #rrggbb for hex-like inputs.
        if (normalized.startsWith("#")) {
            let hex = normalized.slice(1);
            if (hex.length === 3) {
                hex = hex.split("").map(c => c + c).join("");
            }
            if (hex.length !== 6) return null;
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if ([r, g, b].some(v => Number.isNaN(v))) return null;
            return { r, g, b };
        }

        const m = normalized.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/);
        if (!m) return null;
        const r = Math.max(0, Math.min(255, Math.round(Number(m[1]))));
        const g = Math.max(0, Math.min(255, Math.round(Number(m[2]))));
        const b = Math.max(0, Math.min(255, Math.round(Number(m[3]))));
        if ([r, g, b].some(v => Number.isNaN(v))) return null;
        return { r, g, b };
    }

    protected isHighContrastMode(): boolean {
        if (typeof this.context.isHighContrast === "boolean") {
            return this.context.isHighContrast;
        }
        return Boolean((this.context.colorPalette as ISandboxExtendedColorPalette | undefined)?.isHighContrast);
    }

    protected getThemeForeground(fallback: string = "#111827"): string {
        const palette = this.context.colorPalette as ISandboxExtendedColorPalette | undefined;
        return palette?.foreground?.value || fallback;
    }

    protected getThemeForegroundSelected(fallback: string = "#1f2937"): string {
        const palette = this.context.colorPalette as ISandboxExtendedColorPalette | undefined;
        return palette?.foregroundSelected?.value || palette?.foreground?.value || fallback;
    }

    protected getThemeBackground(fallback: string = "#ffffff"): string {
        const palette = this.context.colorPalette as ISandboxExtendedColorPalette | undefined;
        return palette?.background?.value || fallback;
    }

    protected getGridStroke(fallback: string = "#e5e7eb"): string {
        if (this.isHighContrastMode()) {
            return this.getThemeForeground("#111827");
        }
        return fallback;
    }

    protected getTitleTextColor(fallback: string = "#333333"): string {
        return this.isHighContrastMode() ? this.getThemeForeground(fallback) : fallback;
    }

    protected getColorScale(minValue: number, maxValue: number): d3.ScaleSequential<string, never> {
        if (this.isHighContrastMode()) {
            return d3.scaleSequential()
                .domain([minValue, maxValue])
                .interpolator(d3.interpolate(this.getThemeBackground("#ffffff"), this.getThemeForeground("#111827")));
        }

        const scheme = colorSchemes[this.settings.colorScheme];
        return d3.scaleSequential()
            .domain([minValue, maxValue])
            .interpolator(d3.interpolate(scheme.min, scheme.max));
    }

    protected getCategoryColors(
        categories: string[],
        colorOverrides?: Map<string, string>
    ): d3.ScaleOrdinal<string, string, never> {
        if (this.isHighContrastMode()) {
            const primary = this.getThemeForeground("#111827");
            const accent = this.getThemeForegroundSelected(primary);
            const colors = categories.map((cat, index) => {
                const override = colorOverrides?.get(cat);
                if (override) return override;
                return index % 2 === 0 ? primary : accent;
            });

            return d3.scaleOrdinal<string, string>()
                .domain(categories)
                .range(colors);
        }

        const palette = this.context.colorPalette;
        const hostColors = categories
            .map(cat => {
                try {
                    return palette?.getColor?.(cat)?.value;
                } catch {
                    return undefined;
                }
            })
            .filter((c): c is string => Boolean(c));

        // Use custom colors if enabled and provided
        const baseColors = this.settings.useCustomColors && this.settings.customColors?.length > 0
            ? this.settings.customColors
            : (hostColors.length > 0 ? hostColors : this.getSchemeColors());

        // If we have color overrides, build a custom color array that respects them
        if (colorOverrides && colorOverrides.size > 0) {
            const colors = categories.map((cat, index) => {
                const override = colorOverrides.get(cat);
                return override || baseColors[index % baseColors.length];
            });

            return d3.scaleOrdinal<string, string>()
                .domain(categories)
                .range(colors);
        }

        return d3.scaleOrdinal<string, string>()
            .domain(categories)
            .range(baseColors);
    }

    // Get color for a specific category index (useful for per-data-group coloring)
    protected getCategoryColor(categoryIndex: number): string {
        if (this.isHighContrastMode()) {
            return categoryIndex % 2 === 0
                ? this.getThemeForeground("#111827")
                : this.getThemeForegroundSelected("#1f2937");
        }

        if (this.settings.useCustomColors && this.settings.customColors?.length > 0) {
            return this.settings.customColors[categoryIndex % this.settings.customColors.length];
        }
        const schemeColors = this.getSchemeColors();
        return schemeColors[categoryIndex % schemeColors.length];
    }

    protected getSchemeColors(): string[] {
        switch (this.settings.colorScheme) {
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
                return d3.schemeCategory10 as string[];
        }
    }

    protected addTooltip(
        element: d3.Selection<SVGElement, unknown, null, undefined>,
        tooltipData: VisualTooltipDataItem[],
        meta?: TooltipMeta
    ): void {
        if (!this.settings.tooltip?.enabled) {
            return;
        }

        // Ensure SVG elements can receive mouse events even if the root SVG disables pointer events.
        element.style("pointer-events", "all");

        if (this.settings.tooltip.style === "custom" && typeof document !== "undefined") {
            const tooltip = this.context.htmlTooltip;
            if (!tooltip) {
                return;
            }

            element
                .on("mouseover", function (event: MouseEvent) {
                    tooltip.show({ meta, rows: toTooltipRows(tooltipData) }, event.clientX, event.clientY);
                })
                .on("mousemove", function (event: MouseEvent) {
                    tooltip.move(event.clientX, event.clientY);
                })
                .on("mouseout", function () {
                    tooltip.hide();
                });
            return;
        }

        const tooltipService = this.context.tooltipService;

        element
            .on("mouseover", function (event: MouseEvent) {
                tooltipService.show({
                    dataItems: tooltipData,
                    identities: [],
                    coordinates: [event.clientX, event.clientY],
                    isTouchEvent: false
                });
            })
            .on("mousemove", function (event: MouseEvent) {
                tooltipService.move({
                    dataItems: tooltipData,
                    identities: [],
                    coordinates: [event.clientX, event.clientY],
                    isTouchEvent: false
                });
            })
            .on("mouseout", function () {
                tooltipService.hide({
                    immediately: true,
                    isTouchEvent: false
                });
            });
    }

    protected addTooltipDynamic(
        element: d3.Selection<SVGElement, unknown, null, undefined>,
        getData: (event: MouseEvent) => { tooltipData: VisualTooltipDataItem[]; meta?: TooltipMeta }
    ): void {
        if (!this.settings.tooltip?.enabled) {
            return;
        }

        // Only supported for custom tooltips.
        if (this.settings.tooltip.style !== "custom" || typeof document === "undefined") {
            return;
        }

        // Ensure SVG elements can receive mouse events even if the root SVG disables pointer events.
        element.style("pointer-events", "all");

        const tooltip = this.context.htmlTooltip;
        if (!tooltip) {
            return;
        }

        element
            .on("mouseover", function (event: MouseEvent) {
                const { tooltipData, meta } = getData(event);
                tooltip.show({ meta, rows: toTooltipRows(tooltipData) }, event.clientX, event.clientY);
            })
            .on("mousemove", function (event: MouseEvent) {
                const { tooltipData, meta } = getData(event);
                tooltip.show({ meta, rows: toTooltipRows(tooltipData) }, event.clientX, event.clientY);
            })
            .on("mouseout", function () {
                tooltip.hide();
            });
    }

    /**
     * Deprecated: legacy legend placement helper.
     * Prefer `getLegendReservation()` + `renderLegend()` (which share the same sizing model)
     * so the plot reserves space and the legend never overlaps chart content.
     */
    protected getLegendLayout(position: string, legendWidth: number, legendHeight: number): {
        x: number;
        y: number;
        isVertical: boolean;
        anchor: "start" | "middle" | "end";
    } {
        const padX = 12;
        const padY = 12;
        const w = this.context.width;
        const h = this.context.height;

        switch (position) {
            case "topLeft":
                return { x: padX, y: padY, isVertical: false, anchor: "start" };
            case "topCenter":
                return { x: Math.round((w - legendWidth) / 2), y: padY, isVertical: false, anchor: "middle" };
            case "topRight":
                return { x: w - legendWidth - padX, y: padY, isVertical: false, anchor: "end" };
            case "topLeftStacked":
                return { x: padX, y: padY, isVertical: true, anchor: "start" };
            case "topRightStacked":
                return { x: w - legendWidth - padX, y: padY, isVertical: true, anchor: "end" };
            case "centerLeft":
                return { x: padX, y: Math.round((h - legendHeight) / 2), isVertical: true, anchor: "start" };
            case "centerRight":
                return { x: w - legendWidth - padX, y: Math.round((h - legendHeight) / 2), isVertical: true, anchor: "end" };
            case "bottomLeft":
                return { x: padX, y: h - legendHeight - padY, isVertical: false, anchor: "start" };
            case "bottomCenter":
                return { x: Math.round((w - legendWidth) / 2), y: h - legendHeight - padY, isVertical: false, anchor: "middle" };
            case "bottomRight":
                return { x: w - legendWidth - padX, y: h - legendHeight - padY, isVertical: false, anchor: "end" };
            default:
                // Default to topRight
                return { x: w - legendWidth - padX, y: padY, isVertical: false, anchor: "end" };
        }
    }

    protected getLegendReservation(options: {
        isOrdinal: boolean;
        categories?: string[];
        legendWidth?: number;   // gradient legends
        legendHeight?: number;  // gradient legends
        legendFontSize?: number;
        availableWidth?: number;
        availableHeight?: number;
    }): { top: number; right: number; bottom: number; left: number } {
        const position = this.settings.legendPosition || "topRight";
        const textSizesLegend = (this.settings as any)?.textSizes?.legendFontSize;
        const defaultLegendFontSize = (typeof textSizesLegend === "number" && textSizesLegend > 0)
            ? textSizesLegend
            : (this.settings.legendFontSize || 11);
        const legendFontSize = options.legendFontSize ?? defaultLegendFontSize;
        const maxLegendItems = this.settings.maxLegendItems || 10;

        const metrics = options.isOrdinal
            ? this.computeOrdinalLegendMetrics(options.categories ?? [], position, legendFontSize, maxLegendItems, {
                availableWidth: options.availableWidth,
                availableHeight: options.availableHeight
            })
            : this.computeGradientLegendMetrics(position, legendFontSize, options.legendWidth ?? 140, options.legendHeight ?? 12);

        if (!metrics) return { top: 0, right: 0, bottom: 0, left: 0 };

        const gap = 10;
        const padX = metrics.padX;
        const padY = metrics.padY;

        switch (metrics.dock) {
            case "top":
                return { top: metrics.height + padY + gap, right: 0, bottom: 0, left: 0 };
            case "bottom":
                return { top: 0, right: 0, bottom: metrics.height + padY + gap, left: 0 };
            case "left":
                return { top: 0, right: 0, bottom: 0, left: metrics.width + padX + gap };
            case "right":
                return { top: 0, right: metrics.width + padX + gap, bottom: 0, left: 0 };
        }
    }

    private getLegendDock(position: string): {
        dock: "top" | "bottom" | "left" | "right";
        align: "start" | "middle" | "end";
        isVertical: boolean;
        vAlign: "top" | "middle";
    } {
        const pos = position || "topRight";
        const lower = pos.toLowerCase();

        const isStacked = lower.includes("stacked");
        const isCenter = lower.startsWith("center");
        const isBottom = lower.startsWith("bottom");

        const hasLeft = lower.includes("left");
        const hasRight = lower.includes("right");
        const hasCenter = lower.includes("center");

        if (isCenter && hasLeft) return { dock: "left", align: "start", isVertical: true, vAlign: "middle" };
        if (isCenter && hasRight) return { dock: "right", align: "end", isVertical: true, vAlign: "middle" };
        // "Top Left/Right (Stacked)" should remain docked at the top, but lay items vertically.
        if (isStacked && hasLeft) return { dock: "top", align: "start", isVertical: true, vAlign: "top" };
        if (isStacked && hasRight) return { dock: "top", align: "end", isVertical: true, vAlign: "top" };

        const dock: "top" | "bottom" = isBottom ? "bottom" : "top";
        const align: "start" | "middle" | "end" = hasCenter ? "middle" : (hasLeft ? "start" : "end");
        return { dock, align, isVertical: false, vAlign: "top" };
    }

    private computeOrdinalLegendMetrics(
        categories: string[],
        position: string,
        legendFontSize: number,
        maxLegendItems: number,
        bounds?: {
            availableWidth?: number;
            availableHeight?: number;
        }
    ): {
        dock: "top" | "bottom" | "left" | "right";
        align: "start" | "middle" | "end";
        vAlign: "top" | "middle";
        isVertical: boolean;
        width: number;
        height: number;
        itemsPerRow: number;
        itemsPerCol: number;
        colWidth: number;
        rowHeight: number;
        padX: number;
        padY: number;
    } | null {
        const items = categories.slice(0, Math.max(0, maxLegendItems));
        if (items.length === 0) return null;

        const { dock, align, isVertical, vAlign } = this.getLegendDock(position);

        const padX = 12;
        const padY = 12;
        const boundedWidth = bounds?.availableWidth ?? this.context.width;
        const boundedHeight = bounds?.availableHeight ?? this.context.height;
        const availableWidth = Math.max(0, boundedWidth - padX * 2);
        const availableHeight = Math.max(0, boundedHeight - padY * 2);

        const swatchWidth = 12;
        const gap = 6;
        const reservedTextPad = 8;

        const rowHeight = Math.max(16, Math.round(legendFontSize) + 6);
        const maxLabelWidth = Math.max(0, Math.ceil(measureMaxLabelWidth(items, legendFontSize, "Segoe UI")));

        const itemWidthMin = 88;
        const colWidth = Math.max(itemWidthMin, swatchWidth + gap + maxLabelWidth + reservedTextPad);

        if (dock === "left" || dock === "right" || isVertical) {
            // For stacked legends docked to top/bottom, cap legend height so it doesn't consume the full viewport.
            const heightCap = (dock === "top" || dock === "bottom")
                ? Math.max(rowHeight, Math.floor(availableHeight * 0.35))
                : availableHeight;
            const itemsPerColMax = Math.max(1, Math.floor(heightCap / rowHeight));
            const itemsPerCol = Math.max(1, Math.min(itemsPerColMax, items.length));
            const cols = Math.max(1, Math.ceil(items.length / itemsPerCol));
            return {
                dock,
                align,
                vAlign,
                isVertical: true,
                width: cols * colWidth,
                height: Math.min(heightCap, itemsPerCol * rowHeight),
                itemsPerRow: 1,
                itemsPerCol,
                colWidth,
                rowHeight,
                padX,
                padY
            };
        }

        const itemsPerRowMax = Math.max(1, Math.floor(availableWidth / colWidth));
        const itemsPerRow = Math.max(1, Math.min(itemsPerRowMax, items.length));
        const rows = Math.max(1, Math.ceil(items.length / itemsPerRow));
        return {
            dock,
            align,
            vAlign,
            isVertical: false,
            width: itemsPerRow * colWidth,
            height: rows * rowHeight,
            itemsPerRow,
            itemsPerCol: 1,
            colWidth,
            rowHeight,
            padX,
            padY
        };
    }

    private computeGradientLegendMetrics(
        position: string,
        legendFontSize: number,
        legendWidth: number,
        legendHeight: number
    ): {
        dock: "top" | "bottom" | "left" | "right";
        align: "start" | "middle" | "end";
        vAlign: "top" | "middle";
        isVertical: boolean;
        width: number;
        height: number;
        padX: number;
        padY: number;
    } {
        const { dock, align, vAlign } = this.getLegendDock(position);
        const padX = 12;
        const padY = 12;
        const labelBlockHeight = Math.round(legendFontSize) + 6;
        return {
            dock,
            align,
            vAlign,
            isVertical: false,
            width: legendWidth,
            height: legendHeight + labelBlockHeight,
            padX,
            padY
        };
    }

    private getLegendOrigin(metrics: {
        dock: "top" | "bottom" | "left" | "right";
        align: "start" | "middle" | "end";
        vAlign: "top" | "middle";
        width: number;
        height: number;
        padX: number;
        padY: number;
    }, alignFrame?: LegendAlignFrame): { x: number; y: number } {
        const w = this.context.width;
        const h = this.context.height;
        const { dock, align, vAlign, width, height, padX, padY } = metrics;

        const xAligned = (): number => {
            const frameX = alignFrame?.x ?? padX;
            const frameW = alignFrame?.width ?? Math.max(0, w - padX * 2);

            if (align === "start") return Math.round(frameX);
            if (align === "middle") return Math.round(frameX + (frameW - width) / 2);
            return Math.round(frameX + frameW - width);
        };

        if (dock === "top") return { x: xAligned(), y: padY };
        if (dock === "bottom") return { x: xAligned(), y: Math.round(h - height - padY) };

        const frameY = alignFrame?.y ?? padY;
        const frameH = alignFrame?.height ?? Math.max(0, h - padY * 2);
        const y = vAlign === "middle"
            ? Math.round(frameY + (frameH - height) / 2)
            : Math.round(frameY);
        if (dock === "left") return { x: padX, y };
        return { x: Math.round(w - width - padX), y };
    }

    protected renderLegend(
        colorScale: d3.ScaleSequential<string, never> | d3.ScaleOrdinal<string, string, never>,
        maxValue: number,
        isOrdinal: boolean = false,
        categories?: string[],
        customY?: number,
        customGradientColors?: { min: string; max: string },
        layout?: {
            alignFrame?: LegendAlignFrame;
            availableWidth?: number;
            availableHeight?: number;
        }
    ): void {
        const legendWidth = 140;
        const legendHeight = 12;
        const textSizesLegend = (this.settings as any)?.textSizes?.legendFontSize;
        const legendFontSize = (typeof textSizesLegend === "number" && textSizesLegend > 0)
            ? textSizesLegend
            : (this.settings.legendFontSize || 11);
        const maxLegendItems = this.settings.maxLegendItems || 10;
        const position = this.settings.legendPosition || "topRight";

        if (isOrdinal && categories) {
            // Categorical legend (color swatches with labels)
            const ordinalScale = colorScale as d3.ScaleOrdinal<string, string, never>;
            const metrics = this.computeOrdinalLegendMetrics(categories, position, legendFontSize, maxLegendItems, {
                availableWidth: layout?.availableWidth,
                availableHeight: layout?.availableHeight
            });
            if (!metrics) return;

            const baseOrigin = this.getLegendOrigin(metrics, layout?.alignFrame);
            const x = baseOrigin.x;
            const y = customY !== undefined ? customY : baseOrigin.y;

            const legendGroup = this.context.container.append("g")
                .attr("class", "color-legend")
                .attr("transform", `translate(${Math.round(x)}, ${Math.round(y)})`);

            const swatch = 12;
            const gap = 6;
            const textOffsetX = swatch + gap + 4;

            const items = categories.slice(0, maxLegendItems);

            items.forEach((cat, i) => {
                const row = metrics.isVertical ? (i % metrics.itemsPerCol) : Math.floor(i / metrics.itemsPerRow);
                const col = metrics.isVertical ? Math.floor(i / metrics.itemsPerCol) : (i % metrics.itemsPerRow);

                const itemX = col * metrics.colWidth;
                const itemY = row * metrics.rowHeight;

                const itemGroup = legendGroup.append("g")
                    .attr("class", "color-legend-item")
                    .attr("transform", `translate(${Math.round(itemX)}, ${Math.round(itemY)})`);

                itemGroup.append("rect")
                    .attr("x", 0)
                    .attr("y", Math.round((metrics.rowHeight - swatch) / 2))
                    .attr("width", swatch)
                    .attr("height", swatch)
                    .attr("rx", 3)
                    .attr("fill", ordinalScale(cat));

                itemGroup.append("text")
                    .attr("x", textOffsetX)
                    .attr("y", Math.round(metrics.rowHeight / 2 + legendFontSize / 2 - 2))
                    .attr("font-size", `${legendFontSize}px`)
                    .attr("fill", this.getThemeForeground("#6b7280"))
                    .text(cat);
            });
        } else {
            // Gradient legend (for heatmaps, etc.)
            const metrics = this.computeGradientLegendMetrics(position, legendFontSize, legendWidth, legendHeight);
            const origin = this.getLegendOrigin(metrics, layout?.alignFrame);
            const x = origin.x;
            const y = customY !== undefined ? customY : origin.y;

            const legendGroup = this.context.container.append("g")
                .attr("class", "color-legend")
                .attr("transform", `translate(${Math.round(x)}, ${Math.round(y)})`);

            const gradientId = `legend-gradient-${++BaseRenderer.gradientCounter}`;
            const defs = this.context.svg.select("defs").empty()
                ? this.context.svg.append("defs")
                : this.context.svg.select("defs");

            const gradient = defs.append("linearGradient")
                .attr("id", gradientId)
                .attr("x1", "0%")
                .attr("x2", "100%");

            const gradientColors = this.isHighContrastMode()
                ? {
                    min: this.getThemeBackground("#ffffff"),
                    max: this.getThemeForeground("#111827")
                }
                : (customGradientColors || colorSchemes[this.settings.colorScheme]);
            gradient.append("stop").attr("offset", "0%").attr("stop-color", gradientColors.min);
            gradient.append("stop").attr("offset", "100%").attr("stop-color", gradientColors.max);

            legendGroup.append("rect")
                .attr("width", legendWidth)
                .attr("height", legendHeight)
                .attr("rx", 3)
                .attr("fill", `url(#${gradientId})`)
                .attr("stroke", this.getGridStroke("#e0e0e0"))
                .attr("stroke-width", 1);

            const minLabel = "0";
            const maxLabel = formatMeasureValue(maxValue, undefined);
            const labelY = legendHeight + Math.round(legendFontSize) + 4;

            legendGroup.append("text")
                .attr("x", 0)
                .attr("y", Math.round(labelY))
                .attr("font-size", `${legendFontSize}px`)
                .attr("fill", this.getThemeForeground("#6b7280"))
                .text(minLabel);

            legendGroup.append("text")
                .attr("x", legendWidth)
                .attr("y", Math.round(labelY))
                .attr("text-anchor", "end")
                .attr("font-size", `${legendFontSize}px`)
                .attr("fill", this.getThemeForeground("#6b7280"))
                .text(maxLabel);
        }
    }

    protected getContrastColor(color: string): string {
        const rgb = BaseRenderer.parseCssColorToRgb(color);
        if (!rgb) {
            // Safe default: dark text.
            return "#333333";
        }
        const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
        return luminance > 0.5 ? "#333333" : "#ffffff";
    }

    /**
     * Get effective font size - clamps to min/max bounds
     * @param fontSize The font size setting
     * @param minSize Minimum font size (default 8)
     * @param maxSize Maximum font size (default 24)
     */
    protected getEffectiveFontSize(
        fontSize: number,
        minSize: number = 8,
        maxSize: number = 24
    ): number {
        return Math.max(minSize, Math.min(maxSize, fontSize));
    }

    /**
     * Get font size that scales proportionally with element size (e.g., bubble radius)
     */
    protected getProportionalFontSize(
        elementSize: number,
        ratio: number = 0.25,
        minSize: number = 8,
        maxSize: number = 24
    ): number {
        const computed = elementSize * ratio;
        return Math.max(minSize, Math.min(maxSize, Math.round(computed)));
    }

    protected renderNoData(): void {
        this.context.container.selectAll("*").remove();
    }
}
