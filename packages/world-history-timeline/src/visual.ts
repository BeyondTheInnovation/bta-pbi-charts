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
    RenderContext,
    createColorSchemeCard,
    createDataColorsCard,
    createLegendCard,
    createTextSizesCard,
    createTooltipCard,
    createXAxisCard,
    createYAxisCard,
    readCategoryColorsFromDataView,
    findCategoryIndex,
    getSchemeColors,
    renderEmptyState,
    HtmlTooltip,
    bindSelectionByDataKey
} from "@pbi-visuals/shared";
import { IWorldHistoryTimelineVisualSettings, parseSettings } from "./settings";
import { WorldHistoryTimelineData, WorldHistoryTimelineTransformer } from "./WorldHistoryTimelineTransformer";
import { WorldHistoryTimelineRenderer } from "./WorldHistoryTimelineRenderer";

function createTimelineCard(settings: IWorldHistoryTimelineVisualSettings): powerbi.visuals.FormattingCard {
    return {
        displayName: "Timeline",
        uid: "timeline_card",
        groups: [
            {
                displayName: "Layout",
                uid: "timeline_layout_group",
                slices: [
                    {
                        uid: "timeline_sortBy",
                        displayName: "Sort By",
                        control: {
                            type: powerbi.visuals.FormattingComponent.Dropdown,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "sortBy" },
                                value: settings.timeline.sortBy
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_lanePadding",
                        displayName: "Lane Padding",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "lanePadding" },
                                value: settings.timeline.lanePadding,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 0.9 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_cornerRadius",
                        displayName: "Bar Corner Radius",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "barCornerRadius" },
                                value: settings.timeline.barCornerRadius,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 24 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_minBarWidth",
                        displayName: "Min Bar Width",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "minBarWidth" },
                                value: settings.timeline.minBarWidth,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 1 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 20 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_showLabels",
                        displayName: "Show Labels",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "showLabels" },
                                value: settings.timeline.showLabels
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_showCrosshair",
                        displayName: "Show Crosshair",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "showCrosshair" },
                                value: settings.timeline.showCrosshair
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_showTopAxis",
                        displayName: "Show Top Axis",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "showTopAxis" },
                                value: settings.timeline.showTopAxis
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_showBottomAxis",
                        displayName: "Show Bottom Axis",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "showBottomAxis" },
                                value: settings.timeline.showBottomAxis
                            }
                        }
                    } as powerbi.visuals.FormattingSlice
                ]
            }
        ]
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
    private settings: IWorldHistoryTimelineVisualSettings | null = null;
    private renderer: WorldHistoryTimelineRenderer | null = null;
    private htmlTooltip: HtmlTooltip | null = null;
    private tooltipOwnerId: string;
    private emptySelectionId: ISelectionId;
    private applySelectionState: ((ids: ISelectionId[]) => void) | null = null;
    private allowInteractions: boolean;

    private regionSelectionIds: Map<string, ISelectionId> = new Map();
    private regions: string[] = [];
    private regionColors: Map<string, string> = new Map();
    private regionFieldIndex: number = -1;
    private readonly onTargetScroll: () => void;

    private static readonly MIN_CONTENT_WIDTH: number = 900;
    private static readonly MAX_CONTENT_WIDTH: number = 9000;
    private static readonly PX_PER_YEAR: number = 0.72;
    private static readonly WIDTH_PADDING: number = 220;
    private static readonly ROW_HEIGHT: number = 20;
    private static readonly HEIGHT_PADDING: number = 140;
    private static readonly MIN_CONTENT_HEIGHT: number = 460;
    private static readonly MAX_CONTENT_HEIGHT: number = 12000;
    private lastLayoutKey: string = "";
    private lastViewportWidth: number = 0;
    private lastViewportHeight: number = 0;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipOwnerId = `bta-world-history-${Visual.instanceCounter++}`;
        this.emptySelectionId = this.host.createSelectionIdBuilder().createSelectionId();
        this.allowInteractions = this.host.hostCapabilities?.allowInteractions !== false;
        this.target.style.position = "relative";
        this.target.style.overflowX = "auto";
        this.target.style.overflowY = "auto";
        this.onTargetScroll = () => {
            this.syncPinnedLayers();
            this.htmlTooltip?.hide();
            this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
        };
        this.target.addEventListener("scroll", this.onTargetScroll, { passive: true });

        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            this.applySelectionState?.(ids);
        });

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("world-history-timeline-visual", true)
            .style("position", "absolute")
            .style("left", "0")
            .style("top", "0");

        this.container = this.svg.append("g")
            .classed("chart-container", true);
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
            const viewportChanged = width !== this.lastViewportWidth || height !== this.lastViewportHeight;
            this.target.style.overflowX = "auto";
            this.target.style.overflowY = "auto";

            this.svg.on("mouseleave", () => {
                this.htmlTooltip?.hide();
                this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
            });

            if (!options.dataViews || !options.dataViews[0] || !options.dataViews[0].categorical) {
                this.lastLayoutKey = "";
                this.lastViewportWidth = width;
                this.lastViewportHeight = height;
                this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
                this.renderNoData(width, height);
                return;
            }

            const dataView = options.dataViews[0];
            this.settings = parseSettings(dataView);
            this.syncHtmlTooltip();

            this.regionFieldIndex = findCategoryIndex(dataView, "region");
            this.buildRegionSelectionIds(dataView);
            this.regionColors = readCategoryColorsFromDataView(dataView, this.regionFieldIndex);

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

            const chartData = WorldHistoryTimelineTransformer.transform(dataView.categorical);

            if (!chartData.items.length) {
                this.lastLayoutKey = "";
                this.lastViewportWidth = width;
                this.lastViewportHeight = height;
                this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
                this.renderNoData(width, height);
                return;
            }

            const virtualCanvas = this.computeVirtualCanvasSize(width, height, chartData);
            this.svg
                .attr("width", virtualCanvas.width)
                .attr("height", virtualCanvas.height)
                .attr("viewBox", `0 0 ${virtualCanvas.width} ${virtualCanvas.height}`);

            const layoutKey = `${virtualCanvas.width}x${virtualCanvas.height}|${chartData.minYear}|${chartData.maxYear}|${chartData.items.length}`;
            if (viewportChanged || this.lastLayoutKey !== layoutKey) {
                this.target.scrollLeft = 0;
                this.target.scrollTop = 0;
                this.lastLayoutKey = layoutKey;
            }
            this.lastViewportWidth = width;
            this.lastViewportHeight = height;

            context.width = virtualCanvas.width;
            context.height = virtualCanvas.height;
            this.renderer = new WorldHistoryTimelineRenderer(context);

            const defaultColors = this.settings.useCustomColors && this.settings.customColors?.length > 0
                ? this.settings.customColors
                : getSchemeColors(this.settings.colorScheme);
            const seededColors = new Map<string, string>(this.regionColors);
            chartData.regions.forEach((region, i) => {
                if (!seededColors.has(region)) {
                    seededColors.set(region, defaultColors[i % defaultColors.length]);
                }
            });
            chartData.categoryColorMap = seededColors;

            this.renderer.render(chartData, this.settings);
            this.syncPinnedLayers();
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

    private computeVirtualCanvasSize(
        viewportWidth: number,
        viewportHeight: number,
        chartData: WorldHistoryTimelineData
    ): { width: number; height: number } {
        const rowCount = Math.max(1, chartData.items.length);
        const yearSpan = Math.max(1, Math.ceil(chartData.maxYear - chartData.minYear));

        const widthByYears = Math.round((yearSpan * Visual.PX_PER_YEAR) + Visual.WIDTH_PADDING);
        const heightByRows = Math.round((rowCount * Visual.ROW_HEIGHT) + Visual.HEIGHT_PADDING);

        const width = Math.max(
            viewportWidth,
            Math.min(
                Visual.MAX_CONTENT_WIDTH,
                Math.max(Visual.MIN_CONTENT_WIDTH, widthByYears)
            )
        );

        const height = Math.max(
            viewportHeight,
            Math.min(
                Visual.MAX_CONTENT_HEIGHT,
                Math.max(Visual.MIN_CONTENT_HEIGHT, heightByRows)
            )
        );

        return { width, height };
    }

    private syncPinnedLayers(): void {
        const scrollTop = this.target.scrollTop || 0;
        const scrollLeft = this.target.scrollLeft || 0;
        const pinnedAxes = this.target.querySelectorAll<SVGGElement>("g.pinned-top-axis");
        pinnedAxes.forEach((axis) => {
            const baseY = Number(axis.getAttribute("data-base-y") ?? "0");
            const stickyOffset = Number(axis.getAttribute("data-sticky-offset") ?? "0");
            const pinTop = Number(axis.getAttribute("data-pin-top") ?? "0");
            const snappedY = baseY + Math.max(scrollTop + pinTop, stickyOffset);
            axis.setAttribute("transform", `translate(0, ${Math.round(snappedY)})`);
        });

        const pinnedLegends = this.target.querySelectorAll<SVGGElement>("g.pinned-top-legend, g.color-legend[data-pin-left]");
        pinnedLegends.forEach((legend) => {
            const pinLeft = Number(legend.getAttribute("data-pin-left") ?? "8");
            const pinTop = Number(legend.getAttribute("data-pin-top") ?? "6");
            const x = Math.round(scrollLeft + pinLeft);
            const y = Math.round(scrollTop + pinTop);
            legend.setAttribute("transform", `translate(${x}, ${y})`);
        });
    }

    private renderNoData(width: number, height: number): void {
        renderEmptyState(this.container, width, height, {
            title: "Set up World History Timeline",
            lines: [
                "Category: Label for each bar",
                "Start: Numeric year (BCE = negative)",
                "End: Numeric year",
                "Legend (optional): Color grouping",
                "Group (optional): Tooltip context"
            ],
            hint: "Tip: Use Start/End Year as whole-number fields (not text)."
        });
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

    private buildRegionSelectionIds(dataView: powerbi.DataView): void {
        this.regionSelectionIds.clear();
        this.regions = [];

        if (this.regionFieldIndex < 0 || !dataView.categorical?.categories?.[this.regionFieldIndex]) {
            return;
        }

        const regionColumn = dataView.categorical.categories[this.regionFieldIndex];
        const seen = new Set<string>();

        for (let i = 0; i < regionColumn.values.length; i++) {
            const regionValue = String(regionColumn.values[i] ?? "");
            if (seen.has(regionValue)) continue;
            seen.add(regionValue);

            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(regionColumn, i)
                .createSelectionId();

            this.regionSelectionIds.set(regionValue, selectionId);
            this.regions.push(regionValue);
        }

        this.regions.sort((a, b) => a.localeCompare(b));
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const cards: powerbi.visuals.FormattingCard[] = [];

        if (!this.settings) {
            return { cards };
        }

        if (this.regions.length > 0) {
            const defaultColors = this.settings.useCustomColors && this.settings.customColors?.length > 0
                ? this.settings.customColors
                : getSchemeColors(this.settings.colorScheme);

            cards.push(createDataColorsCard(this.regions, this.regionSelectionIds, this.regionColors, defaultColors));
        }

        cards.push(createColorSchemeCard(this.settings.colorScheme));

        cards.push(createTooltipCard(this.settings.tooltip));

        cards.push(createLegendCard({
            show: this.settings.showLegend,
            fontSize: this.settings.legendFontSize,
            maxItems: this.settings.maxLegendItems
        }));

        cards.push(createYAxisCard({
            show: this.settings.showYAxis,
            fontSize: this.settings.yAxisFontSize,
            fontFamily: this.settings.yAxisFontFamily,
            bold: this.settings.yAxisBold,
            italic: this.settings.yAxisItalic,
            underline: this.settings.yAxisUnderline,
            color: this.settings.yAxisColor
        }));

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
            endLabelFontSize: this.settings.textSizes.endLabelFontSize || this.settings.yAxisFontSize
        }));

        cards.push(createTimelineCard(this.settings));

        return { cards };
    }

    public destroy(): void {
        this.target.removeEventListener("scroll", this.onTargetScroll);
        try {
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

    private bindInteractions(): void {
        this.applySelectionState = null;
        if (!this.allowInteractions) {
            return;
        }

        if (this.regionSelectionIds.size > 0) {
            const binding = bindSelectionByDataKey({
                root: this.target,
                selectionManager: this.selectionManager,
                markSelector: ".timeline-bar[data-selection-key]",
                selectionIdsByKey: this.regionSelectionIds,
                dimOpacity: 0.2,
                selectedOpacity: 1
            });
            this.applySelectionState = binding.applySelection;
            binding.applySelection(this.selectionManager.getSelectionIds());
        }

        this.svg.on("click", async (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest(".timeline-bar[data-selection-key]")) {
                return;
            }

            await this.selectionManager.clear();
            this.applySelectionState?.([]);
        });

        this.svg.on("contextmenu", (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest(".timeline-bar[data-selection-key]")) {
                return;
            }

            event.preventDefault();
            this.selectionManager.showContextMenu(this.emptySelectionId, { x: event.clientX, y: event.clientY })
                .catch(() => undefined);
        });
    }
}
