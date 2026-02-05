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
    createTooltipCard,
    createTextSizesCard,
    createSmallMultiplesCard,
    readCategoryColorsFromDataView,
    findCategoryIndex,
    getSchemeColors,
    renderEmptyState,
    HtmlTooltip,
    bindSelectionByDataKey
} from "@pbi-visuals/shared";
import { IBumpChartVisualSettings, parseSettings } from "./settings";
import { BumpChartTransformer } from "./BumpChartTransformer";
import { BumpChartRenderer } from "./BumpChartRenderer";

export class Visual implements IVisual {
    private static instanceCounter: number = 0;
    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private host: IVisualHost;
    private tooltipService: ITooltipService;
    private selectionManager: powerbi.extensibility.ISelectionManager;
    private settings: IBumpChartVisualSettings | null = null;
    private renderer: BumpChartRenderer | null = null;
    private htmlTooltip: HtmlTooltip | null = null;
    private tooltipOwnerId: string;
    private emptySelectionId: ISelectionId;
    private applySelectionState: ((ids: ISelectionId[]) => void) | null = null;
    private allowInteractions: boolean;

    // Data-bound colors
    private categorySelectionIds: Map<string, ISelectionId> = new Map();
    private categories: string[] = [];
    private categoryColors: Map<string, string> = new Map();
    private categoryFieldIndex: number = -1;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipOwnerId = `bta-bump-${Visual.instanceCounter++}`;
        this.emptySelectionId = this.host.createSelectionIdBuilder().createSelectionId();
        this.allowInteractions = this.host.hostCapabilities?.allowInteractions !== false;

        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            this.applySelectionState?.(ids);
        });

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("bump-chart-visual", true);

        this.svg
            .style("position", "absolute")
            .style("inset", "0");

        this.container = this.svg.append("g")
            .classed("chart-container", true);
    }

    public update(options: VisualUpdateOptions) {
        const eventService = this.host.eventService;
        eventService?.renderingStarted(options);
        let completed = true;

        try {
        // Clear previous content
        this.svg.selectAll("*").remove();
        this.container = this.svg.append("g").classed("chart-container", true);
        this.htmlTooltip?.hide();

        const width = options.viewport.width;
        const height = options.viewport.height;

        this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);

        // Hide tooltip when mouse leaves the chart entirely
        this.svg.on("mouseleave", () => {
            this.htmlTooltip?.hide();
            this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
        });

        // Validate data
        if (!options.dataViews || !options.dataViews[0] || !options.dataViews[0].categorical) {
            this.renderNoData(width, height);
            return;
        }

        const dataView = options.dataViews[0];

        // Parse settings
        this.settings = parseSettings(dataView);
        this.syncHtmlTooltip();

        // Find the yAxis category index (the categories to color)
        this.categoryFieldIndex = findCategoryIndex(dataView, "yAxis");

        // Build selection IDs for each unique category
        this.buildCategorySelectionIds(dataView);

        // Read any user-selected colors from the dataView
        this.categoryColors = readCategoryColorsFromDataView(dataView, this.categoryFieldIndex);

        // Create render context
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

        // Create renderer
        this.renderer = new BumpChartRenderer(context);

        // Transform data
        const chartData = BumpChartTransformer.transform(dataView.categorical);

        // Check if data is empty
        if (!chartData.dataPoints || chartData.dataPoints.length === 0) {
            this.renderNoData(width, height);
            return;
        }

        // Pass color overrides to chart data
        chartData.categoryColorMap = this.categoryColors;

        // Render the chart
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

    private buildCategorySelectionIds(dataView: powerbi.DataView): void {
        this.categorySelectionIds.clear();
        this.categories = [];

        if (this.categoryFieldIndex < 0 || !dataView.categorical?.categories?.[this.categoryFieldIndex]) {
            return;
        }

        const categoryColumn = dataView.categorical.categories[this.categoryFieldIndex];
        const seenCategories = new Set<string>();

        for (let i = 0; i < categoryColumn.values.length; i++) {
            const categoryValue = String(categoryColumn.values[i] ?? "");

            if (!seenCategories.has(categoryValue)) {
                seenCategories.add(categoryValue);
                this.categories.push(categoryValue);

                // Build selection ID for this category
                const selectionId = this.host.createSelectionIdBuilder()
                    .withCategory(categoryColumn, i)
                    .createSelectionId();

                this.categorySelectionIds.set(categoryValue, selectionId);
            }
        }
    }

    private renderNoData(width: number, height: number): void {
        renderEmptyState(this.container, width, height, {
            title: "Set up Bump Chart",
            lines: [
                "X-Axis: Date / Period",
                "Y-Axis: Category (ranked)",
                "Values: Measure (used for ranking)",
                "Legend (optional): Color by field",
                "Group (optional): Split into panels"
            ],
            hint: "Tip: Use the Format pane to adjust label sizes, colors, and legend layout."
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

    public destroy(): void {
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

        if (this.categorySelectionIds.size > 0) {
            const binding = bindSelectionByDataKey({
                root: this.target,
                selectionManager: this.selectionManager,
                markSelector: ".bump-line[data-selection-key], .bump-marker[data-selection-key]",
                selectionIdsByKey: this.categorySelectionIds,
                dimOpacity: 0.2,
                selectedOpacity: 1
            });
            this.applySelectionState = binding.applySelection;
            binding.applySelection(this.selectionManager.getSelectionIds());
        }

        this.svg.on("click", async (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest(".bump-line[data-selection-key], .bump-marker[data-selection-key]")) {
                return;
            }

            await this.selectionManager.clear();
            this.applySelectionState?.([]);
        });

        this.svg.on("contextmenu", (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest(".bump-line[data-selection-key], .bump-marker[data-selection-key]")) {
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

        // Data Colors card
        if (this.categories.length > 0) {
            const defaultColors = this.settings.useCustomColors && this.settings.customColors?.length > 0
                ? this.settings.customColors
                : getSchemeColors(this.settings.colorScheme);

            const colorSlices: powerbi.visuals.FormattingSlice[] = this.categories.map((category, index) => {
                const color = this.categoryColors.get(category) || defaultColors[index % defaultColors.length];
                const selectionId = this.categorySelectionIds.get(category);

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
                            value: { value: color }
                        }
                    }
                } as powerbi.visuals.FormattingSlice;
            });

            cards.push({
                displayName: "Data Colors",
                uid: "dataColors_card",
                groups: [{
                    displayName: "Colors",
                    uid: "dataColors_group",
                    slices: colorSlices
                }]
            });
        }

        cards.push(createTooltipCard(this.settings.tooltip));

        // Y-Axis card
        cards.push({
            displayName: "Y-Axis",
            uid: "yAxis_card",
            groups: [{
                displayName: "Settings",
                uid: "yAxis_group",
                slices: [
                    {
                        uid: "yAxis_show",
                        displayName: "Show Y-Axis",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "yAxisSettings", propertyName: "show" },
                                value: this.settings.showYAxis
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "yAxis_fontSize",
                        displayName: "Font Size",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "yAxisSettings", propertyName: "fontSize" },
                                value: this.settings.yAxisFontSize
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "yAxis_fontFamily",
                        displayName: "Font Family",
                        control: {
                            type: powerbi.visuals.FormattingComponent.FontPicker,
                            properties: {
                                descriptor: { objectName: "yAxisSettings", propertyName: "fontFamily" },
                                value: this.settings.yAxisFontFamily
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "yAxis_color",
                        displayName: "Color",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ColorPicker,
                            properties: {
                                descriptor: { objectName: "yAxisSettings", propertyName: "color" },
                                value: { value: this.settings.yAxisColor }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "yAxis_bold",
                        displayName: "Bold",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "yAxisSettings", propertyName: "bold" },
                                value: this.settings.yAxisBold
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "yAxis_italic",
                        displayName: "Italic",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "yAxisSettings", propertyName: "italic" },
                                value: this.settings.yAxisItalic
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "yAxis_underline",
                        displayName: "Underline",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "yAxisSettings", propertyName: "underline" },
                                value: this.settings.yAxisUnderline
                            }
                        }
                    } as powerbi.visuals.FormattingSlice
                ]
            }]
        });

        // X-Axis card
        cards.push({
            displayName: "X-Axis",
            uid: "xAxis_card",
            groups: [{
                displayName: "Settings",
                uid: "xAxis_group",
                slices: [
                    {
                        uid: "xAxis_show",
                        displayName: "Show X-Axis",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "xAxisSettings", propertyName: "show" },
                                value: this.settings.showXAxis
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "xAxis_fontSize",
                        displayName: "Font Size",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "xAxisSettings", propertyName: "fontSize" },
                                value: this.settings.xAxisFontSize
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "xAxis_fontFamily",
                        displayName: "Font Family",
                        control: {
                            type: powerbi.visuals.FormattingComponent.FontPicker,
                            properties: {
                                descriptor: { objectName: "xAxisSettings", propertyName: "fontFamily" },
                                value: this.settings.xAxisFontFamily
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "xAxis_color",
                        displayName: "Color",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ColorPicker,
                            properties: {
                                descriptor: { objectName: "xAxisSettings", propertyName: "color" },
                                value: { value: this.settings.xAxisColor }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "xAxis_bold",
                        displayName: "Bold",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "xAxisSettings", propertyName: "bold" },
                                value: this.settings.xAxisBold
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "xAxis_italic",
                        displayName: "Italic",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "xAxisSettings", propertyName: "italic" },
                                value: this.settings.xAxisItalic
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "xAxis_underline",
                        displayName: "Underline",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "xAxisSettings", propertyName: "underline" },
                                value: this.settings.xAxisUnderline
                            }
                        }
                    } as powerbi.visuals.FormattingSlice
                ]
            }]
        });

        // Legend card
        cards.push({
            displayName: "Legend",
            uid: "legend_card",
            groups: [{
                displayName: "Settings",
                uid: "legend_group",
                slices: [
                    {
                        uid: "legend_position",
                        displayName: "Position",
                        control: {
                            type: powerbi.visuals.FormattingComponent.Dropdown,
                            properties: {
                                descriptor: { objectName: "legend", propertyName: "position" },
                                value: this.settings.legendPosition
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
                                value: this.settings.legendFontSize,
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
                                value: this.settings.maxLegendItems,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 1 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 50 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice
                ]
            }]
        });

        // Text Sizes card (shows effective starting sizes instead of 0="auto")
        cards.push(createTextSizesCard({
            xAxisFontSize: this.settings.textSizes.xAxisFontSize || this.settings.xAxisFontSize,
            yAxisFontSize: this.settings.textSizes.yAxisFontSize || this.settings.yAxisFontSize,
            legendFontSize: this.settings.textSizes.legendFontSize || this.settings.legendFontSize,
            panelTitleFontSize: this.settings.textSizes.panelTitleFontSize || this.settings.smallMultiples.titleFontSize,
            endLabelFontSize: this.settings.textSizes.endLabelFontSize || this.settings.yAxisFontSize
        }));

        cards.push(createSmallMultiplesCard({
            spacing: this.settings.smallMultiples.spacing,
            showTitle: this.settings.smallMultiples.showTitle,
            titleSpacing: this.settings.smallMultiples.titleSpacing
        }));

        // Bump Chart card
        cards.push({
            displayName: "Bump Chart",
            uid: "bumpChart_card",
            groups: [{
                displayName: "Settings",
                uid: "bumpChart_group",
                slices: [
                    {
                        uid: "bumpChart_lineThickness",
                        displayName: "Line Thickness",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "bumpChartSettings", propertyName: "lineThickness" },
                                value: this.settings.bumpChart.lineThickness
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
                                value: this.settings.bumpChart.showMarkers
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
                                value: this.settings.bumpChart.markerSize
                            }
                        }
                    } as powerbi.visuals.FormattingSlice
                ]
            }]
        });

        return { cards };
    }
}
