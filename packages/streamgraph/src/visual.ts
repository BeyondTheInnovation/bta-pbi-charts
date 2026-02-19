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
    createColorSchemeCard,
    createDataColorsCard,
    createLegendCard,
    createSmallMultiplesCard,
    createStreamgraphSettingsCard,
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
import { IStreamgraphVisualSettings, parseSettings } from "./settings";
import { StreamgraphTransformer } from "./StreamgraphTransformer";
import { StreamgraphRenderer } from "./StreamgraphRenderer";

export class Visual implements IVisual {
    private static instanceCounter: number = 0;
    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private host: IVisualHost;
    private tooltipService: ITooltipService;
    private selectionManager: powerbi.extensibility.ISelectionManager;
    private settings: IStreamgraphVisualSettings | null = null;
    private renderer: StreamgraphRenderer | null = null;
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
    private exportControl: ExportControl;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipOwnerId = `bta-streamgraph-${Visual.instanceCounter++}`;
        this.emptySelectionId = this.host.createSelectionIdBuilder().createSelectionId();
        this.allowInteractions = this.host.hostCapabilities?.allowInteractions !== false;

        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            this.applySelectionState?.(ids);
        });

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("streamgraph-visual", true);

        this.svg
            .style("position", "absolute")
            .style("inset", "0");

        this.container = this.svg.append("g")
            .classed("chart-container", true);

        this.exportControl = createExportControl({
            host: this.host,
            root: this.target,
            fileNamePrefix: "streamgraph"
        });
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
        this.exportControl.setSnapshotSource({
            svgElement: this.svg.node(),
            viewportWidth: width,
            viewportHeight: height,
            scrollLeft: this.target.scrollLeft || 0,
            scrollTop: this.target.scrollTop || 0
        });
        this.exportControl.setHasData(false);
        void this.exportControl.refreshCapability();

        // Hide tooltip when mouse leaves the chart entirely
        this.svg.on("mouseleave", () => {
            this.htmlTooltip?.hide();
            this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
        });

        // Validate data
        if (!options.dataViews || !options.dataViews[0] || !options.dataViews[0].categorical) {
            this.renderNoData();
            return;
        }

        const dataView = options.dataViews[0];

        // Parse settings
        this.settings = parseSettings(dataView);
        this.syncHtmlTooltip();

        // Prefer legend for series colors/selection IDs when bound; otherwise fall back to yAxis (legacy).
        const legendCategoryIndex = findCategoryIndex(dataView, "legend");
        const yAxisCategoryIndex = findCategoryIndex(dataView, "yAxis");
        this.categoryFieldIndex = legendCategoryIndex >= 0 ? legendCategoryIndex : yAxisCategoryIndex;

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
        this.renderer = new StreamgraphRenderer(context);

        // Transform data
        const chartData = StreamgraphTransformer.transform(dataView.categorical);

        // Check if data is empty
        if (!chartData.dataPoints || chartData.dataPoints.length === 0) {
            this.renderNoData();
            return;
        }

        // Seed initial series colors so the rendered palette matches the Data Colors defaults.
        const defaultColors = this.settings.useCustomColors && this.settings.customColors?.length > 0
            ? this.settings.customColors
            : getSchemeColors(this.settings.colorScheme);
        const seededColors = new Map<string, string>(this.categoryColors);
        chartData.yValues.forEach((k, i) => {
            if (!seededColors.has(k)) {
                seededColors.set(k, defaultColors[i % defaultColors.length]);
            }
        });
        chartData.categoryColorMap = seededColors;

        // Render the chart
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

        // Keep ordering stable and consistent with transformer series ordering.
        this.categories.sort((a, b) => a.localeCompare(b));
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

    public enumerateObjectInstances(options: powerbi.EnumerateVisualObjectInstancesOptions): powerbi.VisualObjectInstanceEnumeration {
        const objectName = options.objectName;
        const instances: powerbi.VisualObjectInstance[] = [];

        // Handle per-category Data Colors
        if (objectName === "categoryColors" && this.categories.length > 0 && this.settings) {
            const defaultColors = this.settings.useCustomColors && this.settings.customColors?.length > 0
                ? this.settings.customColors
                : getSchemeColors(this.settings.colorScheme);

            this.categories.forEach((category, index) => {
                const color = this.categoryColors.get(category) || defaultColors[index % defaultColors.length];
                const selectionId = this.categorySelectionIds.get(category);

                instances.push({
                    objectName,
                    displayName: category,
                    properties: {
                        fill: { solid: { color } }
                    },
                    selector: selectionId ? selectionId.getSelector() : null
                });
            });
        }

        return instances;
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

        cards.push(createTooltipCard(this.settings.tooltip));

        cards.push(createColorSchemeCard(this.settings.colorScheme));

        cards.push(createLegendCard({
            position: this.settings.legendPosition,
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
            panelTitleFontSize: this.settings.textSizes.panelTitleFontSize || this.settings.smallMultiples.titleFontSize
        }));

        cards.push(createSmallMultiplesCard({
            spacing: this.settings.smallMultiples.spacing,
            showTitle: this.settings.smallMultiples.showTitle,
            titleSpacing: this.settings.smallMultiples.titleSpacing
        }));

        cards.push(createStreamgraphSettingsCard(this.settings.streamgraph));

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

    private bindInteractions(): void {
        this.applySelectionState = null;
        if (!this.allowInteractions) {
            return;
        }

        if (this.categorySelectionIds.size > 0) {
            const binding = bindSelectionByDataKey({
                root: this.target,
                selectionManager: this.selectionManager,
                markSelector: ".stream-layer[data-selection-key]",
                selectionIdsByKey: this.categorySelectionIds,
                dimOpacity: 0.2,
                selectedOpacity: 1
            });
            this.applySelectionState = binding.applySelection;
            binding.applySelection(this.selectionManager.getSelectionIds());
        }

        this.svg.on("click", async (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest(".stream-layer[data-selection-key]")) {
                return;
            }

            await this.selectionManager.clear();
            this.applySelectionState?.([]);
        });

        this.svg.on("contextmenu", (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest(".stream-layer[data-selection-key]")) {
                return;
            }

            event.preventDefault();
            this.selectionManager.showContextMenu(this.emptySelectionId, { x: event.clientX, y: event.clientY })
                .catch(() => undefined);
        });
    }
}
