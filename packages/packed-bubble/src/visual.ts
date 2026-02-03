"use strict";

import powerbi from "powerbi-visuals-api";
import * as d3 from "d3";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ITooltipService = powerbi.extensibility.ITooltipService;
import ISelectionId = powerbi.visuals.ISelectionId;

import {
    RenderContext,
    createBubbleSettingsCard,
    createColorSchemeCard,
    createDataColorsCard,
    createGeneralCard,
    createLegendCard,
    createSmallMultiplesCard,
    createTextSizesCard,
    createTooltipCard,
    findCategoryIndex,
    getSchemeColors,
    readCategoryColorsFromDataView,
    renderEmptyState
} from "@pbi-visuals/shared";
import { IBubbleVisualSettings, parseSettings } from "./settings";
import { BubbleTransformer } from "./BubbleTransformer";
import { BubbleRenderer } from "./BubbleRenderer";

export class Visual implements IVisual {
    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private host: IVisualHost;
    private tooltipService: ITooltipService;
    private settings: IBubbleVisualSettings | null = null;
    private renderer: BubbleRenderer | null = null;

    // Data-bound colors
    private categorySelectionIds: Map<string, ISelectionId> = new Map();
    private categories: string[] = [];
    private categoryColors: Map<string, string> = new Map();
    private categoryFieldIndex: number = -1;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("packed-bubble-visual", true);

        this.container = this.svg.append("g")
            .classed("chart-container", true);
    }

    public update(options: VisualUpdateOptions) {
        // Clear previous content
        this.svg.selectAll("*").remove();
        this.container = this.svg.append("g").classed("chart-container", true);
        this.target.querySelectorAll('[data-bta-tooltip="true"]').forEach(el => el.remove());

        const width = options.viewport.width;
        const height = options.viewport.height;

        this.svg.attr("width", width).attr("height", height);

        // Validate data
        if (!options.dataViews || !options.dataViews[0] || !options.dataViews[0].categorical) {
            this.renderNoData(width, height);
            return;
        }

        const dataView = options.dataViews[0];

        // Parse settings
        this.settings = parseSettings(dataView);

        // Find the yAxis category index (bubble categories)
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
            root: this.target,
            width,
            height
        };

        // Create renderer
        this.renderer = new BubbleRenderer(context);

        // Transform data
        const chartData = BubbleTransformer.transform(dataView.categorical);

        // Check if data is empty
        if (!chartData.nodes || chartData.nodes.length === 0) {
            this.renderNoData(width, height);
            return;
        }

        // Pass color overrides to chart data
        chartData.categoryColorMap = this.categoryColors;

        // Render the chart
        this.renderer.render(chartData, this.settings);
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
            title: "Set up Packed Bubble",
            lines: [
                "Category: Bubble group (color/labels)",
                "Values: Measure (bubble size)",
                "Legend (optional): Color by field",
                "Group By (optional): Small multiples panels"
            ],
            hint: "Tip: Enable clustering in the Format pane for grouped layouts."
        });
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

        cards.push(createGeneralCard({
            responsiveText: this.settings.responsiveText,
            fontScaleFactor: this.settings.fontScaleFactor
        }));

        cards.push(createTooltipCard(this.settings.tooltip));

        cards.push(createColorSchemeCard(this.settings.colorScheme));

        cards.push(createLegendCard({
            show: this.settings.showLegend,
            position: this.settings.legendPosition,
            fontSize: this.settings.legendFontSize,
            maxItems: this.settings.maxLegendItems
        }));

        cards.push(createTextSizesCard(this.settings.textSizes));

        cards.push(createBubbleSettingsCard(this.settings.bubble));

        cards.push(createSmallMultiplesCard(this.settings.smallMultiples));

        return { cards };
    }
}
