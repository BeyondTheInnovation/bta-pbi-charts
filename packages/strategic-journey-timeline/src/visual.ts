"use strict";

import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ITooltipService = powerbi.extensibility.ITooltipService;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;

import {
    d3,
    RenderContext,
    HtmlTooltip,
    bindSelectionByDataKey,
    createDataColorsCard,
    createColorSchemeCard,
    createLegendCard,
    createTooltipCard,
    createXAxisCard,
    getSchemeColors,
    readCategoryColorsFromDataView
} from "@pbi-visuals/shared";

import { IStrategicJourneyVisualSettings, parseSettings } from "./settings";
import { JourneyChartData, StrategicJourneyTransformer } from "./StrategicJourneyTransformer";
import { StrategicJourneyRenderer } from "./StrategicJourneyRenderer";

function createTimelineCard(settings: IStrategicJourneyVisualSettings): powerbi.visuals.FormattingCard {
    return {
        displayName: "Timeline",
        uid: "timeline_card",
        groups: [
            {
                displayName: "Layout",
                uid: "timeline_layout_group",
                slices: [
                    {
                        uid: "timeline_showTodayLine",
                        displayName: "Show Today Line",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "showTodayLine" },
                                value: settings.timeline.showTodayLine
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_spineThickness",
                        displayName: "Spine Thickness",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "spineThickness" },
                                value: settings.timeline.spineThickness,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 1 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 8 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_laneGap",
                        displayName: "Lane Gap",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "laneGap" },
                                value: settings.timeline.laneGap,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 10 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 80 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_cardBandHeight",
                        displayName: "Card Band Height",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "cardBandHeight" },
                                value: settings.timeline.cardBandHeight,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 80 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 500 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice
                ]
            }
        ]
    };
}

function createCardSettingsCard(settings: IStrategicJourneyVisualSettings): powerbi.visuals.FormattingCard {
    return {
        displayName: "Cards",
        uid: "cards_card",
        groups: [
            {
                displayName: "Style",
                uid: "cards_style_group",
                slices: [
                    {
                        uid: "cards_minWidth",
                        displayName: "Min Width",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "cardSettings", propertyName: "minWidth" },
                                value: settings.card.minWidth,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 80 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 300 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "cards_maxWidth",
                        displayName: "Max Width",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "cardSettings", propertyName: "maxWidth" },
                                value: settings.card.maxWidth,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 80 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 360 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "cards_cornerRadius",
                        displayName: "Corner Radius",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "cardSettings", propertyName: "cornerRadius" },
                                value: settings.card.cornerRadius,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 20 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "cards_borderWidth",
                        displayName: "Border Width",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "cardSettings", propertyName: "borderWidth" },
                                value: settings.card.borderWidth,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 4 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "cards_shadow",
                        displayName: "Shadow",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "cardSettings", propertyName: "shadow" },
                                value: settings.card.shadow
                            }
                        }
                    } as powerbi.visuals.FormattingSlice
                ]
            }
        ]
    };
}

function createTextSettingsCard(settings: IStrategicJourneyVisualSettings): powerbi.visuals.FormattingCard {
    return {
        displayName: "Card Text",
        uid: "card_text_card",
        groups: [
            {
                displayName: "Typography",
                uid: "card_text_group",
                slices: [
                    {
                        uid: "card_text_titleFontSize",
                        displayName: "Title Font Size",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "textSettings", propertyName: "titleFontSize" },
                                value: settings.text.titleFontSize,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 8 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 36 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "card_text_subtitleFontSize",
                        displayName: "Subtitle Font Size",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "textSettings", propertyName: "subtitleFontSize" },
                                value: settings.text.subtitleFontSize,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 7 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 32 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "card_text_titleColor",
                        displayName: "Title Color",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ColorPicker,
                            properties: {
                                descriptor: { objectName: "textSettings", propertyName: "titleColor" },
                                value: { value: settings.text.titleColor }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "card_text_subtitleColor",
                        displayName: "Subtitle Color",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ColorPicker,
                            properties: {
                                descriptor: { objectName: "textSettings", propertyName: "subtitleColor" },
                                value: { value: settings.text.subtitleColor }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice
                ]
            }
        ]
    };
}

function createMarkerCard(settings: IStrategicJourneyVisualSettings): powerbi.visuals.FormattingCard {
    return {
        displayName: "Markers",
        uid: "markers_card",
        groups: [
            {
                displayName: "Style",
                uid: "markers_group",
                slices: [
                    {
                        uid: "markers_milestoneRadius",
                        displayName: "Milestone Radius",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "markerSettings", propertyName: "milestoneRadius" },
                                value: settings.marker.milestoneRadius,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 3 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 20 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "markers_spanThickness",
                        displayName: "Span Thickness",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "markerSettings", propertyName: "spanThickness" },
                                value: settings.marker.spanThickness,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 1 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 12 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "markers_connectorOpacity",
                        displayName: "Connector Opacity",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "markerSettings", propertyName: "connectorOpacity" },
                                value: settings.marker.connectorOpacity,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0.08 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 1 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice
                ]
            }
        ]
    };
}

