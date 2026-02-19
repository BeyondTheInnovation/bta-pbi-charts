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
    createExportControl,
    ExportControl,
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
    HtmlTooltip
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

type InteractionSource = "callback" | "localClick" | "postRenderSync" | "clear";

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

function createDataLabelsCard(settings: IWorldHistoryTimelineVisualSettings["dataLabels"]): powerbi.visuals.FormattingCard {
    return {
        displayName: "Data Labels",
        uid: "data_labels_card",
        groups: [
            {
                displayName: "Labels",
                uid: "data_labels_group",
                slices: [
                    {
                        uid: "data_labels_show",
                        displayName: "Show",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "dataLabelSettings", propertyName: "show" },
                                value: settings.show
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "data_labels_fontSize",
                        displayName: "Font Size",
                        control: {
                            type: powerbi.visuals.FormattingComponent.NumUpDown,
                            properties: {
                                descriptor: { objectName: "dataLabelSettings", propertyName: "fontSize" },
                                value: settings.fontSize,
                                options: {
                                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 6 },
                                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 40 }
                                }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "data_labels_fontFamily",
                        displayName: "Font Family",
                        control: {
                            type: powerbi.visuals.FormattingComponent.TextInput,
                            properties: {
                                descriptor: { objectName: "dataLabelSettings", propertyName: "fontFamily" },
                                value: settings.fontFamily
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "data_labels_color",
                        displayName: "Color",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ColorPicker,
                            properties: {
                                descriptor: { objectName: "dataLabelSettings", propertyName: "color" },
                                value: { value: settings.color }
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "data_labels_bold",
                        displayName: "Bold",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "dataLabelSettings", propertyName: "bold" },
                                value: settings.bold
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "data_labels_italic",
                        displayName: "Italic",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "dataLabelSettings", propertyName: "italic" },
                                value: settings.italic
                            }
                        }
                    } as powerbi.visuals.FormattingSlice,
                    {
                        uid: "data_labels_underline",
                        displayName: "Underline",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "dataLabelSettings", propertyName: "underline" },
                                value: settings.underline
                            }
                        }
                    } as powerbi.visuals.FormattingSlice
                ]
            }
        ]
    };
}

