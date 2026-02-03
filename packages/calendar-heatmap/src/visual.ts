"use strict";

import powerbi from "powerbi-visuals-api";
import * as d3 from "d3";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ITooltipService = powerbi.extensibility.ITooltipService;

import {
    RenderContext,
    createCalendarSettingsCard,
    createColorSchemeCard,
    createGeneralCard,
    createGradientColorsCard,
    createLegendCard,
    createSmallMultiplesCard,
    createTextSizesCard,
    createTooltipCard,
    createYAxisCard,
    renderEmptyState
} from "@pbi-visuals/shared";
import { ICalendarVisualSettings, parseSettings } from "./settings";
import { CalendarTransformer } from "./CalendarTransformer";
import { CalendarRenderer } from "./CalendarRenderer";

export class Visual implements IVisual {
    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private host: IVisualHost;
    private tooltipService: ITooltipService;
    private settings: ICalendarVisualSettings | null = null;
    private renderer: CalendarRenderer | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("calendar-heatmap-visual", true);

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
        this.renderer = new CalendarRenderer(context);

        // Transform data
        const chartData = CalendarTransformer.transform(dataView.categorical);

        // Check if data is empty
        if (!chartData.calendarPoints || chartData.calendarPoints.length === 0) {
            this.renderNoData(width, height);
            return;
        }

        // Render the chart
        this.renderer.render(chartData, this.settings);
    }

    private renderNoData(width: number, height: number): void {
        renderEmptyState(this.container, width, height, {
            title: "Set up Calendar Heatmap",
            lines: [
                "Date: Daily date field",
                "Values: Measure (cell intensity)",
                "Group By (optional): Small multiples panels"
            ],
            hint: "Tip: Use a Date column (not Month name) for proper daily placement."
        });
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const cards: powerbi.visuals.FormattingCard[] = [];

        if (!this.settings) {
            return { cards };
        }

        cards.push(createGeneralCard({
            responsiveText: this.settings.responsiveText,
            fontScaleFactor: this.settings.fontScaleFactor
        }));

        cards.push(createTooltipCard(this.settings.tooltip));

        cards.push(createColorSchemeCard(this.settings.colorScheme));

        cards.push(createGradientColorsCard(this.settings.calendar.minColor, this.settings.calendar.maxColor));

        cards.push(createLegendCard({
            show: this.settings.showLegend,
            position: this.settings.legendPosition,
            fontSize: this.settings.legendFontSize,
            maxItems: this.settings.maxLegendItems
        }));

        // Day labels live in yAxisSettings
        cards.push(createYAxisCard({
            show: this.settings.showYAxis,
            fontSize: this.settings.yAxisFontSize
        }));

        cards.push(createTextSizesCard(this.settings.textSizes));

        cards.push(createCalendarSettingsCard(this.settings.calendar));

        cards.push(createSmallMultiplesCard(this.settings.smallMultiples));

        return { cards };
    }

}
