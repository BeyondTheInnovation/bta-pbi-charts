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
    createGradientColorsCard,
    createHeatmapSettingsCard,
    createSmallMultiplesCard,
    createTextSizesCard,
    createTooltipCard,
    createXAxisCard,
    createYAxisCard,
    HtmlTooltip
} from "@pbi-visuals/shared";
import { IHeatmapVisualSettings, parseSettings } from "./settings";
import { HeatmapTransformer } from "./HeatmapTransformer";
import { HeatmapRenderer } from "./HeatmapRenderer";

export class Visual implements IVisual {
    private static instanceCounter: number = 0;
    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private host: IVisualHost;
    private tooltipService: ITooltipService;
    private selectionManager: powerbi.extensibility.ISelectionManager;
    private settings: IHeatmapVisualSettings | null = null;
    private renderer: HeatmapRenderer | null = null;
    private htmlTooltip: HtmlTooltip | null = null;
    private tooltipOwnerId: string;
    private emptySelectionId: ISelectionId;
    private allowInteractions: boolean;
    private readonly onTargetScroll: () => void;
    private exportControl: ExportControl;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipOwnerId = `bta-heatmap-${Visual.instanceCounter++}`;
        this.emptySelectionId = this.host.createSelectionIdBuilder().createSelectionId();
        this.allowInteractions = this.host.hostCapabilities?.allowInteractions !== false;
        this.onTargetScroll = () => {
            this.syncPinnedLayers();
            this.htmlTooltip?.hide();
            this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
        };
        this.target.style.position = "relative";
        this.target.style.overflowX = "hidden";
        this.target.style.overflowY = "hidden";
        this.target.addEventListener("scroll", this.onTargetScroll, { passive: true });

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("heatmap-visual", true);

        this.svg
            .style("position", "absolute")
            .style("left", "0")
            .style("top", "0");

        this.container = this.svg.append("g")
            .classed("chart-container", true);

        this.exportControl = createExportControl({
            host: this.host,
            root: this.target,
            fileNamePrefix: "heatmap"
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

        this.target.style.overflowX = "hidden";
        this.target.style.overflowY = "hidden";

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
        if (!options.dataViews || !options.dataViews[0] || !options.dataViews[0].matrix) {
            this.renderNoData();
            return;
        }

        const dataView = options.dataViews[0];

        // Parse settings
        this.settings = parseSettings(dataView);
        this.target.style.overflowX = this.settings.heatmap.enableHorizontalScroll ? "auto" : "hidden";
        this.target.style.overflowY = this.settings.heatmap.enableVerticalScroll ? "auto" : "hidden";
        if (!this.settings.heatmap.enableHorizontalScroll) {
            this.target.scrollLeft = 0;
        }
        if (!this.settings.heatmap.enableVerticalScroll) {
            this.target.scrollTop = 0;
        }
        this.syncHtmlTooltip();

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
        this.renderer = new HeatmapRenderer(context);

        // Transform data
        const chartData = HeatmapTransformer.transform(dataView, this.settings);

        // Check if data is empty
        if (!chartData.dataPoints || chartData.dataPoints.length === 0) {
            this.renderNoData();
            return;
        }

        // Render the chart
        this.exportControl.setHasData(true);
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

    private syncPinnedLayers(): void {
        const scrollLeft = this.target.scrollLeft || 0;
        const scrollTop = this.target.scrollTop || 0;
        const pinnedLayers = this.target.querySelectorAll<SVGGElement>("g.pinned-y-layer");
        pinnedLayers.forEach((layer) => {
            const pinLeft = Number(layer.getAttribute("data-pin-left") ?? "0");
            const baseY = Number(layer.getAttribute("data-base-y") ?? "0");
            layer.setAttribute("transform", `translate(${Math.round(pinLeft + scrollLeft)}, ${Math.round(baseY)})`);
        });

        const pinnedXAxisLayers = this.target.querySelectorAll<SVGGElement>("g.pinned-x-layer");
        pinnedXAxisLayers.forEach((layer) => {
            const baseX = Number(layer.getAttribute("data-base-x") ?? "0");
            const pinY = Number(layer.getAttribute("data-pin-y") ?? "0");
            layer.setAttribute("transform", `translate(${Math.round(baseX)}, ${Math.round(pinY + scrollTop)})`);
        });

        const pinnedUiLayers = this.target.querySelectorAll<SVGGElement>("g.pinned-ui-layer");
        pinnedUiLayers.forEach((layer) => {
            const baseX = Number(layer.getAttribute("data-base-x") ?? "0");
            const baseY = Number(layer.getAttribute("data-base-y") ?? "0");
            layer.setAttribute("transform", `translate(${Math.round(baseX + scrollLeft)}, ${Math.round(baseY + scrollTop)})`);
        });
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const cards: powerbi.visuals.FormattingCard[] = [];

        if (!this.settings) {
            return { cards };
        }

        cards.push(createTooltipCard(this.settings.tooltip));

        cards.push(createColorSchemeCard(this.settings.colorScheme));

        // Gradient colors live in heatmapSettings (minColor/maxColor)
        cards.push(createGradientColorsCard(
            this.settings.heatmap.minColor,
            this.settings.heatmap.maxColor,
            "heatmapSettings"
        ));

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
            panelTitleFontSize: this.settings.textSizes.panelTitleFontSize || this.settings.smallMultiples.titleFontSize,
            valueLabelFontSize: this.settings.textSizes.valueLabelFontSize || 10
        }));

        cards.push(createSmallMultiplesCard({
            spacing: this.settings.smallMultiples.spacing,
            showTitle: this.settings.smallMultiples.showTitle,
            titleSpacing: this.settings.smallMultiples.titleSpacing
        }));

        cards.push(createHeatmapSettingsCard(this.settings.heatmap));

        return { cards };
    }

    public destroy(): void {
        this.target.removeEventListener("scroll", this.onTargetScroll);
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
        if (!this.allowInteractions) {
            return;
        }

        this.svg.on("click", async () => {
            await this.selectionManager.clear();
        });

        this.svg.on("contextmenu", (event: MouseEvent) => {
            event.preventDefault();
            this.selectionManager.showContextMenu(this.emptySelectionId, { x: event.clientX, y: event.clientY })
                .catch(() => undefined);
        });
    }

}
