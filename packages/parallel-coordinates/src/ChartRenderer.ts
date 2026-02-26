"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, formatMeasureValue } from "@pbi-visuals/shared";
import { IVisualSettings } from "./settings";
import { IChartData, IParallelRow } from "./ChartTransformer";

export class ChartRenderer extends BaseRenderer<IVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IVisualSettings): void {
        this.settings = settings;
        const chartData = data as IChartData;

        if (!chartData.rows.length || chartData.dimensions.length < 1) {
            this.renderNoData();
            return;
        }

        const groups = chartData.groups.length ? chartData.groups : ["All"];
        const categoryKeys = Array.from(new Set(chartData.rows.map((r) => r.category)));
        const legendKeys = groups.length > 1 ? groups : categoryKeys;
        const legendFontSize = settings.textSizes?.legendFontSize || settings.legendFontSize || 11;
        const legendReservation = settings.showLegend
            ? this.getLegendReservation({
                isOrdinal: true,
                categories: legendKeys,
                legendFontSize,
                availableWidth: this.context.width,
                availableHeight: this.context.height
            })
            : { top: 0, right: 0, bottom: 0, left: 0 };
        const margin = {
            top: 24 + legendReservation.top,
            right: 20 + legendReservation.right,
            bottom: 36 + legendReservation.bottom,
            left: 20 + legendReservation.left
        };
        const panelGap = groups.length > 1 ? Math.max(18, settings.smallMultiples.spacing) : 0;
        const width = Math.max(180, this.context.width - margin.left - margin.right);
        const height = Math.max(140, this.context.height - margin.top - margin.bottom - panelGap * (groups.length - 1));
        const panelHeight = height / groups.length;

        const axisX = d3.scalePoint<string>()
            .domain(chartData.dimensions.map((d) => d.key))
            .range([0, width])
            .padding(0.2);

        const yByDim = new Map<string, ReturnType<typeof d3.scaleLinear>>();
        chartData.dimensions.forEach((dim) => {
            yByDim.set(dim.key, d3.scaleLinear().domain([dim.min, dim.max || dim.min + 1]).range([panelHeight, 0]));
        });

        const colorKeys = groups.length > 1 ? groups : categoryKeys;
        const colorScale = this.getCategoryColors(colorKeys.length ? colorKeys : groups);
        const colorForRow = (row: IParallelRow): string => groups.length > 1 ? colorScale(row.group) : colorScale(row.category);
        const lineStrokeWidth = groups.length > 1 ? 1.8 : 2.6;
        const lineStrokeOpacity = groups.length > 1 ? 0.55 : 0.78;

        const pathForRow = (row: IParallelRow): string => {
            const points: Array<[number, number]> = [];
            chartData.dimensions.forEach((dim) => {
                const x = axisX(dim.key);
                const yScale = yByDim.get(dim.key);
                const v = row.values[dim.key];
                if (x === undefined || !yScale || !Number.isFinite(v)) return;
                points.push([x, Number(yScale(v as number))]);
            });
            return d3.line<[number, number]>().curve(d3.curveMonotoneX)(points as any) || "";
        };

