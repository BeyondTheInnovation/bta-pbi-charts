"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, formatMeasureValue } from "@pbi-visuals/shared";
import { IVisualSettings } from "./settings";
import { IChartData, IHistogramBin } from "./ChartTransformer";

export class ChartRenderer extends BaseRenderer<IVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IVisualSettings): void {
        this.settings = settings;
        const chartData = data as IChartData;

        if (!chartData.bins.length) {
            this.renderNoData();
            return;
        }

        const groups = chartData.groups.length ? chartData.groups : ["All"];
        const margin = { top: 24, right: 14, bottom: 42, left: 40 };
        const panelGap = groups.length > 1 ? Math.max(18, settings.smallMultiples.spacing) : 0;
        const width = Math.max(120, this.context.width - margin.left - margin.right);
        const height = Math.max(120, this.context.height - margin.top - margin.bottom - panelGap * (groups.length - 1));
        const panelHeight = height / groups.length;

        const colorScale = this.getCategoryColors(groups);

        groups.forEach((groupName, groupIndex) => {
            const panelY = margin.top + groupIndex * (panelHeight + panelGap);
            const panel = this.context.container.append("g")
                .attr("class", "panel")
                .attr("transform", "translate(" + margin.left + "," + Math.round(panelY) + ")");

            const bins = chartData.bins.filter((b) => b.group === groupName);
            if (!bins.length) return;

            const domain = chartData.groupDomains.get(groupName)!;
            const x = d3.scaleLinear().domain([domain.min, domain.max || domain.min + 1]).range([0, width]);
            const y = d3.scaleLinear().domain([0, domain.maxCount || 1]).range([panelHeight, 0]);
            const barGapPx = width >= 240 ? 2 : (width >= 140 ? 1 : 0);
            const getBinStart = (d: IHistogramBin): number => {
                const raw = Math.round(x(d.x0));
                return Math.max(0, Math.min(width - 1, raw));
            };
            const getBinEnd = (d: IHistogramBin): number => {
                const raw = Math.round(x(d.x1));
                return Math.max(1, Math.min(width, raw));
            };

            panel.selectAll("line.grid")
                .data([0, 0.5, 1].map((f) => (domain.maxCount || 1) * f))
                .join("line")
                .attr("x1", 0)
                .attr("x2", width)
                .attr("y1", (d) => Math.round(y(d)))
                .attr("y2", (d) => Math.round(y(d)))
                .attr("stroke", this.getGridStroke("#e5e7eb"))
                .attr("stroke-width", 1)
                .attr("opacity", 0.5);

            panel.selectAll("rect.mark")
                .data(bins)
                .join("rect")
                .attr("class", "mark")
                .attr("x", (d: IHistogramBin) => getBinStart(d))
                .attr("y", (d: IHistogramBin) => Math.round(y(d.count)))
                .attr("width", (d: IHistogramBin, i: number, nodes) => {
                    const start = getBinStart(d);
                    const end = getBinEnd(d);
                    const hasRightNeighbor = i < nodes.length - 1;
                    const gap = hasRightNeighbor ? barGapPx : 0;
                    return Math.max(1, end - start - gap);
                })
                .attr("height", (d: IHistogramBin) => Math.max(1, Math.round(panelHeight - y(d.count))))
                .attr("fill", colorScale(groupName))
                .attr("fill-opacity", 1)
                .each((d: IHistogramBin, i, nodes) => {
                    const tooltipData = [
                        { displayName: chartData.valueDisplayName || "Value", value: formatMeasureValue(d.count, undefined), color: colorScale(groupName) },
                        { displayName: "From", value: formatMeasureValue(d.x0, chartData.valueFormatString) },
                        { displayName: "To", value: formatMeasureValue(d.x1, chartData.valueFormatString) }
                    ];
                    this.addTooltip(d3.select(nodes[i]) as any, tooltipData, {
                        title: "Bin",
                        subtitle: groupName !== "All" ? groupName : undefined,
                        color: colorScale(groupName)
                    });
                });

            if (settings.showXAxis) {
                const ticks = [domain.min, domain.min + (domain.max - domain.min) * 0.5, domain.max];
                panel.selectAll("text.x-label")
                    .data(ticks)
                    .join("text")
                    .attr("x", (d) => Math.round(x(d)))
                    .attr("y", Math.round(panelHeight + 14))
                    .attr("text-anchor", "middle")
                    .attr("font-size", (settings.textSizes.xAxisFontSize || settings.xAxisFontSize) + "px")
                    .attr("fill", settings.xAxisColor)
                    .text((d) => formatMeasureValue(d, chartData.valueFormatString));
            }

            if (settings.showYAxis) {
                panel.selectAll("text.y-label")
                    .data([0, 0.5, 1])
                    .join("text")
                    .attr("x", -8)
                    .attr("y", (f) => Math.round(y((domain.maxCount || 1) * f)) + 4)
                    .attr("text-anchor", "end")
                    .attr("font-size", (settings.textSizes.yAxisFontSize || settings.yAxisFontSize) + "px")
                    .attr("fill", settings.yAxisColor)
                    .text((f) => String(Math.round((domain.maxCount || 1) * f)));
            }

            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All") {
                panel.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", -8)
                    .attr("font-size", (settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize) + "px")
                    .text(groupName);
            }
        });

        if (settings.showLegend && groups.length > 1) {
            this.renderLegend(colorScale, chartData.maxValue, true, groups);
        }
    }
}