function createInteractionDiagnosticsCard(
    settings: IWorldHistoryTimelineVisualSettings["interactionDiagnostics"]
): powerbi.visuals.FormattingCard {
    return {
        displayName: "Interaction Diagnostics",
        uid: "interaction_diagnostics_card",
        groups: [
            {
                displayName: "Diagnostics",
                uid: "interaction_diagnostics_group",
                slices: [
                    {
                        uid: "interaction_diagnostics_show",
                        displayName: "Show Diagnostics",
                        control: {
                            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                            properties: {
                                descriptor: { objectName: "interactionDiagnostics", propertyName: "show" },
                                value: settings.show
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
    private allowInteractions: boolean;
    private currentSelectionIds: ISelectionId[] = [];
    private lastInteractionSource: InteractionSource = "clear";
    private callbackFireCount: number = 0;
    private latestChartData: WorldHistoryTimelineData | null = null;
    private latestMatchedSelectionRowKeys: Set<string> = new Set();
    private diagnosticsOverlay: HTMLDivElement | null = null;

    private regionSelectionIds: Map<string, ISelectionId> = new Map();
    private pointSelectionIds: Map<string, ISelectionId> = new Map();
    private pointSelectionCandidateIds: Map<string, ISelectionId[]> = new Map();
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
    private exportControl: ExportControl;

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
    private static readonly VISUAL_VERSION: string = "1.1.35.0";
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

        this.selectionManager.registerOnSelectCallback((ids: powerbi.extensibility.ISelectionId[]) => {
            this.callbackFireCount++;
            this.setSelectionState(ids, "callback");
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

        this.exportControl = createExportControl({
            host: this.host,
            root: this.target,
            fileNamePrefix: "world-history-timeline"
        });

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
            this.exportControl.setSnapshotSource({
                svgElement: this.svg.node(),
                viewportWidth: width,
                viewportHeight: height,
                scrollLeft: this.target.scrollLeft || 0,
                scrollTop: this.target.scrollTop || 0
            });
            this.exportControl.setHasData(false);
            void this.exportControl.refreshCapability();

            this.svg.on("mouseleave", () => {
                this.htmlTooltip?.hide();
                this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
            });

            if (!options.dataViews || !options.dataViews[0] || !options.dataViews[0].categorical) {
                this.syncSortControl(false, "time", []);
                this.latestChartData = null;
                this.latestMatchedSelectionRowKeys = new Set();
                this.lastLayoutKey = "";
                this.lastViewportWidth = width;
                this.lastViewportHeight = height;
                this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
                this.renderNoData();
                this.updateDiagnosticsOverlay();
                return;
            }

            const dataView = options.dataViews[0];
            this.settings = parseSettings(dataView);
            this.ensureDiagnosticsOverlay();
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
            this.latestChartData = chartData;

            if (!chartData.items.length) {
                this.syncSortControl(false, "time", []);
                this.latestMatchedSelectionRowKeys = new Set();
                this.lastLayoutKey = "";
                this.lastViewportWidth = width;
                this.lastViewportHeight = height;
                this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
                this.renderNoData();
                this.updateDiagnosticsOverlay();
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
            this.exportControl.setHasData(true);
            this.syncPinnedLayers();
            this.bindInteractions();
            this.syncSelectionStateFromManager("postRenderSync");
            this.updateDiagnosticsOverlay();
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

        const axisLevels: TimelineTemporalLevel[] = [];
        const pushLevel = (level: TimelineTemporalLevel): void => {
            if (!axisLevels.includes(level)) {
                axisLevels.push(level);
            }
        };

        const temporalLevel = chartData.timeTemporalLevel;
        const includeQuarter = chartData.timeHasQuarterLevel
            && (temporalLevel === "quarter" || temporalLevel === "month" || temporalLevel === "day");
        const includeMonth = temporalLevel === "month" || temporalLevel === "day";

        // Keep year as the persistent top context when using date hierarchy drill.
        pushLevel("year");
        if (includeQuarter) {
            pushLevel("quarter");
        }
        if (includeMonth) {
            pushLevel("month");
        }

        switch (chartData.timeTemporalLevel) {
            case "quarter":
                pushLevel("quarter");
                break;
            case "month":
                pushLevel("month");
                break;
            case "day":
                pushLevel("day");
                break;
            case "year":
            case "date":
            case "none":
                pushLevel("year");
                break;
            default:
                pushLevel("year");
                break;
        }

        return axisLevels.length > 0 ? axisLevels : ["year"];
    }

    private syncPinnedLayers(): void {
        const scrollTop = this.target.scrollTop || 0;
        const scrollLeft = this.target.scrollLeft || 0;

        const pinnedElements = this.target.querySelectorAll<SVGGraphicsElement>('[data-lock-x="true"],[data-lock-y="true"]');
        pinnedElements.forEach((element) => {
            const naturalX = Number(element.getAttribute("data-natural-x") ?? "0");
            const naturalY = Number(element.getAttribute("data-natural-y") ?? "0");
            const lockX = element.getAttribute("data-lock-x") === "true";
            const lockY = element.getAttribute("data-lock-y") === "true";
            const x = Math.round((lockX ? scrollLeft : 0) + (Number.isFinite(naturalX) ? naturalX : 0));
            const y = Math.round((lockY ? scrollTop : 0) + (Number.isFinite(naturalY) ? naturalY : 0));
            element.setAttribute("transform", `translate(${x}, ${y})`);
        });

        this.syncSortControlPlacement();

        const pinnedAxes = this.target.querySelectorAll<SVGGElement>("g.pinned-top-axis");
        pinnedAxes.forEach((axis) => {
            const panelTop = Number(axis.getAttribute("data-panel-top") ?? "0");
            const axisNaturalTop = Number(axis.getAttribute("data-axis-natural-top") ?? "0");
            // Keep the axis pinned below the sticky legend/sort header stack.
            const stickyHeaderOffset = Math.max(0, axisNaturalTop);
            const globalTop = Math.max(axisNaturalTop, scrollTop + stickyHeaderOffset);
            const y = globalTop - panelTop;
            axis.setAttribute("transform", `translate(0, ${Math.round(y)})`);
        });
    }

    private renderNoData(): void {
        this.container.selectAll("*").remove();
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

        const scrollTop = this.target.scrollTop || 0;
        const scrollLeft = this.target.scrollLeft || 0;

        // Keep the control sticky to the viewport while preserving its natural header placement.
        this.sortControlRoot.style.top = `${Math.round(scrollTop + computedTop)}px`;
        this.sortControlRoot.style.left = `${Math.round(scrollLeft + computedLeft)}px`;
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
        this.pointSelectionCandidateIds.clear();

        const categories = dataView.categorical?.categories ?? [];
        const civilizationColumns = categories.filter((column) => column.source?.roles?.civilization) as DataViewCategoryColumn[];
        const regionColumns = categories.filter((column) => column.source?.roles?.region) as DataViewCategoryColumn[];
        const startColumns = categories.filter((column) => column.source?.roles?.startYear) as DataViewCategoryColumn[];
        const endColumns = categories.filter((column) => column.source?.roles?.endYear) as DataViewCategoryColumn[];
        const allColumns = [
            ...civilizationColumns,
            ...regionColumns,
            ...startColumns,
            ...endColumns
        ];
        const rowCount = allColumns.length > 0
            ? Math.max(...allColumns.map((column) => column.values.length))
            : 0;

        const candidateGroups: DataViewCategoryColumn[][] = [
            [...civilizationColumns, ...regionColumns],
            [...civilizationColumns],
            [...regionColumns],
            [...startColumns, ...endColumns],
            [...startColumns],
            [...endColumns]
        ].filter((group) => group.length > 0);

        for (let i = 0; i < rowCount; i++) {
            const candidateIds: ISelectionId[] = [];
            const seenCandidateKeys = new Set<string>();

            const addCandidateId = (columns: DataViewCategoryColumn[]): void => {
                const selectionId = this.buildSelectionIdForRow(columns, i);
                if (!selectionId) {
                    return;
                }

                const selectionKey = this.getSelectionIdentityKey(selectionId);
                if (seenCandidateKeys.has(selectionKey)) {
                    return;
                }

                seenCandidateKeys.add(selectionKey);
                candidateIds.push(selectionId);
            };

            candidateGroups.forEach((group) => addCandidateId(group));
            allColumns.forEach((column) => addCandidateId([column]));

            if (!candidateIds.length) {
                continue;
            }

            const rowKey = String(i);
            this.pointSelectionIds.set(rowKey, candidateIds[0]);
            this.pointSelectionCandidateIds.set(rowKey, candidateIds);
        }
    }

    private hasCategoryValueAtRow(column: DataViewCategoryColumn, rowIndex: number): boolean {
        const rawValue = column?.values?.[rowIndex];
        if (rawValue === null || rawValue === undefined) {
            return false;
        }

        if (typeof rawValue === "string") {
            return rawValue.trim().length > 0;
        }

        return true;
    }

    private buildSelectionIdForRow(columns: DataViewCategoryColumn[], rowIndex: number): ISelectionId | null {
        if (!columns.length) {
            return null;
        }

        const builder = this.host.createSelectionIdBuilder();
        let appended = false;

        for (const column of columns) {
            if (!this.hasCategoryValueAtRow(column, rowIndex)) {
                continue;
            }

            try {
                builder.withCategory(column, rowIndex);
                appended = true;
            } catch {
                // Ignore invalid row/category references and continue assembling fallback IDs.
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

    private ensureDiagnosticsOverlay(): void {
        if (this.diagnosticsOverlay || typeof document === "undefined") {
            return;
        }

        const overlay = document.createElement("div");
        overlay.className = "timeline-interaction-diagnostics";
        overlay.style.display = "none";
        this.target.appendChild(overlay);
        this.diagnosticsOverlay = overlay;
    }

    private updateDiagnosticsOverlay(): void {
        if (!this.diagnosticsOverlay) {
            return;
        }

        if (!this.settings?.interactionDiagnostics.show) {
            this.diagnosticsOverlay.style.display = "none";
            return;
        }

        const chartData = this.latestChartData;
        const rowCount = chartData?.items.length ?? 0;
        const highlightedRows = chartData?.items.filter((point) => point.isHighlighted).length ?? 0;
        const matchedSelectionRows = this.latestMatchedSelectionRowKeys.size;

        let valueColCount = 0;
        let hasHighlightArrays = false;
        try {
            const dv = this.lastUpdateOptions?.dataViews?.[0];
            const vals = dv?.categorical?.values;
            if (vals) {
                valueColCount = vals.length;
                hasHighlightArrays = vals.some((col: any) => Array.isArray(col?.highlights));
            }
        } catch { /* ignore */ }

        let hasSelection = false;
        try {
            hasSelection = this.selectionManager.hasSelection();
        } catch { /* ignore */ }

        this.diagnosticsOverlay.style.display = "block";
        this.diagnosticsOverlay.textContent = [
            `v ${Visual.VISUAL_VERSION}`,
            `rows=${rowCount}`,
            `valueCols=${valueColCount}`,
            `hlArrays=${hasHighlightArrays}`,
            `hasIncomingHL=${chartData?.hasIncomingHighlights === true}`,
            `hlRows=${highlightedRows}`,
            `selIds=${this.currentSelectionIds.length}`,
            `matchedRows=${matchedSelectionRows}`,
            `hasSel=${hasSelection}`,
            `cbFires=${this.callbackFireCount}`,
            `src=${this.lastInteractionSource}`
        ].join(" | ");
    }

    private resolveSelectionKeyFromTarget(target: Element | null): string | null {
        const selectionTarget = target?.closest(".timeline-row[data-selection-key], .timeline-bar[data-selection-key]") as Element | null;
        if (!selectionTarget) {
            return null;
        }

        const directKey = selectionTarget.getAttribute("data-selection-key");
        if (directKey) {
            return directKey;
        }

        const parentKey = selectionTarget.closest(".timeline-row[data-selection-key]")?.getAttribute("data-selection-key");
        return parentKey ?? null;
    }

    private getSelectionIdentityKey(selectionId: ISelectionId): string {
        const anySelectionId = selectionId as any;
        if (typeof anySelectionId?.getKey === "function") {
            return String(anySelectionId.getKey());
        }
        if (typeof anySelectionId?.getSelector === "function") {
            try {
                return JSON.stringify(anySelectionId.getSelector());
            } catch {
                // ignore and use fallback
            }
        }
        return String(anySelectionId);
    }

    private stableStringify(value: any): string {
        if (value === null || typeof value !== "object") {
            return JSON.stringify(value);
        }

        if (Array.isArray(value)) {
            return `[${value.map((item) => this.stableStringify(item)).join(",")}]`;
        }

        const keys = Object.keys(value).sort();
        const props = keys.map((key) => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`);
        return `{${props.join(",")}}`;
    }

    private getSelectionSelectorKey(selectionId: ISelectionId): string | null {
        const anySelectionId = selectionId as any;
        if (typeof anySelectionId?.getSelector !== "function") {
            return null;
        }

        try {
            return this.stableStringify(anySelectionId.getSelector());
        } catch {
            return null;
        }
    }

    private getSelectionSelector(selectionId: ISelectionId): any | null {
        const anySelectionId = selectionId as any;
        if (typeof anySelectionId?.getSelector !== "function") {
            return null;
        }

        try {
            return anySelectionId.getSelector();
        } catch {
            return null;
        }
    }

    private selectorContains(container: any, subset: any): boolean {
        if (container === subset) {
            return true;
        }

        if (subset === null || subset === undefined) {
            return container === subset;
        }

        if (Array.isArray(subset)) {
            if (!Array.isArray(container)) {
                return false;
            }

            return subset.every((subsetItem) =>
                container.some((containerItem) => this.selectorContains(containerItem, subsetItem))
            );
        }

        if (typeof subset === "object") {
            if (typeof container !== "object" || container === null || Array.isArray(container)) {
                return false;
            }

            return Object.keys(subset).every((key) => this.selectorContains(container[key], subset[key]));
        }

        return container === subset;
    }

    private normalizeSelectionText(value: string): string {
        return value.toLowerCase().replace(/\s+/g, " ").trim();
    }

    private extractSelectorStrings(selectorPart: any, sink: Set<string>): void {
        if (selectorPart === null || selectorPart === undefined) {
            return;
        }

        if (typeof selectorPart === "string") {
            const normalized = this.normalizeSelectionText(selectorPart);
            if (normalized.length >= 2) {
                sink.add(normalized);
            }
            return;
        }

        if (Array.isArray(selectorPart)) {
            selectorPart.forEach((item) => this.extractSelectorStrings(item, sink));
            return;
        }

        if (typeof selectorPart === "object") {
            Object.values(selectorPart).forEach((value) => this.extractSelectorStrings(value, sink));
        }
    }

    private getSelectionSelectorTextTokens(selectionId: ISelectionId): string[] {
        const selector = this.getSelectionSelector(selectionId);
        if (!selector) {
            return [];
        }

        const sink = new Set<string>();
        this.extractSelectorStrings(selector, sink);
        return Array.from(sink);
    }

    private selectionIdsMatch(left: ISelectionId, right: ISelectionId): boolean {
        // Use the canonical Power BI equals() method first — it handles cross-visual scope matching.
        try {
            if (left.equals(right)) {
                return true;
            }
        } catch {
            // equals() may not be available on all runtime objects
        }

        const leftKey = this.getSelectionIdentityKey(left);
        const rightKey = this.getSelectionIdentityKey(right);
        if (leftKey === rightKey) {
            return true;
        }

        const leftSelectorKey = this.getSelectionSelectorKey(left);
        const rightSelectorKey = this.getSelectionSelectorKey(right);
        if (leftSelectorKey && rightSelectorKey) {
            if (leftSelectorKey === rightSelectorKey) {
                return true;
            }

            const leftSelector = this.getSelectionSelector(left);
            const rightSelector = this.getSelectionSelector(right);
            if (leftSelector && rightSelector) {
                const leftContainsRight = this.selectorContains(leftSelector, rightSelector);
                const rightContainsLeft = this.selectorContains(rightSelector, leftSelector);
                if (leftContainsRight || rightContainsLeft) {
                    return true;
                }
            }
        }

        const leftAny = left as any;
        const rightAny = right as any;
        const leftIncludesRight = typeof leftAny?.includes === "function" ? Boolean(leftAny.includes(right)) : false;
        const rightIncludesLeft = typeof rightAny?.includes === "function" ? Boolean(rightAny.includes(left)) : false;
        return leftIncludesRight || rightIncludesLeft;
    }

    private setSelectionState(
        ids: ISelectionId[] | powerbi.extensibility.ISelectionId[] | undefined | null,
        source: InteractionSource
    ): void {
        this.currentSelectionIds = Array.isArray(ids) ? (ids as ISelectionId[]) : [];
        this.lastInteractionSource = source;
        this.recomputeInteractionStateAndApply();
    }

    private syncSelectionStateFromManager(source: InteractionSource): void {
        const managerIds = this.selectionManager.getSelectionIds() as ISelectionId[];
        // getSelectionIds() only returns IDs from our own select() calls, NOT
        // cross-visual selections received via registerOnSelectCallback.
        // When the manager is empty, preserve the existing currentSelectionIds
        // so that callback-provided cross-visual state survives an update() cycle.
        const effectiveIds = managerIds.length > 0 ? managerIds : this.currentSelectionIds;
        this.setSelectionState(effectiveIds, source);
    }

    private recomputeInteractionStateAndApply(): void {
        const chartData = this.latestChartData;
        if (!chartData) {
            this.latestMatchedSelectionRowKeys = new Set();
            this.updateDiagnosticsOverlay();
            return;
        }

        const matchedSelectionRowKeys = new Set<string>();
        const selectedIds = this.currentSelectionIds;

        if (selectedIds.length > 0) {
            this.pointSelectionIds.forEach((pointSelectionId, rowKey) => {
                const rowCandidates = this.pointSelectionCandidateIds.get(rowKey) ?? [pointSelectionId];
                const matches = selectedIds.some((selectedId) =>
                    rowCandidates.some((candidateId) => this.selectionIdsMatch(selectedId, candidateId))
                );
                if (matches) {
                    matchedSelectionRowKeys.add(rowKey);
                }
            });

            // Fallback path for cross-visual selections coming from different model lineages:
            // use selector string literals (often includes selected category captions such as Plant Name).
            if (matchedSelectionRowKeys.size === 0) {
                const selectorTokens = new Set<string>();
                selectedIds.forEach((selectionId) => {
                    this.getSelectionSelectorTextTokens(selectionId).forEach((token) => selectorTokens.add(token));
                });

                if (selectorTokens.size > 0) {
                    const selectorTokenList = Array.from(selectorTokens);
                    const exactTokenSet = new Set(selectorTokenList);

                    chartData.items.forEach((point) => {
                        const rowKey = String(point.index);
                        if (matchedSelectionRowKeys.has(rowKey)) {
                            return;
                        }

                        const pointTextTokens = [
                            this.normalizeSelectionText(point.civilization),
                            this.normalizeSelectionText(point.region)
                        ].filter((token) => token.length > 0);

                        const hasExactMatch = pointTextTokens.some((token) => exactTokenSet.has(token));
                        if (hasExactMatch) {
                            matchedSelectionRowKeys.add(rowKey);
                            return;
                        }

                        const hasLooseCaptionMatch = pointTextTokens.some((token) =>
                            token.length >= 8
                            && token.includes(" ")
                            && selectorTokenList.some((selectorToken) => selectorToken.includes(token))
                        );

                        if (hasLooseCaptionMatch) {
                            matchedSelectionRowKeys.add(rowKey);
                        }
                    });
                }
            }
        }

        this.latestMatchedSelectionRowKeys = matchedSelectionRowKeys;
        chartData.hasIncomingSelectionIds = selectedIds.length > 0;
        chartData.hasIncomingSelectionMatches = matchedSelectionRowKeys.size > 0;

        chartData.items.forEach((point) => {
            point.isSelectionMatched = matchedSelectionRowKeys.has(String(point.index));
        });

        this.applyRowOpacityState();
        this.updateDiagnosticsOverlay();
    }

    private applyRowOpacityState(): void {
        const chartData = this.latestChartData;
        if (!chartData) {
            return;
        }

        const pointByKey = new Map<string, typeof chartData.items[number]>(
            chartData.items.map((point) => [String(point.index), point])
        );

        const rowElements = this.target.querySelectorAll<SVGGElement>(".timeline-row[data-selection-key]");
        rowElements.forEach((rowElement) => {
            const rowKey = rowElement.getAttribute("data-selection-key");
            if (!rowKey) {
                rowElement.style.opacity = "";
                return;
            }

            const point = pointByKey.get(rowKey);
            if (!point) {
                rowElement.style.opacity = "";
                return;
            }

            const opacity = chartData.hasIncomingSelectionMatches
                ? (point.isSelectionMatched ? 1 : 0.2)
                : chartData.hasIncomingHighlights
                    ? (point.isHighlighted ? 1 : 0.25)
                    : chartData.hasIncomingSelectionIds
                        ? 0.4
                        : 1;

            rowElement.style.opacity = String(opacity);
        });
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

        cards.push(createDataLabelsCard(this.settings.dataLabels));

        cards.push(createTextSizesCard({
            xAxisFontSize: this.settings.textSizes.xAxisFontSize || this.settings.xAxisFontSize,
            yAxisFontSize: this.settings.textSizes.yAxisFontSize || this.settings.yAxisFontSize,
            legendFontSize: this.settings.textSizes.legendFontSize || this.settings.legendFontSize,
            endLabelFontSize: this.settings.textSizes.endLabelFontSize || this.settings.dataLabels.fontSize
        }));

        cards.push(createTimelineCard(this.settings));
        cards.push(createInteractionDiagnosticsCard(this.settings.interactionDiagnostics));

        return { cards };
    }

    public destroy(): void {
        this.target.removeEventListener("scroll", this.onTargetScroll);
        if (typeof document !== "undefined") {
            document.removeEventListener("mousedown", this.onDocumentPointerDown, true);
        }
        try {
            this.exportControl.destroy();
            this.htmlTooltip?.destroy();
            this.htmlTooltip = null;
            this.target.querySelectorAll('[data-bta-tooltip="true"]').forEach(el => el.remove());
            this.sortControlRoot?.remove();
            this.sortControlRoot = null;
            this.sortControlTrigger = null;
            this.sortControlMenu = null;
            this.diagnosticsOverlay?.remove();
            this.diagnosticsOverlay = null;
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
        this.latestChartData = null;
        this.latestMatchedSelectionRowKeys = new Set();
        this.currentSelectionIds = [];
        this.pointSelectionCandidateIds.clear();
    }

    private bindInteractions(): void {
        if (!this.allowInteractions) {
            return;
        }

        this.svg.on("click", (event: MouseEvent) => {
            const target = event.target as Element | null;
            const selectionKey = this.resolveSelectionKeyFromTarget(target);
            if (selectionKey) {
                const selectionId = this.pointSelectionIds.get(selectionKey);
                if (!selectionId) {
                    return;
                }

                const isMultiSelect = event.ctrlKey || event.metaKey;
                this.selectionManager.select(selectionId, isMultiSelect)
                    .then((ids) => this.setSelectionState(ids, "localClick"))
                    .catch(() => undefined);
                return;
            }

            this.selectionManager.clear()
                .then(() => this.setSelectionState([], "clear"))
                .catch(() => undefined);
        });

        this.svg.on("contextmenu", (event: MouseEvent) => {
            const target = event.target as Element | null;
            const selectionKey = this.resolveSelectionKeyFromTarget(target);
            if (selectionKey) {
                const selectionId = this.pointSelectionIds.get(selectionKey);
                if (!selectionId) {
                    return;
                }

                event.preventDefault();
                this.selectionManager.showContextMenu(selectionId, { x: event.clientX, y: event.clientY })
                    .catch(() => undefined);
                return;
            }

            event.preventDefault();
            this.selectionManager.showContextMenu(this.emptySelectionId, { x: event.clientX, y: event.clientY })
                .catch(() => undefined);
        });
    }
}