        groups.forEach((groupName, groupIndex) => {
            const panelY = margin.top + groupIndex * (panelHeight + panelGap);
            const panel = this.context.container.append("g")
                .attr("class", "panel")
                .attr("transform", "translate(" + margin.left + "," + Math.round(panelY) + ")");

            const rows = chartData.rows.filter((r) => r.group === groupName);
            if (!rows.length) return;

            if (chartData.dimensions.length > 1) {
                panel.selectAll("path.mark-halo")
                    .data(rows)
                    .join("path")
                    .attr("class", "mark-halo")
                    .attr("d", (d: IParallelRow) => pathForRow(d))
                    .attr("fill", "none")
                    .attr("stroke", "#ffffff")
                    .attr("stroke-width", lineStrokeWidth + 1.8)
                    .attr("stroke-opacity", 0.55);

                const marks = panel.selectAll("path.mark")
                    .data(rows)
                    .join("path")
                    .attr("class", "mark")
                    .attr("d", (d: IParallelRow) => pathForRow(d))
                    .attr("fill", "none")
                    .attr("stroke", (d: IParallelRow) => colorForRow(d))
                    .attr("stroke-width", lineStrokeWidth)
                    .attr("stroke-opacity", lineStrokeOpacity)
                    .style("mix-blend-mode", "multiply")
                    .each((d: IParallelRow, i, nodes) => {
                        const firstDim = chartData.dimensions[0];
                        const firstValue = d.values[firstDim.key];
                        this.addTooltip(d3.select(nodes[i]) as any, [
                            { displayName: "Category", value: d.category, color: colorForRow(d) },
                            { displayName: firstDim.key, value: formatMeasureValue(firstValue, chartData.formatByDimension.get(firstDim.key)) }
                        ], {
                            title: d.category,
                            subtitle: groupName !== "All" ? groupName : undefined,
                            color: colorForRow(d)
                        });
                    });

                marks.on("mouseenter", function (_event, _d) {
                    panel.selectAll<SVGPathElement, IParallelRow>("path.mark")
                        .attr("stroke-opacity", Math.max(0.12, lineStrokeOpacity * 0.2))
                        .attr("stroke-width", lineStrokeWidth);
                    d3.select(this)
                        .attr("stroke-opacity", 1)
                        .attr("stroke-width", lineStrokeWidth + 1.4);
                }).on("mouseleave", function () {
                    panel.selectAll<SVGPathElement, IParallelRow>("path.mark")
                        .attr("stroke-opacity", lineStrokeOpacity)
                        .attr("stroke-width", lineStrokeWidth);
                });

                if (rows.length <= 80) {
                    const pointRows = rows.flatMap((row) => chartData.dimensions.map((dim) => ({
                        row,
                        dimKey: dim.key,
                        value: row.values[dim.key]
                    })));

                    panel.selectAll("circle.axis-point")
                        .data(pointRows)
                        .join("circle")
                        .attr("class", "axis-point")
                        .attr("cx", (d: { dimKey: string }) => Math.round(axisX(d.dimKey) ?? 0))
                        .attr("cy", (d: { dimKey: string; value: number }) => {
                            const y = yByDim.get(d.dimKey);
                            return y ? Math.round(Number(y(d.value))) : 0;
                        })
                        .attr("r", groups.length > 1 ? 2.4 : 2.9)
                        .attr("fill", (d: { row: IParallelRow }) => colorForRow(d.row))
                        .attr("stroke", "#ffffff")
                        .attr("stroke-width", 1)
                        .attr("fill-opacity", 0.95);
                }
            } else {
                const dim = chartData.dimensions[0];
                const x = axisX(dim.key);
                const y = yByDim.get(dim.key);
                if (x !== undefined && y) {
                    panel.selectAll("circle.mark")
                        .data(rows)
                        .join("circle")
                        .attr("class", "mark")
                        .attr("cx", (_d: IParallelRow, i: number) => Math.round(x + (((i % 7) - 3) * 1.5)))
                        .attr("cy", (d: IParallelRow) => Math.round(Number(y(d.values[dim.key]))))
                        .attr("r", 3.8)
                        .attr("fill", (d: IParallelRow) => colorForRow(d))
                        .attr("fill-opacity", 0.95)
                        .attr("stroke", "#ffffff")
                        .attr("stroke-width", 1)
                        .each((d: IParallelRow, i, nodes) => {
                            const value = d.values[dim.key];
                            this.addTooltip(d3.select(nodes[i]) as any, [
                                { displayName: "Category", value: d.category, color: colorForRow(d) },
                                { displayName: dim.key, value: formatMeasureValue(value, chartData.formatByDimension.get(dim.key)) }
                            ], {
                                title: d.category,
                                subtitle: groupName !== "All" ? groupName : undefined,
                                color: colorForRow(d)
                            });
                        });
                }
            }

            chartData.dimensions.forEach((dim) => {
                const x = axisX(dim.key);
                const y = yByDim.get(dim.key);
                if (x === undefined || !y) return;

                panel.append("line")
                    .attr("x1", Math.round(x))
                    .attr("x2", Math.round(x))
                    .attr("y1", 0)
                    .attr("y2", Math.round(panelHeight))
                    .attr("stroke", this.getGridStroke("#9ca3af"))
                    .attr("stroke-width", 1.6)
                    .attr("opacity", 0.8);

                if (settings.showXAxis) {
                    panel.append("text")
                        .attr("x", Math.round(x))
                        .attr("y", Math.round(panelHeight + 14))
                        .attr("text-anchor", "middle")
                        .attr("font-size", (settings.textSizes.xAxisFontSize || settings.xAxisFontSize) + "px")
                        .attr("fill", settings.xAxisColor)
                        .text(dim.key);
                }

                if (settings.showYAxis) {
                    panel.selectAll("text.y-label-" + dim.key.replace(/\s+/g, "-"))
                        .data([0, 0.5, 1])
                        .join("text")
                        .attr("x", Math.round(x - 6))
                        .attr("y", (f: number) => Math.round(Number(y(dim.min + (dim.max - dim.min) * f))) + 4)
                        .attr("text-anchor", "end")
                        .attr("font-size", (settings.textSizes.yAxisFontSize || settings.yAxisFontSize) + "px")
                        .attr("fill", settings.yAxisColor)
                        .text((f: number) => formatMeasureValue(dim.min + (dim.max - dim.min) * f, chartData.formatByDimension.get(dim.key)));
                }
            });

            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All") {
                panel.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", -8)
                    .attr("font-size", (settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize) + "px")
                    .text(groupName);
            }
        });

        if (settings.showLegend) {
            if (groups.length > 1) {
                this.renderLegend(colorScale, 1, true, groups, undefined, undefined, {
                    alignFrame: {
                        x: margin.left,
                        y: 0,
                        width,
                        height: Math.max(0, margin.top - 6)
                    },
                    availableWidth: width,
                    availableHeight: Math.max(0, margin.top - 6)
                });
            } else if (categoryKeys.length > 1) {
                const maxItems = Math.max(1, settings.maxLegendItems || 8);
                this.renderLegend(colorScale, 1, true, categoryKeys.slice(0, maxItems), undefined, undefined, {
                    alignFrame: {
                        x: margin.left,
                        y: 0,
                        width,
                        height: Math.max(0, margin.top - 6)
                    },
                    availableWidth: width,
                    availableHeight: Math.max(0, margin.top - 6)
                });
            }
        }
    }
}
