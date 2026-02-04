"use strict";

import * as d3 from "d3";
import powerbi from "powerbi-visuals-api";
import ITooltipService = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import { IBaseVisualSettings, colorSchemes } from "./settings";
import { formatLabel } from "./textUtils";
import { renderEmptyState } from "./emptyState";
import { HtmlTooltip, TooltipMeta, toTooltipRows } from "./tooltip";

export interface RenderContext {
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    container: d3.Selection<SVGGElement, unknown, null, undefined>;
    tooltipService: ITooltipService;
    root: HTMLElement;
    width: number;
    height: number;
    htmlTooltip?: HtmlTooltip | null;
}

export interface ChartData {
    dataPoints: DataPoint[];
    xValues: string[];
    yValues: string[];
    groups: string[];
    maxValue: number;
    minValue: number;
    categoryColorMap?: Map<string, string>;
}

export interface DataPoint {
    xValue: string;
    yValue: string;
    value: number;
    groupValue: string;
    index: number;
    date?: Date;
}

export abstract class BaseRenderer<TSettings extends IBaseVisualSettings = IBaseVisualSettings> {
    protected context: RenderContext;
    protected settings!: TSettings;
    private static gradientCounter: number = 0;

    constructor(context: RenderContext) {
        this.context = context;
    }

    public abstract render(data: ChartData, settings: TSettings): void;

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

    protected getColorScale(minValue: number, maxValue: number): d3.ScaleSequential<string, never> {
        const scheme = colorSchemes[this.settings.colorScheme];
        return d3.scaleSequential()
            .domain([minValue, maxValue])
            .interpolator(d3.interpolate(scheme.min, scheme.max));
    }

