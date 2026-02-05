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
    createCalendarSettingsCard,
    createColorSchemeCard,
    createGradientColorsCard,
    createSmallMultiplesCard,
    createTextSizesCard,
    createTooltipCard,
    createYAxisCard,
    findCategoryIndex,
    renderEmptyState,
    HtmlTooltip,
    bindSelectionByDataKey
} from "@pbi-visuals/shared";
import { ICalendarVisualSettings, parseSettings } from "./settings";
import { CalendarTransformer } from "./CalendarTransformer";
import { CalendarRenderer } from "./CalendarRenderer";

export class Visual implements IVisual {
    private static instanceCounter: number = 0;
    private target: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private host: IVisualHost;
    private tooltipService: ITooltipService;
    private selectionManager: powerbi.extensibility.ISelectionManager;
    private settings: ICalendarVisualSettings | null = null;
    private renderer: CalendarRenderer | null = null;
    private htmlTooltip: HtmlTooltip | null = null;
    private tooltipOwnerId: string;
    private emptySelectionId: ISelectionId;
    private applySelectionState: ((ids: ISelectionId[]) => void) | null = null;
    private dateSelectionIds: Map<string, ISelectionId> = new Map();
    private xAxisFieldIndex: number = -1;
    private allowInteractions: boolean;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipOwnerId = `bta-calendar-${Visual.instanceCounter++}`;
        this.emptySelectionId = this.host.createSelectionIdBuilder().createSelectionId();
        this.allowInteractions = this.host.hostCapabilities?.allowInteractions !== false;

        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            this.applySelectionState?.(ids);
        });

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("calendar-heatmap-visual", true);

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
        this.xAxisFieldIndex = findCategoryIndex(dataView, "xAxis");
        this.buildDateSelectionIds(dataView);

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

    private renderNoData(width: number, height: number): void {
        renderEmptyState(this.container, width, height, {
            title: "Set up Calendar Heatmap",
            lines: [
                "Date: Daily date field",
                "Values: Measure (cell intensity)",
                "Group (optional): Split into panels"
            ],
            hint: "Tip: Use a Date column (not Month name) for proper daily placement."
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

        cards.push(createTooltipCard(this.settings.tooltip));

        cards.push(createColorSchemeCard(this.settings.colorScheme));

        cards.push(createGradientColorsCard(this.settings.calendar.minColor, this.settings.calendar.maxColor));

        // Day labels live in yAxisSettings
        cards.push(createYAxisCard({
            show: this.settings.showYAxis,
            fontSize: this.settings.yAxisFontSize,
            fontFamily: this.settings.yAxisFontFamily,
            bold: this.settings.yAxisBold,
            italic: this.settings.yAxisItalic,
            underline: this.settings.yAxisUnderline,
            color: this.settings.yAxisColor
        }));

        cards.push(createTextSizesCard({
            yearLabelFontSize: this.settings.textSizes.yearLabelFontSize || 11,
            monthLabelFontSize: this.settings.textSizes.monthLabelFontSize || 9,
            dayLabelFontSize: this.settings.textSizes.dayLabelFontSize || this.settings.yAxisFontSize,
            panelTitleFontSize: this.settings.textSizes.panelTitleFontSize || this.settings.smallMultiples.titleFontSize
        }));

        cards.push(createSmallMultiplesCard({
            spacing: this.settings.smallMultiples.spacing,
            showTitle: this.settings.smallMultiples.showTitle,
            titleSpacing: this.settings.smallMultiples.titleSpacing
        }));

        cards.push(createCalendarSettingsCard(this.settings.calendar));

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

    private toDateKey(value: any): string | null {
        if (value === null || value === undefined) return null;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    private buildDateSelectionIds(dataView: powerbi.DataView): void {
        this.dateSelectionIds.clear();

        if (this.xAxisFieldIndex < 0 || !dataView.categorical?.categories?.[this.xAxisFieldIndex]) {
            return;
        }

        const categoryColumn = dataView.categorical.categories[this.xAxisFieldIndex];
        for (let i = 0; i < categoryColumn.values.length; i++) {
            const dateKey = this.toDateKey(categoryColumn.values[i]);
            if (!dateKey || this.dateSelectionIds.has(dateKey)) {
                continue;
            }

            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(categoryColumn, i)
                .createSelectionId();

            this.dateSelectionIds.set(dateKey, selectionId);
        }
    }

    private bindInteractions(): void {
        this.applySelectionState = null;
        if (!this.allowInteractions) {
            return;
        }

        if (this.dateSelectionIds.size > 0) {
            const binding = bindSelectionByDataKey({
                root: this.target,
                selectionManager: this.selectionManager,
                markSelector: '.calendar-cell[data-selection-key]:not([data-selection-key=""])',
                selectionIdsByKey: this.dateSelectionIds,
                dimOpacity: 0.25,
                selectedOpacity: 1
            });
            this.applySelectionState = binding.applySelection;
            binding.applySelection(this.selectionManager.getSelectionIds());
        }

        this.svg.on("click", async (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest('.calendar-cell[data-selection-key]:not([data-selection-key=""])')) {
                return;
            }

            await this.selectionManager.clear();
            this.applySelectionState?.([]);
        });

        this.svg.on("contextmenu", (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest('.calendar-cell[data-selection-key]:not([data-selection-key=""])')) {
                return;
            }

            event.preventDefault();
            this.selectionManager.showContextMenu(this.emptySelectionId, { x: event.clientX, y: event.clientY })
                .catch(() => undefined);
        });
    }

}
