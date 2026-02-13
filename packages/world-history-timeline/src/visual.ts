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
    createColorSchemeCard,
    createDataColorsCard,
    createLegendCard,
    createTextSizesCard,
    createTooltipCard,
    createXAxisCard,
    createYAxisCard,
    readCategoryColorsFromDataView,
    findCategoryIndex,
    getSchemeColors,
    renderEmptyState,
    HtmlTooltip,
    bindSelectionByDataKey
} from "@pbi-visuals/shared";
import { IWorldHistoryTimelineVisualSettings, TimelineSortMode, parseSettings } from "./settings";
import {
    TimelineTemporalLevel,
    WorldHistoryTimelineData,
    WorldHistoryTimelineTransformer
} from "./WorldHistoryTimelineTransformer";
import { WorldHistoryTimelineRenderer } from "./WorldHistoryTimelineRenderer";

interface SortControlOption {
    mode: TimelineSortMode;
    label: string;
    disabled?: boolean;
}

const SUPPORTED_SORT_OPTIONS: Record<TimelineSortMode, { label: string; requiresRegion?: boolean }> = {
    region: { label: "region", requiresRegion: true },
    time: { label: "time" },
    category: { label: "category" },
    end: { label: "end" },
    duration: { label: "duration" }
};

function createTimelineCard(settings: IWorldHistoryTimelineVisualSettings): powerbi.visuals.FormattingCard {
    return {
        displayName: "Timeline",
        uid: "timeline_card",
        groups: [
            {
                displayName: "Layout",
                uid: "timeline_layout_group",
                slices: [
                    {
                        uid: "timeline_sortBy",
                        displayName: "Sort By",
                        control: {
                            type: powerbi.visuals.FormattingComponent.Dropdown,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "sortBy" },
                                value: settings.timeline.sortBy
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_sortOptions",
                        displayName: "Sort Options",
                        control: {
                            type: powerbi.visuals.FormattingComponent.TextInput,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "sortOptions" },
                                value: settings.timeline.sortOptions
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_lanePadding",
                        displayName: "Lane Padding",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "lanePadding" },
                                value: settings.timeline.lanePadding,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 0.9 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_cornerRadius",
                        displayName: "Bar Corner Radius",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "barCornerRadius" },
                                value: settings.timeline.barCornerRadius,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 24 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_minBarWidth",
                        displayName: "Min Bar Width",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "minBarWidth" },
                                value: settings.timeline.minBarWidth,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 1 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 20 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_showLabels",
                        displayName: "Show Labels",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "showLabels" },
                                value: settings.timeline.showLabels
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_showCrosshair",
                        displayName: "Show Crosshair",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "showCrosshair" },
                                value: settings.timeline.showCrosshair
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
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
                        uid: "timeline_showTopAxis",
                        displayName: "Show Top Axis",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "showTopAxis" },
                                value: settings.timeline.showTopAxis
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "timeline_showBottomAxis",
                        displayName: "Show Bottom Axis",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "timelineSettings", propertyName: "showBottomAxis" },
                                value: settings.timeline.showBottomAxis
                            }
                        }
                    } as powerbi.visuals.FormattingSlice
                ]
            }
        ]
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
    private settings: IWorldHistoryTimelineVisualSettings | null = null;
    private renderer: WorldHistoryTimelineRenderer | null = null;
    private htmlTooltip: HtmlTooltip | null = null;
    private tooltipOwnerId: string;
    private emptySelectionId: ISelectionId;
    private applySelectionState: ((ids: ISelectionId[]) => void) | null = null;
    private allowInteractions: boolean;

    private regionSelectionIds: Map<string, ISelectionId> = new Map();
    private pointSelectionIds: Map<string, ISelectionId> = new Map();
    private regions: string[] = [];
    private regionColors: Map<string, string> = new Map();
    private regionFieldIndex: number = -1;
    private readonly onTargetScroll: () => void;
    private readonly onDocumentPointerDown: (event: MouseEvent) => void;
    private sortControlRoot: HTMLDivElement | null = null;
    private sortControlTrigger: HTMLButtonElement | null = null;
    private sortControlMenu: HTMLDivElement | null = null;
    private runtimeSortBy: TimelineSortMode | null = null;
    private canSortByRegion: boolean = false;
    private lastUpdateOptions: VisualUpdateOptions | null = null;
    private sortControlReservePx: number = 0;

    private static readonly MIN_CONTENT_WIDTH: number = 900;
    private static readonly MAX_CONTENT_WIDTH: number = 300000;
    private static readonly PX_PER_YEAR: number = 24;
    private static readonly PX_PER_QUARTER: number = 18;
    private static readonly PX_PER_MONTH: number = 14;
    private static readonly PX_PER_DAY: number = 6;
    private static readonly MILLISECONDS_PER_YEAR: number = 1000 * 60 * 60 * 24 * 365.25;
    private static readonly MILLISECONDS_PER_DAY: number = 1000 * 60 * 60 * 24;
    private static readonly WIDTH_PADDING: number = 220;
    private static readonly ROW_HEIGHT: number = 20;
    private static readonly HEIGHT_PADDING: number = 140;
    private static readonly MIN_CONTENT_HEIGHT: number = 460;
    private static readonly MAX_CONTENT_HEIGHT: number = 12000;
    private static readonly HEADER_TOP_PADDING: number = 6;
    private static readonly HEADER_LEFT_PADDING: number = 8;
    private static readonly HEADER_LAYER_GAP: number = 4;
    private lastLayoutKey: string = "";
    private lastViewportWidth: number = 0;
    private lastViewportHeight: number = 0;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.tooltipService = this.host.tooltipService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipOwnerId = `bta-world-history-${Visual.instanceCounter++}`;
        this.emptySelectionId = this.host.createSelectionIdBuilder().createSelectionId();
        this.allowInteractions = this.host.hostCapabilities?.allowInteractions !== false;
        this.target.style.position = "relative";
        this.target.style.overflowX = "auto";
        this.target.style.overflowY = "auto";
        this.onTargetScroll = () => {
            this.syncPinnedLayers();
            this.setSortMenuOpen(false);
            this.htmlTooltip?.hide();
            this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
        };
        this.target.addEventListener("scroll", this.onTargetScroll, { passive: true });
        this.onDocumentPointerDown = (event: MouseEvent) => {
            if (!this.sortControlRoot) {
                return;
            }
            if (!this.sortControlRoot.contains(event.target as Node)) {
                this.setSortMenuOpen(false);
            }
        };
        if (typeof document !== "undefined") {
            document.addEventListener("mousedown", this.onDocumentPointerDown, true);
        }

        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            this.applySelectionState?.(ids);
        });

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("pbi-visual", true)
            .classed("world-history-timeline-visual", true)
            .style("position", "absolute")
            .style("left", "0")
            .style("top", "0");

        this.container = this.svg.append("g")
            .classed("chart-container", true);

        this.ensureSortControl();
    }

    public update(options: VisualUpdateOptions): void {
        const eventService = this.host.eventService;
        eventService?.renderingStarted(options);
        let completed = true;
        this.lastUpdateOptions = options;

        try {
            this.svg.selectAll("*").remove();
            this.container = this.svg.append("g").classed("chart-container", true);
            this.htmlTooltip?.hide();

            const width = options.viewport.width;
            const height = options.viewport.height;
            const viewportChanged = width !== this.lastViewportWidth || height !== this.lastViewportHeight;
            this.target.style.overflowX = "auto";
            this.target.style.overflowY = "auto";

            this.svg.on("mouseleave", () => {
                this.htmlTooltip?.hide();
                this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
            });

            if (!options.dataViews || !options.dataViews[0] || !options.dataViews[0].categorical) {
                this.syncSortControl(false, "time", []);
                this.lastLayoutKey = "";
                this.lastViewportWidth = width;
                this.lastViewportHeight = height;
                this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
                this.renderNoData(width, height);
                return;
            }

            const dataView = options.dataViews[0];
            this.settings = parseSettings(dataView);
            this.syncHtmlTooltip();

            this.regionFieldIndex = findCategoryIndex(dataView, "region");
            this.buildRegionSelectionIds(dataView);
            this.buildPointSelectionIds(dataView);
            this.regionColors = readCategoryColorsFromDataView(dataView, this.regionFieldIndex);

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

            const chartData = WorldHistoryTimelineTransformer.transform(dataView.categorical);

            if (!chartData.items.length) {
                this.syncSortControl(false, "time", []);
                this.lastLayoutKey = "";
                this.lastViewportWidth = width;
                this.lastViewportHeight = height;
                this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
                this.renderNoData(width, height);
                return;
            }

            this.canSortByRegion = chartData.hasRegionRoleData && chartData.regions.length > 1;
            const sortOptions = this.resolveSortControlOptions(this.settings.timeline.sortOptions, this.canSortByRegion);
            const fallbackSortBy = sortOptions.find((opt) => !opt.disabled)?.mode ?? "time";

            const runtimeSortValid = this.runtimeSortBy
                ? sortOptions.some((opt) => opt.mode === this.runtimeSortBy && !opt.disabled)
                : false;
            if (!runtimeSortValid) {
                this.runtimeSortBy = null;
            }

            const settingsSortValid = sortOptions.some(
                (opt) => opt.mode === this.settings!.timeline.sortBy && !opt.disabled
            );

            const effectiveSortBy: TimelineSortMode = this.runtimeSortBy
                ?? (settingsSortValid ? this.settings.timeline.sortBy : fallbackSortBy);
            this.syncSortControl(true, effectiveSortBy, sortOptions);
            this.sortControlReservePx = this.sortControlRoot?.offsetHeight
                ? Math.max(0, Math.ceil(this.sortControlRoot.offsetHeight))
                : 28;

            const virtualCanvas = this.computeVirtualCanvasSize(width, height, chartData);
            this.svg
                .attr("width", virtualCanvas.width)
                .attr("height", virtualCanvas.height)
                .attr("viewBox", `0 0 ${virtualCanvas.width} ${virtualCanvas.height}`);

            const layoutKey = `${virtualCanvas.width}x${virtualCanvas.height}|${chartData.minYear}|${chartData.maxYear}|${chartData.items.length}`;
            if (viewportChanged || this.lastLayoutKey !== layoutKey) {
                this.target.scrollLeft = 0;
                this.target.scrollTop = 0;
                this.lastLayoutKey = layoutKey;
            }
            this.lastViewportWidth = width;
            this.lastViewportHeight = height;

            context.width = virtualCanvas.width;
            context.height = virtualCanvas.height;
            this.renderer = new WorldHistoryTimelineRenderer(context);
            const effectiveSettings: IWorldHistoryTimelineVisualSettings = {
                ...this.settings,
                timeline: {
                    ...this.settings.timeline,
                    sortBy: effectiveSortBy,
                    sortControlReservePx: this.sortControlReservePx,
                    sortHeightPx: this.sortControlReservePx,
                    axisHeaderHeightPx: this.computeTopAxisHeaderHeight(this.settings, chartData),
                    headerTopPaddingPx: Visual.HEADER_TOP_PADDING
                }
            };

            const defaultColors = effectiveSettings.useCustomColors && effectiveSettings.customColors?.length > 0
                ? effectiveSettings.customColors
                : getSchemeColors(effectiveSettings.colorScheme);
            const seededColors = new Map<string, string>(this.regionColors);
            chartData.regions.forEach((region, i) => {
                if (!seededColors.has(region)) {
                    seededColors.set(region, defaultColors[i % defaultColors.length]);
                }
            });
            chartData.categoryColorMap = seededColors;

            this.renderer.render(chartData, effectiveSettings);
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

    private computeVirtualCanvasSize(
        viewportWidth: number,
        viewportHeight: number,
        chartData: WorldHistoryTimelineData
    ): { width: number; height: number } {
        const rowCount = Math.max(1, chartData.items.length);
        const rawSpan = Math.max(1, chartData.maxYear - chartData.minYear);
        const widthByYears = (() => {
            if (chartData.timeScaleMode !== "date") {
                const numericYearSpan = Math.max(1, rawSpan);
                return Math.round((numericYearSpan * Visual.PX_PER_YEAR) + Visual.WIDTH_PADDING);
            }

            const spanMs = Math.max(Visual.MILLISECONDS_PER_DAY, rawSpan);
            switch (chartData.timeTemporalLevel) {
                case "day": {
                    const daySpan = Math.max(1, spanMs / Visual.MILLISECONDS_PER_DAY);
                    return Math.round((daySpan * Visual.PX_PER_DAY) + Visual.WIDTH_PADDING);
                }
                case "month": {
                    const monthSpan = Math.max(1, spanMs / (Visual.MILLISECONDS_PER_YEAR / 12));
                    return Math.round((monthSpan * Visual.PX_PER_MONTH) + Visual.WIDTH_PADDING);
                }
                case "quarter": {
                    const quarterSpan = Math.max(1, spanMs / (Visual.MILLISECONDS_PER_YEAR / 4));
                    return Math.round((quarterSpan * Visual.PX_PER_QUARTER) + Visual.WIDTH_PADDING);
                }
                default: {
                    const yearSpan = Math.max(1, spanMs / Visual.MILLISECONDS_PER_YEAR);
                    return Math.round((yearSpan * Visual.PX_PER_YEAR) + Visual.WIDTH_PADDING);
                }
            }
        })();
        const heightByRows = Math.round((rowCount * Visual.ROW_HEIGHT) + Visual.HEIGHT_PADDING);

        const width = Math.max(
            viewportWidth,
            Math.min(
                Visual.MAX_CONTENT_WIDTH,
                Math.max(Visual.MIN_CONTENT_WIDTH, widthByYears)
            )
        );

        const height = Math.max(
            viewportHeight,
            Math.min(
                Visual.MAX_CONTENT_HEIGHT,
                Math.max(Visual.MIN_CONTENT_HEIGHT, heightByRows)
            )
        );

        return { width, height };
    }

    private computeTopAxisHeaderHeight(
        settings: IWorldHistoryTimelineVisualSettings,
        chartData: WorldHistoryTimelineData
    ): number {
        if (!settings.showXAxis || !settings.timeline.showTopAxis) {
            return 0;
        }

        const axisFontSize = this.getConfiguredAxisFontSize(settings);
        const axisLevels = this.getAxisLevels(chartData);
        const rowCount = Math.max(1, axisLevels.length);
        const showBanner = chartData.timeScaleMode === "date"
            && !chartData.timeHasYearContext
            && axisLevels.length > 0
            && chartData.timeTemporalLevel !== "year"
            && chartData.timeTemporalLevel !== "none"
            && chartData.timeTemporalLevel !== "date";

        const headerPadTop = 4;
        const bannerHeight = showBanner ? Math.max(11, axisFontSize) : 0;
        const bannerGap = showBanner ? 3 : 0;
        const rowHeight = Math.max(12, Math.round(axisFontSize + 6));
        const baselineGap = 6;
        const headerPadBottom = 10;

        return headerPadTop + bannerHeight + bannerGap + (rowCount * rowHeight) + baselineGap + headerPadBottom;
    }

    private getConfiguredAxisFontSize(settings: IWorldHistoryTimelineVisualSettings): number {
        const preferred = settings.textSizes.xAxisFontSize > 0
            ? settings.textSizes.xAxisFontSize
            : settings.xAxisFontSize;
        const n = Number(preferred);
        if (!Number.isFinite(n) || n <= 0) {
            return 9;
        }
        return Math.max(6, Math.min(40, n));
    }

    private getAxisLevels(chartData: WorldHistoryTimelineData): TimelineTemporalLevel[] {
        if (chartData.timeScaleMode !== "date") {
            return ["year"];
        }

        switch (chartData.timeTemporalLevel) {
            case "quarter":
                return ["year", "quarter"];
            case "month":
                return ["year", "quarter", "month"];
            case "day":
                return ["year", "quarter", "month", "day"];
            case "year":
                return ["year"];
            default:
                return chartData.timeHasYearContext ? ["year"] : ["date"];
        }
    }

    private syncPinnedLayers(): void {
        const scrollTop = this.target.scrollTop || 0;
        const scrollLeft = this.target.scrollLeft || 0;

        const horizontalPinnedLegends = this.target.querySelectorAll<SVGGElement>('g.color-legend[data-lock-x="true"]');
        horizontalPinnedLegends.forEach((legend) => {
            const naturalX = Number(legend.getAttribute("data-natural-x") ?? "0");
            const naturalY = Number(legend.getAttribute("data-natural-y") ?? "0");
            const x = Math.round(scrollLeft + (Number.isFinite(naturalX) ? naturalX : 0));
            const y = Math.round(Number.isFinite(naturalY) ? naturalY : 0);
            legend.setAttribute("transform", `translate(${x}, ${y})`);
        });

        this.syncSortControlPlacement();

        const pinnedAxes = this.target.querySelectorAll<SVGGElement>("g.pinned-top-axis");
        pinnedAxes.forEach((axis) => {
            const panelTop = Number(axis.getAttribute("data-panel-top") ?? "0");
            const axisNaturalTop = Number(axis.getAttribute("data-axis-natural-top") ?? "0");
            // Let the axis scroll naturally until it reaches the viewport top, then pin at y=0.
            const globalTop = Math.max(axisNaturalTop, scrollTop);
            const y = globalTop - panelTop;
            axis.setAttribute("transform", `translate(0, ${Math.round(y)})`);
        });
    }

    private renderNoData(width: number, height: number): void {
        renderEmptyState(this.container, width, height, {
            title: "Set up World History Timeline",
            lines: [
                "Category: Label for each bar (supports hierarchy)",
                "Start: Date or numeric year (supports hierarchy)",
                "End: Date or numeric year (supports hierarchy)",
                "Legend (optional): Color grouping"
            ],
            hint: "Tip: hierarchy levels are joined from left to right."
        });
    }

    private resolveSortControlOptions(config: string, canSortByRegion: boolean): SortControlOption[] {
        const aliasToMode: Record<string, TimelineSortMode> = {
            region: "region",
            time: "time",
            start: "time",
            category: "category",
            civilization: "category",
            end: "end",
            endtime: "end",
            duration: "duration"
        };

        const tokens = (config || "")
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value.length > 0);

        const orderedModes: TimelineSortMode[] = [];
        const seen = new Set<TimelineSortMode>();
        for (const token of tokens) {
            const mode = aliasToMode[token];
            if (!mode || seen.has(mode)) continue;
            seen.add(mode);
            orderedModes.push(mode);
        }

        if (!orderedModes.length) {
            orderedModes.push("region", "time");
        }

        return orderedModes.map((mode) => ({
            mode,
            label: SUPPORTED_SORT_OPTIONS[mode].label,
            disabled: Boolean(SUPPORTED_SORT_OPTIONS[mode].requiresRegion && !canSortByRegion)
        }));
    }

    private ensureSortControl(): void {
        if (this.sortControlRoot || typeof document === "undefined") {
            return;
        }

        const root = document.createElement("div");
        root.className = "timeline-sort-control";
        root.style.display = "none";

        const title = document.createElement("div");
        title.className = "timeline-sort-title";
        title.textContent = "Sorted by";
        root.appendChild(title);

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "timeline-sort-trigger";
        trigger.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.setSortMenuOpen(!(root.getAttribute("data-open") === "true"));
        });
        root.appendChild(trigger);

        const menu = document.createElement("div");
        menu.className = "timeline-sort-menu";
        root.appendChild(menu);

        this.target.appendChild(root);
        this.sortControlRoot = root;
        this.sortControlTrigger = trigger;
        this.sortControlMenu = menu;
    }

    private syncSortControl(
        visible: boolean,
        activeSortBy: TimelineSortMode,
        sortOptions: SortControlOption[]
    ): void {
        this.ensureSortControl();
        if (!this.sortControlRoot || !this.sortControlTrigger || !this.sortControlMenu) {
            return;
        }

        const shouldShow = visible && this.allowInteractions && sortOptions.length > 0;
        this.sortControlRoot.style.display = shouldShow ? "flex" : "none";
        if (!shouldShow) {
            this.sortControlReservePx = 0;
            this.setSortMenuOpen(false);
            return;
        }

        const enabledCount = sortOptions.filter((option) => !option.disabled).length;
        const activeLabel = sortOptions.find((option) => option.mode === activeSortBy)?.label ?? activeSortBy;
        this.sortControlTrigger.textContent = activeLabel;
        this.sortControlTrigger.disabled = enabledCount <= 1;
        if (enabledCount <= 1) {
            this.setSortMenuOpen(false);
        }

        while (this.sortControlMenu.firstChild) {
            this.sortControlMenu.removeChild(this.sortControlMenu.firstChild);
        }
        for (const optionData of sortOptions) {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "timeline-sort-option";
            option.setAttribute("data-sort-mode", optionData.mode);
            option.classList.toggle("is-active", optionData.mode === activeSortBy);
            option.classList.toggle("is-disabled", Boolean(optionData.disabled));
            option.disabled = Boolean(optionData.disabled);

            const check = document.createElement("span");
            check.className = "timeline-sort-check";
            check.textContent = "\u2713";

            const text = document.createElement("span");
            text.className = "timeline-sort-label";
            text.textContent = optionData.label;

            option.appendChild(check);
            option.appendChild(text);
            option.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (optionData.disabled) {
                    return;
                }

                this.runtimeSortBy = optionData.mode;
                this.setSortMenuOpen(false);
                this.syncSortControl(true, optionData.mode, sortOptions);

                if (this.lastUpdateOptions) {
                    this.update(this.lastUpdateOptions);
                }
            });

            this.sortControlMenu.appendChild(option);
        }

        this.syncSortControlPlacement();
        this.sortControlReservePx = this.sortControlRoot.offsetHeight
            ? Math.max(0, Math.ceil(this.sortControlRoot.offsetHeight))
            : this.sortControlReservePx;
    }

    private setSortMenuOpen(open: boolean): void {
        if (!this.sortControlRoot) {
            return;
        }
        if (open && this.sortControlTrigger?.disabled) {
            return;
        }

        this.sortControlRoot.setAttribute("data-open", open ? "true" : "false");
    }

    private syncSortControlPlacement(): void {
        if (!this.sortControlRoot || this.sortControlRoot.style.display === "none") {
            return;
        }

        const legendNodes = Array.from(this.target.querySelectorAll<SVGGElement>("g.color-legend"));

        let computedTop = Visual.HEADER_TOP_PADDING;
        let computedLeft = Visual.HEADER_LEFT_PADDING;

        if (legendNodes.length > 0) {
            let legendBottom = Visual.HEADER_TOP_PADDING;
            let legendLeft = Visual.HEADER_LEFT_PADDING;

            legendNodes.forEach((node) => {
                let bboxY = 0;
                let bboxHeight = 0;
                let bboxX = 0;
                const naturalXAttr = Number(node.getAttribute("data-natural-x") ?? "NaN");
                const naturalYAttr = Number(node.getAttribute("data-natural-y") ?? "NaN");
                try {
                    const bbox = node.getBBox();
                    bboxX = Number.isFinite(bbox.x) ? bbox.x : 0;
                    bboxY = Number.isFinite(bbox.y) ? bbox.y : 0;
                    bboxHeight = Number.isFinite(bbox.height) ? bbox.height : 0;
                } catch {
                    // Ignore getBBox failures and keep defaults.
                }

                const effectiveX = Number.isFinite(naturalXAttr) ? naturalXAttr : bboxX;
                const effectiveY = Number.isFinite(naturalYAttr) ? naturalYAttr : bboxY;

                legendLeft = Math.min(legendLeft, Math.round(effectiveX));
                legendBottom = Math.max(legendBottom, Math.round(effectiveY + bboxHeight));
            });

            computedLeft = Math.max(Visual.HEADER_LEFT_PADDING, legendLeft);
            computedTop = Math.max(Visual.HEADER_TOP_PADDING, legendBottom + Visual.HEADER_LAYER_GAP);
        }

        const hostWidth = this.target.clientWidth || 0;
        const controlWidth = Math.ceil(this.sortControlRoot.getBoundingClientRect().width || 140);
        if (hostWidth > 0) {
            computedLeft = Math.max(
                Visual.HEADER_LEFT_PADDING,
                Math.min(computedLeft, Math.max(Visual.HEADER_LEFT_PADDING, hostWidth - controlWidth - 8))
            );
        }

        // Keep the control in chart-content coordinates so it scrolls away with content.
        this.sortControlRoot.style.top = `${Math.round(computedTop)}px`;
        this.sortControlRoot.style.left = `${Math.round(computedLeft)}px`;
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

    private buildRegionSelectionIds(dataView: powerbi.DataView): void {
        this.regionSelectionIds.clear();
        this.regions = [];

        if (this.regionFieldIndex < 0 || !dataView.categorical?.categories?.[this.regionFieldIndex]) {
            return;
        }

        const regionColumn = dataView.categorical.categories[this.regionFieldIndex];
        const seen = new Set<string>();

        for (let i = 0; i < regionColumn.values.length; i++) {
            const regionValue = String(regionColumn.values[i] ?? "");
            if (seen.has(regionValue)) continue;
            seen.add(regionValue);

            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(regionColumn, i)
                .createSelectionId();

            this.regionSelectionIds.set(regionValue, selectionId);
            this.regions.push(regionValue);
        }

        this.regions.sort((a, b) => a.localeCompare(b));
    }

    private buildPointSelectionIds(dataView: powerbi.DataView): void {
        this.pointSelectionIds.clear();

        const categories = dataView.categorical?.categories ?? [];
        const startColumns = categories.filter((column) => column.source?.roles?.startYear) as DataViewCategoryColumn[];
        if (!startColumns.length) {
            return;
        }

        const rowCount = Math.max(...startColumns.map((column) => column.values.length));
        for (let i = 0; i < rowCount; i++) {
            const hasAnyValue = startColumns.some((column) => {
                const rawValue = column.values[i];
                return rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== "";
            });

            if (!hasAnyValue) {
                continue;
            }

            const builder = this.host.createSelectionIdBuilder();
            startColumns.forEach((column) => {
                if (i < column.values.length) {
                    builder.withCategory(column, i);
                }
            });

            const selectionId = builder.createSelectionId();

            this.pointSelectionIds.set(String(i), selectionId);
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const cards: powerbi.visuals.FormattingCard[] = [];

        if (!this.settings) {
            return { cards };
        }

        if (this.regions.length > 0) {
            const defaultColors = this.settings.useCustomColors && this.settings.customColors?.length > 0
                ? this.settings.customColors
                : getSchemeColors(this.settings.colorScheme);

            cards.push(createDataColorsCard(this.regions, this.regionSelectionIds, this.regionColors, defaultColors));
        }

        cards.push(createColorSchemeCard(this.settings.colorScheme));

        cards.push(createTooltipCard(this.settings.tooltip));

        cards.push(createLegendCard({
            show: this.settings.showLegend,
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
            endLabelFontSize: this.settings.textSizes.endLabelFontSize || this.settings.yAxisFontSize
        }));

        cards.push(createTimelineCard(this.settings));

        return { cards };
    }

    public destroy(): void {
        this.target.removeEventListener("scroll", this.onTargetScroll);
        if (typeof document !== "undefined") {
            document.removeEventListener("mousedown", this.onDocumentPointerDown, true);
        }
        try {
            this.htmlTooltip?.destroy();
            this.htmlTooltip = null;
            this.target.querySelectorAll('[data-bta-tooltip="true"]').forEach(el => el.remove());
            this.sortControlRoot?.remove();
            this.sortControlRoot = null;
            this.sortControlTrigger = null;
            this.sortControlMenu = null;
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

        if (this.pointSelectionIds.size > 0) {
            const binding = bindSelectionByDataKey({
                root: this.target,
                selectionManager: this.selectionManager,
                markSelector: ".timeline-bar[data-selection-key]",
                selectionIdsByKey: this.pointSelectionIds,
                dimOpacity: 0.2,
                selectedOpacity: 1
            });
            this.applySelectionState = binding.applySelection;
            binding.applySelection(this.selectionManager.getSelectionIds());
        }

        this.svg.on("click", async (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest(".timeline-bar[data-selection-key]")) {
                return;
            }

            await this.selectionManager.clear();
            this.applySelectionState?.([]);
        });

        this.svg.on("contextmenu", (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (target?.closest(".timeline-bar[data-selection-key]")) {
                return;
            }

            event.preventDefault();
            this.selectionManager.showContextMenu(this.emptySelectionId, { x: event.clientX, y: event.clientY })
                .catch(() => undefined);
        });
    }
}
