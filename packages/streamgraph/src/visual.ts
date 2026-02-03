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
    createColorSchemeCard,
    createDataColorsCard,
    createGeneralCard,
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
    renderEmptyState
} from "@pbi-visuals/shared";
import { IStreamgraphVisualSettings, parseSettings } from "./settings";
import { StreamgraphTransformer } from "./StreamgraphTransformer";
import { StreamgraphRenderer } from "./StreamgraphRenderer";

export class Visual implements IVisual {
    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private host: IVisualHost;
    private tooltipService: ITooltipService;
    private settings: IStreamgraphVisualSettings | null = null;
    private renderer: StreamgraphRenderer | null = null;

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
            .classed("streamgraph-visual", true);

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

        // Find the yAxis category index (stream layers)
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
        this.renderer = new StreamgraphRenderer(context);

        // Transform data
        const chartData = StreamgraphTransformer.transform(dataView.categorical);

        // Check if data is empty
        if (!chartData.dataPoints || chartData.dataPoints.length === 0) {
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
            title: "Set up Streamgraph",
            lines: [
                "X-Axis: Date / Period",
                "Y-Axis: Category (layers)",
                "Values: Measure (area size)",
                "Legend (optional): Color by field",
                "Group By (optional): Small multiples panels"
            ],
            hint: "Tip: Use Curve Smoothing and Opacity in the Format pane."
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

        cards.push(createYAxisCard({
            show: this.settings.showYAxis,
            fontSize: this.settings.yAxisFontSize
        }));

        cards.push(createXAxisCard({
            show: this.settings.showXAxis,
            fontSize: this.settings.xAxisFontSize,
            rotateLabels: this.settings.rotateXLabels
        }));

        cards.push(createTextSizesCard(this.settings.textSizes));

        cards.push(createStreamgraphSettingsCard(this.settings.streamgraph));

        cards.push(createSmallMultiplesCard(this.settings.smallMultiples));

        return { cards };
    }
}