    protected getCategoryColors(
        categories: string[],
        colorOverrides?: Map<string, string>
    ): d3.ScaleOrdinal<string, string, never> {
        // Use custom colors if enabled and provided
        const baseColors = this.settings.useCustomColors && this.settings.customColors?.length > 0
            ? this.settings.customColors
            : this.getSchemeColors();

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

    protected renderLegend(
        colorScale: d3.ScaleSequential<string, never> | d3.ScaleOrdinal<string, string, never>,
        maxValue: number,
        isOrdinal: boolean = false,
        categories?: string[],
        customY?: number,
        customGradientColors?: { min: string; max: string }
    ): void {
        if (!this.settings.showLegend) return;

        const legendWidth = 140;
        const legendHeight = 14;
        const legendFontSize = this.getResponsiveFontSize(this.settings.legendFontSize || 11, 9, 16);
        const maxLegendItems = this.settings.maxLegendItems || 10;

        // Default legend position (ordinal legends remain bottom to avoid overlap with charts)
        let x = 40;
        let y = customY !== undefined ? customY : this.context.height - 45;

        // For gradient legends (heatmaps/calendars), use legend position to place it in unused space.
        if (!isOrdinal && customY === undefined) {
            const pos = this.settings.legendPosition || "right";
            const padX = 20;
            const padY = 16;

            if (pos === "bottom") {
                y = this.context.height - 45;
            } else {
                // top/left/right -> top row
                y = padY;
            }

            if (pos === "right") {
                x = Math.max(padX, this.context.width - legendWidth - padX);
            } else {
                x = padX;
            }
        }

        if (isOrdinal && categories) {
            // Horizontal categorical legend with smart truncation
            const ordinalScale = colorScale as d3.ScaleOrdinal<string, string, never>;
            const itemCount = Math.min(categories.length, maxLegendItems);
            const padX = 20;
            const availableWidth = Math.max(120, this.context.width - (x + padX));

            const itemWidthMin = 90;
            const itemWidthCap = 160;
            const itemsPerRow = Math.max(1, Math.floor(availableWidth / itemWidthMin));
            const rowCount = Math.ceil(itemCount / itemsPerRow);
            const rowHeight = Math.max(legendHeight, Math.round(legendFontSize) + 6);

            // Keep legend inside the viewport (grow upwards if needed)
            if (customY === undefined) {
                const totalLegendHeight = rowCount * rowHeight;
                y = Math.max(10, this.context.height - totalLegendHeight - 20);
            }

            const legendGroup = this.context.container.append("g")
                .attr("class", "color-legend")
                .attr("transform", `translate(${Math.round(x)}, ${Math.round(y)})`);

            const effectiveItemsPerRow = Math.min(itemsPerRow, itemCount);
            const itemWidth = Math.min(itemWidthCap, availableWidth / effectiveItemsPerRow);

            const reservedSpace = 24; // Color box + padding
            const maxTextWidth = Math.max(0, itemWidth - reservedSpace);

            categories.slice(0, maxLegendItems).forEach((cat, i) => {
                const row = Math.floor(i / effectiveItemsPerRow);
                const col = i % effectiveItemsPerRow;
                const itemX = col * itemWidth;
                const itemY = row * rowHeight;

                const displayText = formatLabel(cat, maxTextWidth, legendFontSize);

                const itemGroup = legendGroup.append("g")
                    .attr("class", "color-legend-item")
                    .attr("transform", `translate(${Math.round(itemX)}, ${Math.round(itemY)})`);

                itemGroup.append("rect")
                    .attr("x", 0)
                    .attr("y", 0)
                    .attr("width", 14)
                    .attr("height", 14)
                    .attr("rx", 3)
                    .attr("fill", ordinalScale(cat));

                itemGroup.append("text")
                    .attr("x", 20)
                    .attr("y", Math.round(rowHeight / 2 + legendFontSize / 2 - 2))
                    .attr("font-size", `${legendFontSize}px`)
                    .attr("fill", "#555")
                    .text(displayText);

                if (displayText !== cat) {
                    this.addTooltip(itemGroup as any, [{ displayName: "Category", value: cat }], { title: cat, color: ordinalScale(cat) });
                }
            });
        } else {
            const legendGroup = this.context.container.append("g")
                .attr("class", "color-legend")
                .attr("transform", `translate(${Math.round(x)}, ${Math.round(y)})`);

            // Gradient legend
            const gradientId = `legend-gradient-${++BaseRenderer.gradientCounter}`;
            const defs = this.context.svg.select("defs").empty()
                ? this.context.svg.append("defs")
                : this.context.svg.select("defs");

            const gradient = defs.append("linearGradient")
                .attr("id", gradientId)
                .attr("x1", "0%")
                .attr("x2", "100%");

            const gradientColors = customGradientColors || colorSchemes[this.settings.colorScheme];
            gradient.append("stop").attr("offset", "0%").attr("stop-color", gradientColors.min);
            gradient.append("stop").attr("offset", "100%").attr("stop-color", gradientColors.max);

            legendGroup.append("rect")
                .attr("width", legendWidth)
                .attr("height", legendHeight)
                .attr("rx", 3)
                .attr("fill", `url(#${gradientId})`)
                .attr("stroke", "#e0e0e0")
                .attr("stroke-width", 1);

            const minLabel = "0";
            const maxLabel = maxValue.toLocaleString();
            const labelY = legendHeight + Math.max(10, Math.round(legendFontSize)) + 2;

            legendGroup.append("text")
                .attr("x", 0)
                .attr("y", labelY)
                .attr("font-size", `${legendFontSize}px`)
                .attr("fill", "#777")
                .text(minLabel);

            legendGroup.append("text")
                .attr("x", legendWidth)
                .attr("y", labelY)
                .attr("text-anchor", "end")
                .attr("font-size", `${legendFontSize}px`)
                .attr("fill", "#777")
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

    // Responsive text sizing helpers
    protected getResponsiveFontSize(
        baseFontSize: number,
        minSize: number = 8,
        maxSize: number = 24
    ): number {
        // If responsiveText is disabled, return the base size
        if (this.settings.responsiveText === false) {
            return baseFontSize;
        }

        // Get the user-controlled scale factor (default 1.0)
        const userScaleFactor = this.settings.fontScaleFactor ?? 1.0;

        // Scale based on chart dimensions - more aggressive scaling
        // Base reference is 400px, scales linearly with smaller dimension
        const dimensionScale = Math.min(this.context.width, this.context.height) / 400;

        // Apply more aggressive scaling range (0.5x to 2.0x) for better responsiveness
        const clampedDimensionScale = Math.max(0.5, Math.min(2.0, dimensionScale));

        // Combine dimension scaling with user's scale factor
        const finalScale = clampedDimensionScale * userScaleFactor;

        const scaled = baseFontSize * finalScale;
        return Math.max(minSize, Math.min(maxSize, Math.round(scaled)));
    }

    /**
     * Get effective font size - uses manual override if > 0, otherwise falls back to responsive calculation
     * @param manualSize Manual font size setting (0 = auto)
     * @param baseFontSize Base font size for responsive calculation
     * @param minSize Minimum font size
     * @param maxSize Maximum font size
     */
    protected getEffectiveFontSize(
        manualSize: number,
        baseFontSize: number,
        minSize: number = 8,
        maxSize: number = 24
    ): number {
        // If manual size is set (> 0), use it directly
        if (manualSize > 0) {
            return Math.max(minSize, Math.min(maxSize, manualSize));
        }
        // Otherwise use responsive sizing
        return this.getResponsiveFontSize(baseFontSize, minSize, maxSize);
    }

    // Get font size that scales proportionally with a specific element size (e.g., bubble radius)
    protected getProportionalFontSize(
        elementSize: number,
        ratio: number = 0.25,
        minSize: number = 8,
        maxSize: number = 24
    ): number {
        const userScaleFactor = this.settings.fontScaleFactor ?? 1.0;
        const computed = elementSize * ratio * userScaleFactor;
        return Math.max(minSize, Math.min(maxSize, Math.round(computed)));
    }

    protected getResponsiveAxisFontSize(): number {
        return this.getResponsiveFontSize(this.settings.xAxisFontSize, 8, 18);
    }

    protected getResponsiveTitleFontSize(): number {
        return this.getResponsiveFontSize(this.settings.smallMultiples.titleFontSize, 10, 24);
    }

    protected getResponsiveLegendFontSize(): number {
        return this.getResponsiveFontSize(this.settings.legendFontSize || 11, 9, 16);
    }

    protected renderNoData(): void {
        renderEmptyState(this.context.container, this.context.width, this.context.height, {
            title: "Set up the visual",
            lines: [
                "Add fields to the visual roles",
                "Then use the Format pane to style it"
            ]
        });
    }
}
