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
    createDonutLabelsCard,
    createDonutSettingsCard,
    createGeneralCard,
    createLegendCard,
    createSmallMultiplesCard,
    createTextSizesCard,
    createTooltipCard,
    findCategoryIndex,
    getSchemeColors,
    readCategoryColorsFromDataView,
    renderEmptyState,
    HtmlTooltip
} from "@pbi-visuals/shared";

import { IDonutVisualSettings, parseSettings } from "./settings";
import { DonutChartTransformer } from "./DonutChartTransformer";
import { DonutChartRenderer } from "./DonutChartRenderer";

export class Visual implements IVisual {
    private static instanceCounter: number = 0;
    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private host: IVisualHost;
    private tooltipService: ITooltipService;
    private settings: IDonutVisualSettings | null = null;
    private renderer: DonutChartRenderer | null = null;
    private htmlTooltip: HtmlTooltip | null = null;
    private tooltipOwnerId: string;

    private categorySelectionIds: Map<string, ISelectionId> = new Map();
    private categories: string[] = [];
    private categoryColors: Map<string, string> = new Map();
    private categoryFieldIndex: number = -1;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;
        this.tooltipOwnerId = `bta-donut-${Visual.instanceCounter++}`;

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("donut-chart-visual", true);

        this.svg
            .style("position", "absolute")
            .style("inset", "0");

        this.container = this.svg.append("g")
            .classed("chart-container", true);
    }

    public update(options: VisualUpdateOptions) {
        this.svg.selectAll("*").remove();
        this.container = this.svg.append("g").classed("chart-container", true);
        this.htmlTooltip?.hide();

        const width = options.viewport.width;
        const height = options.viewport.height;

        this.svg.attr("width", width).attr("height", height);

        if (!options.dataViews || !options.dataViews[0] || !options.dataViews[0].categorical) {
            this.renderNoData(width, height);
            return;
        }

        const dataView = options.dataViews[0];
        this.settings = parseSettings(dataView);
        this.syncHtmlTooltip();

        this.categoryFieldIndex = findCategoryIndex(dataView, "category");
        this.buildCategorySelectionIds(dataView);
        this.categoryColors = readCategoryColorsFromDataView(dataView, this.categoryFieldIndex);

        const context: RenderContext = {
            svg: this.svg,
            container: this.container,
            tooltipService: this.tooltipService,
            root: this.target,
            width,
            height,
            htmlTooltip: this.htmlTooltip
        };

        this.renderer = new DonutChartRenderer(context);
        const chartData = DonutChartTransformer.transform(dataView.categorical);

        if (!chartData.dataPoints || chartData.dataPoints.length === 0) {
            this.renderNoData(width, height);
            return;
        }

        chartData.categoryColorMap = this.categoryColors;
        this.renderer.render(chartData, this.settings);
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
            const categoryValue = String(categoryColumn.values[i] ?? "");
            if (seen.has(categoryValue)) continue;
            seen.add(categoryValue);
            this.categories.push(categoryValue);

            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(categoryColumn, i)
                .createSelectionId();
            this.categorySelectionIds.set(categoryValue, selectionId);
        }

        this.categories.sort();
    }

    private renderNoData(width: number, height: number): void {
        renderEmptyState(this.container, width, height, {
            title: "Set up Donut Chart",
            lines: [
                "Category: Slice labels",
                "Values: Measure (slice size)",
                "Group By (optional): Small multiples panels"
            ],
            hint: "Tip: Use the Tooltips and Data Labels cards for a polished experience."
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

        cards.push(createDonutSettingsCard(this.settings.donut));

        cards.push(createDonutLabelsCard(this.settings.donutLabels));

        cards.push(createSmallMultiplesCard(this.settings.smallMultiples));

        return { cards };
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
}
