"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, formatMeasureValue } from "@pbi-visuals/shared";
import { IVisualSettings } from "./settings";
import { IChartData } from "./ChartTransformer";

declare const require: any;
const sankeyLib = require("d3-sankey");

export class ChartRenderer extends BaseRenderer<IVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IVisualSettings): void {
        this.settings = settings;
        const chartData = data as IChartData;

        if (!chartData.groups.length) {
            this.renderNoData();
            return;
        }

        const groups = chartData.groups;
        const margin = { top: 24, right: 12, bottom: 18, left: 12 };
        const panelGap = groups.length > 1 ? Math.max(18, settings.smallMultiples.spacing) : 0;
        const width = Math.max(220, this.context.width - margin.left - margin.right);
        const height = Math.max(140, this.context.height - margin.top - margin.bottom - panelGap * (groups.length - 1));
        const panelHeight = height / groups.length;

        groups.forEach((groupName, groupIndex) => {
            const panelY = margin.top + groupIndex * (panelHeight + panelGap);
            const panel = this.context.container.append("g")
                .attr("class", "panel")
                .attr("transform", "translate(" + margin.left + "," + Math.round(panelY) + ")");

            const nodesRaw = chartData.nodesByGroup.get(groupName) ?? [];
            const linksRaw = chartData.linksByGroup.get(groupName) ?? [];
            if (!nodesRaw.length || !linksRaw.length) return;

            const graph = {
                nodes: nodesRaw.map((n) => ({ ...n })),
                links: linksRaw.map((l) => ({ ...l }))
            };

            const sankey = sankeyLib.sankey()
                .nodeId((d: any) => d.id)
                .nodeWidth(16)
                .nodePadding(10)
                .extent([[0, 0], [width, panelHeight]]);

            const layout = sankey(graph);
            const colorScale = this.getCategoryColors(layout.nodes.map((n: any) => String(n.id)));

            panel.append("g")
                .selectAll("path.mark")
                .data(layout.links)
                .join("path")
                .attr("class", "mark")
                .attr("d", sankeyLib.sankeyLinkHorizontal())
                .attr("fill", "none")
                .attr("stroke", (d: any) => colorScale(String(d.source.id)))
                .attr("stroke-opacity", 0.35)
                .attr("stroke-width", (d: any) => Math.max(1, d.width))
                .each((d: any, i: number, nodes: any[]) => {
                    this.addTooltip(d3.select(nodes[i]) as any, [
                        { displayName: "Source", value: String(d.source.id), color: colorScale(String(d.source.id)) },
                        { displayName: "Target", value: String(d.target.id) },
                        { displayName: "Value", value: formatMeasureValue(d.value, chartData.valueFormatString) }
                    ], {
                        title: String(d.source.id) + " -> " + String(d.target.id),
                        subtitle: groupName !== "All" ? groupName : undefined,
                        color: colorScale(String(d.source.id))
                    });
                });

            const nodeG = panel.append("g")
                .selectAll("g.mark")
                .data(layout.nodes)
                .join("g")
                .attr("class", "mark");

            nodeG.append("rect")
                .attr("x", (d: any) => Math.round(d.x0))
                .attr("y", (d: any) => Math.round(d.y0))
                .attr("width", (d: any) => Math.max(1, Math.round(d.x1 - d.x0)))
                .attr("height", (d: any) => Math.max(1, Math.round(d.y1 - d.y0)))
                .attr("rx", 2)
                .attr("fill", (d: any) => colorScale(String(d.id)))
                .attr("fill-opacity", 0.8)
                .attr("stroke", "#111827")
                .attr("stroke-width", 0.6);

            nodeG.append("text")
                .attr("x", (d: any) => (d.x0 < width / 2 ? Math.round(d.x1 + 6) : Math.round(d.x0 - 6)))
                .attr("y", (d: any) => Math.round((d.y0 + d.y1) / 2) + 4)
                .attr("text-anchor", (d: any) => (d.x0 < width / 2 ? "start" : "end"))
                .attr("font-size", (settings.textSizes.xAxisFontSize || settings.xAxisFontSize) + "px")
                .attr("fill", settings.xAxisColor)
                .text((d: any) => String(d.id));

            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All") {
                panel.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", -8)
                    .attr("font-size", (settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize) + "px")
                    .text(groupName);
            }
        });
    }
}