function createStatusColorsCard(
    statuses: string[],
    statusSelectionIds: Map<string, ISelectionId>,
    statusColors: Map<string, string>,
    defaultColors: string[]
): powerbi.visuals.FormattingCard {
    const card = createDataColorsCard(statuses, statusSelectionIds, statusColors, defaultColors);
    return {
        ...card,
        displayName: "Status Colors",
        uid: "status_colors_card",
        groups: card.groups.map((group, index) => ({
            ...group,
            displayName: "Colors",
            uid: `status_colors_group_${index}`
        }))
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
    private settings: IStrategicJourneyVisualSettings | null = null;
    private renderer: StrategicJourneyRenderer | null = null;
    private htmlTooltip: HtmlTooltip | null = null;
    private tooltipOwnerId: string;
    private emptySelectionId: ISelectionId;
    private applySelectionState: ((ids: ISelectionId[]) => void) | null = null;
    private allowInteractions: boolean;
    private scrollRafId: number | null = null;
    private currentViewport: { width: number; height: number; } | null = null;

    private chartData: JourneyChartData | null = null;
    private itemSelectionIds: Map<string, ISelectionId> = new Map();
    private statusSelectionIds: Map<string, ISelectionId> = new Map();
    private statusColors: Map<string, string> = new Map();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipOwnerId = `bta-strategic-journey-${Visual.instanceCounter++}`;
        this.emptySelectionId = this.host.createSelectionIdBuilder().createSelectionId();
        this.allowInteractions = this.host.hostCapabilities?.allowInteractions !== false;

        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            this.applySelectionState?.(ids);
        });

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("strategic-journey-visual", true)
            .style("display", "block")
            .style("position", "relative");

        this.container = this.svg.append("g")
            .classed("chart-container", true);

        this.target.addEventListener("scroll", () => {
            if (!this.chartData || !this.settings || !this.currentViewport) {
                return;
            }

            if (this.scrollRafId !== null && typeof cancelAnimationFrame === "function") {
                cancelAnimationFrame(this.scrollRafId);
            }

            const rerender = () => {
                this.scrollRafId = null;
                this.drawChart(this.currentViewport!.width, this.currentViewport!.height);
            };

            if (typeof requestAnimationFrame === "function") {
                this.scrollRafId = requestAnimationFrame(rerender);
            } else {
                rerender();
            }
        });
    }

    public update(options: VisualUpdateOptions): void {
        const eventService = this.host.eventService;
        eventService?.renderingStarted(options);
        let completed = true;

        try {
            this.svg.selectAll("*").remove();
            this.container = this.svg.append("g").classed("chart-container", true);
            this.htmlTooltip?.hide();
            this.itemSelectionIds.clear();
            this.statusSelectionIds.clear();
            this.statusColors.clear();
            this.applySelectionState = null;
            this.chartData = null;

            const width = options.viewport.width;
            const height = options.viewport.height;
            this.currentViewport = { width, height };
            this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);

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

            this.chartData = StrategicJourneyTransformer.transform(dataView);
            if (!this.chartData.items.length) {
                this.target.style.overflowX = "hidden";
                this.target.style.overflowY = "hidden";
                this.renderNoData();
                return;
            }

            this.buildItemSelectionIds(dataView);
            this.buildStatusSelectionIdsAndColors(dataView);

            const fallbackColors = this.settings.useCustomColors && this.settings.customColors.length > 0
                ? this.settings.customColors
                : getSchemeColors(this.settings.colorScheme);

            const seededColors = new Map(this.statusColors);
            this.chartData.statuses.forEach((status, index) => {
                if (!seededColors.has(status)) {
                    seededColors.set(status, fallbackColors[index % fallbackColors.length]);
                }
            });
            this.chartData.categoryColorMap = seededColors;

            this.drawChart(width, height);
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

    private buildItemSelectionIds(dataView: powerbi.DataView): void {
        this.itemSelectionIds.clear();
        if (!this.chartData) return;

        const titleColumns = (dataView.categorical?.categories ?? []).filter((column) => column.source.roles?.["title"]);
        if (!titleColumns.length) {
            return;
        }

        this.chartData.items.forEach((item) => {
            const selectionId = this.buildSelectionIdForRow(titleColumns, item.sourceRowIndex);
            if (selectionId) {
                this.itemSelectionIds.set(item.selectionKey, selectionId);
            }
        });
    }

    private buildSelectionIdForRow(columns: DataViewCategoryColumn[], rowIndex: number): ISelectionId | null {
        if (!columns.length) {
            return null;
        }

        const builder = this.host.createSelectionIdBuilder();
        let appended = false;

        for (const column of columns) {
            if (rowIndex >= column.values.length) {
                continue;
            }

            const value = column.values[rowIndex];
            if (value === null || value === undefined || String(value).trim() === "") {
                continue;
            }

            try {
                builder.withCategory(column, rowIndex);
                appended = true;
            } catch {
                // Continue assembling the selection id from the remaining hierarchy levels.
            }
        }

        if (!appended) {
            return null;
        }

        try {
            return builder.createSelectionId();
        } catch {
            return null;
        }
    }

    private buildStatusSelectionIdsAndColors(dataView: powerbi.DataView): void {
        this.statusSelectionIds.clear();
        this.statusColors.clear();

        const statusColumns = dataView.categorical?.categories ?? [];
        const statusColumnIndex = statusColumns.findIndex((column) => column.source.roles?.["status"]);
        const statusColumn = statusColumnIndex >= 0 ? statusColumns[statusColumnIndex] : null;
        if (!statusColumn) {
            return;
        }

        this.statusColors = readCategoryColorsFromDataView(dataView, statusColumnIndex);

        const seen = new Set<string>();
        for (let rowIndex = 0; rowIndex < statusColumn.values.length; rowIndex++) {
            const status = String(statusColumn.values[rowIndex] ?? "(Blank)");
            if (!seen.has(status)) {
                seen.add(status);
                const selectionId = this.host.createSelectionIdBuilder()
                    .withCategory(statusColumn, rowIndex)
                    .createSelectionId();
                this.statusSelectionIds.set(status, selectionId);
            }
        }
    }

    private renderNoData(): void {
        this.container.selectAll("*").remove();
    }

    private drawChart(viewportWidth: number, viewportHeight: number): void {
        if (!this.chartData || !this.settings) {
            return;
        }

        this.svg.selectAll("*").remove();
        this.container = this.svg.append("g").classed("chart-container", true);

        const contentWidth = this.computeScrollableWidth(viewportWidth, this.chartData);
        this.target.style.overflowX = contentWidth > viewportWidth ? "auto" : "hidden";
        this.target.style.overflowY = "hidden";
        this.target.style.setProperty("overscroll-behavior-x", "contain");
        this.target.style.touchAction = "pan-x";
        this.target.style.setProperty("-webkit-overflow-scrolling", "touch");
        this.svg.attr("width", contentWidth).attr("height", viewportHeight).attr("viewBox", `0 0 ${contentWidth} ${viewportHeight}`);

        const context: RenderContext = {
            svg: this.svg,
            container: this.container,
            tooltipService: this.tooltipService,
            selectionManager: this.selectionManager,
            root: this.target,
            width: contentWidth,
            height: viewportHeight,
            htmlTooltip: this.htmlTooltip,
            colorPalette: this.host.colorPalette,
            isHighContrast: Boolean((this.host.colorPalette as any)?.isHighContrast)
        };

        this.renderer = new StrategicJourneyRenderer(context);
        this.renderer.render(this.chartData, this.settings);
        this.bindInteractions();
    }

    private computeScrollableWidth(viewportWidth: number, chartData: JourneyChartData): number {
        const itemCount = chartData.items.length;
        if (itemCount <= 10) {
            return viewportWidth;
        }

        const minPixelsPerItem = itemCount > 120 ? 220 : itemCount > 80 ? 205 : itemCount > 40 ? 180 : 155;
        const statusPadding = Math.max(0, chartData.statuses.length - 4) * 18;
        const computedWidth = Math.max(viewportWidth, (itemCount * minPixelsPerItem) + statusPadding + 80);
        return Math.min(32000, computedWidth);
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

    private bindInteractions(): void {
        this.applySelectionState = null;
        if (!this.allowInteractions || this.itemSelectionIds.size === 0) {
            return;
        }

        const binding = bindSelectionByDataKey({
            root: this.target,
            selectionManager: this.selectionManager,
            markSelector: ".journey-item[data-selection-key]",
            selectionIdsByKey: this.itemSelectionIds,
            dimOpacity: 0.24,
            selectedOpacity: 1
        });

        this.applySelectionState = binding.applySelection;
        binding.applySelection(this.selectionManager.getSelectionIds());

        this.svg.on("click", async (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest("[data-selection-key]")) {
                return;
            }

            await this.selectionManager.clear();
            this.applySelectionState?.([]);
        });

        this.svg.on("contextmenu", (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest("[data-selection-key]")) {
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

        if (this.chartData && this.chartData.statuses.length > 0) {
            const fallbackColors = this.settings.useCustomColors && this.settings.customColors.length > 0
                ? this.settings.customColors
                : getSchemeColors(this.settings.colorScheme);

            cards.push(createStatusColorsCard(
                this.chartData.statuses,
                this.statusSelectionIds,
                this.statusColors,
                fallbackColors
            ));
        }

        cards.push(createTooltipCard(this.settings.tooltip));

        cards.push(createColorSchemeCard(this.settings.colorScheme));

        cards.push(createLegendCard({
            show: this.settings.showLegend,
            position: this.settings.legendPosition,
            fontSize: this.settings.legendFontSize,
            maxItems: this.settings.maxLegendItems
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

        cards.push(createTimelineCard(this.settings));
        cards.push(createCardSettingsCard(this.settings));
        cards.push(createTextSettingsCard(this.settings));
        cards.push(createMarkerCard(this.settings));

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
