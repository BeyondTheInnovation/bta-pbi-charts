"use strict";

import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ITooltipService = powerbi.extensibility.ITooltipService;

import {
    d3,
    RenderContext,
    createColorSchemeCard,
    createLegendCard,
    createSmallMultiplesCard,
    createTextSizesCard,
    createTooltipCard,
    createXAxisCard,
    createYAxisCard,
    HtmlTooltip
} from "@pbi-visuals/shared";

import { IVisualSettings, parseSettings } from "./settings";
import { ChartTransformer } from "./ChartTransformer";
import { ChartRenderer } from "./ChartRenderer";

export class Visual implements IVisual {
    private static instanceCounter: number = 0;
    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private host: IVisualHost;
    private tooltipService: ITooltipService;
    private settings: IVisualSettings | null = null;
    private renderer: ChartRenderer | null = null;
    private htmlTooltip: HtmlTooltip | null = null;
    private tooltipOwnerId: string;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;
        this.tooltipOwnerId = "bta-waterfall-chart-" + Visual.instanceCounter++;

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("waterfall-chart-visual", true)
            .style("position", "absolute")
            .style("inset", "0");

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
            this.svg.attr("width", width).attr("height", height).attr("viewBox", "0 0 " + width + " " + height);

            this.svg.on("mouseleave", () => {
                this.htmlTooltip?.hide();
                this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
            });

            if (!options.dataViews || !options.dataViews[0] || (!options.dataViews[0].categorical && !options.dataViews[0].table)) {
                this.renderNoData();
                return;
            }

            const dataView = options.dataViews[0];
            this.settings = parseSettings(dataView);
            this.syncHtmlTooltip();

            const context: RenderContext = {
                svg: this.svg,
                container: this.container,
                tooltipService: this.tooltipService,
                root: this.target,
                width,
                height,
                htmlTooltip: this.htmlTooltip,
                colorPalette: this.host.colorPalette,
                isHighContrast: Boolean((this.host.colorPalette as any)?.isHighContrast)
            };

            this.renderer = new ChartRenderer(context);
            const chartData = ChartTransformer.transform(dataView);

            if (!chartData.dataPoints.length) {
                this.renderNoData();
                return;
            }

            this.renderer.render(chartData, this.settings);
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

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const cards: powerbi.visuals.FormattingCard[] = [];

        if (!this.settings) {
            return { cards };
        }

        cards.push(createTooltipCard(this.settings.tooltip));

        cards.push(createColorSchemeCard(this.settings.colorScheme));

        cards.push(createLegendCard({
            show: this.settings.showLegend,
            position: this.settings.legendPosition,
            fontSize: this.settings.textSizes.legendFontSize || this.settings.legendFontSize,
            maxItems: this.settings.maxLegendItems
        }));

        cards.push(createXAxisCard({
            show: this.settings.showXAxis,
            fontSize: this.settings.textSizes.xAxisFontSize || this.settings.xAxisFontSize,
            rotateLabels: this.settings.rotateXLabels,
            fontFamily: this.settings.xAxisFontFamily,
            bold: this.settings.xAxisBold,
            italic: this.settings.xAxisItalic,
            underline: this.settings.xAxisUnderline,
            color: this.settings.xAxisColor
        }));

        cards.push(createYAxisCard({
            show: this.settings.showYAxis,
            fontSize: this.settings.textSizes.yAxisFontSize || this.settings.yAxisFontSize,
            fontFamily: this.settings.yAxisFontFamily,
            bold: this.settings.yAxisBold,
            italic: this.settings.yAxisItalic,
            underline: this.settings.yAxisUnderline,
            color: this.settings.yAxisColor
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

        return { cards };
    }

    public destroy(): void {
        try {
            this.htmlTooltip?.destroy();
            this.htmlTooltip = null;
            this.target.querySelectorAll('[data-bta-tooltip="true"]').forEach((el) => el.remove());
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
