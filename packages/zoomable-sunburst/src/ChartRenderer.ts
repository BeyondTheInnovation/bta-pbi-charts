"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, formatMeasureValue } from "@pbi-visuals/shared";
import { IVisualSettings } from "./settings";
import { IChartData } from "./ChartTransformer";

declare const require: any;
const d3Hierarchy = require("d3-hierarchy");

function ancestorPath(d: any): string {
    return d.ancestors().map((a: any) => a.data.name).reverse().slice(1).join(" > ");
}

function collectLegendKeys(node: { name?: string; children?: any[] }): string[] {
    const keys: string[] = [];
    const visit = (cur: any, parent?: string): void => {
        const ch = cur.children ?? [];
        if (!ch.length) { keys.push(String(parent ?? cur.name ?? "(Blank)")); return; }
        ch.forEach((c: any) => visit(c, String(cur.name ?? parent ?? "(Blank)")));
    };
    visit(node);
    return keys;
}

export class ChartRenderer extends BaseRenderer<IVisualSettings> {
    private zoomStack: Map<string, any[]> = new Map();
    private lastData: IChartData | null = null;
    private lastSettings: IVisualSettings | null = null;

    constructor(context: RenderContext) {
        super(context);
    }

    private getStack(group: string): any[] {
        if (!this.zoomStack.has(group)) this.zoomStack.set(group, []);
        return this.zoomStack.get(group)!;
    }

    private rerenderAll(): void {
        if (!this.lastData || !this.lastSettings) return;
        this.context.container.selectAll("*").remove();
        this.render(this.lastData, this.lastSettings);
    }

    public render(data: ChartData, settings: IVisualSettings): void {
        this.settings = settings;
        const chartData = data as IChartData;
        this.lastData = chartData;
        this.lastSettings = settings;

        if (!chartData.groups.length) { this.renderNoData(); return; }

        const groups = chartData.groups;
        const legendCategories = Array.from(new Set(
            groups.flatMap((g) => {
                const r = chartData.treeByGroup.get(g);
                return r ? collectLegendKeys(r) : [];
            })
        ));
        const colorScale = this.getCategoryColors(legendCategories.length ? legendCategories : groups);

        const legendReserve = settings.showLegend && legendCategories.length
            ? this.getLegendReservation({ isOrdinal: true, categories: legendCategories.slice(0, settings.maxLegendItems) })
            : { top: 0, right: 0, bottom: 0, left: 0 };

        const margin = {
            top: 8 + legendReserve.top,
            right: 6 + legendReserve.right,
            bottom: 6 + legendReserve.bottom,
            left: 6 + legendReserve.left
        };
        const panelGap = groups.length > 1 ? Math.max(18, settings.smallMultiples.spacing) : 0;
        const totalW = Math.max(220, this.context.width - margin.left - margin.right);
        const totalH = Math.max(180, this.context.height - margin.top - margin.bottom - panelGap * (groups.length - 1));
        const panelH = totalH / groups.length;
        const breadcrumbH = 22;
        const labelFontSize = Math.max(8, Math.min(12, settings.textSizes.xAxisFontSize || settings.xAxisFontSize));

        groups.forEach((groupName, groupIndex) => {
            const rootData = chartData.treeByGroup.get(groupName);
            if (!rootData) return;

            const stack = this.getStack(groupName);
            const isZoomed = stack.length > 0;
            const panelY = margin.top + groupIndex * (panelH + panelGap);
            const panel = this.context.container.append("g")
                .attr("class", "panel")
                .attr("transform", `translate(${margin.left},${Math.round(panelY)})`);

            let zoomData: any = rootData;
            for (const seg of stack) {
                const child = (zoomData.children ?? []).find((c: any) => c.name === seg);
                if (child) zoomData = child;
                else break;
            }

            const zoomRoot = d3Hierarchy.hierarchy(zoomData)
                .sum((d: any) => Number(d.value) || 0)
                .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

            const chartY = isZoomed ? breadcrumbH : 0;
            const chartH = Math.max(60, panelH - chartY);
            const radius = Math.max(30, Math.min(totalW, chartH) / 2 - 8);
            const cx = totalW / 2;
            const cy = chartY + chartH / 2;

            // Breadcrumb
            if (isZoomed) {
                const parts = ["root", ...stack];
                let bx = 0;
                const crumbG = panel.append("g").attr("class", "breadcrumb-bar");
                crumbG.append("rect").attr("width", totalW).attr("height", breadcrumbH).attr("fill", "#f3f4f6").attr("rx", 3);

                parts.forEach((part, idx) => {
                    const isLast = idx === parts.length - 1;
                    const label = idx === 0 ? "\u2190 All" : part;
                    const crumb = crumbG.append("text")
                        .attr("x", bx + 8).attr("y", 15)
                        .attr("font-size", "11px").attr("font-family", settings.xAxisFontFamily)
                        .attr("fill", isLast ? "#111827" : "#3b82f6")
                        .style("font-weight", isLast ? "600" : "400")
                        .style("cursor", isLast ? "default" : "pointer")
                        .text(label);
                    if (!isLast) crumb.on("click", () => { stack.length = idx; this.rerenderAll(); });
                    bx += label.length * 7 + 16;
                    if (!isLast) {
                        crumbG.append("text").attr("x", bx).attr("y", 15).attr("font-size", "11px").attr("fill", "#9ca3af").text(">");
                        bx += 14;
                    }
                });
            }

            // Partition layout
            const partition = d3Hierarchy.partition().size([2 * Math.PI, radius]);
            partition(zoomRoot);

            const nodes = zoomRoot.descendants().filter((d: any) => d.depth > 0 && d.x1 > d.x0);

            const arc = d3.arc<any>()
                .startAngle((d: any) => d.x0)
                .endAngle((d: any) => d.x1)
                .innerRadius((d: any) => d.y0)
                .outerRadius((d: any) => Math.max(d.y0 + 1, d.y1 - 1));

            const g = panel.append("g").attr("transform", `translate(${Math.round(cx)},${Math.round(cy)})`);

            // Center circle (click to zoom out)
            if (isZoomed) {
                g.append("circle")
                    .attr("r", Math.max(8, zoomRoot.y0 || radius * 0.15))
                    .attr("fill", "#f9fafb")
                    .attr("stroke", "#d1d5db")
                    .attr("stroke-width", 1)
                    .style("cursor", "pointer")
                    .on("click", () => { stack.pop(); this.rerenderAll(); });
                g.append("text")
                    .attr("text-anchor", "middle").attr("dy", "0.35em")
                    .attr("font-size", "11px").attr("fill", "#6b7280")
                    .style("pointer-events", "none")
                    .text("\u2190 Back");
            }

            g.selectAll("path.mark")
                .data(nodes)
                .join("path")
                .attr("class", "mark")
                .attr("d", arc as any)
                .attr("fill", (d: any) => colorScale(String(d.children ? d.data.name : (d.parent?.data?.name || d.data.name))))
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 1)
                .attr("fill-opacity", 0.9)
                .style("cursor", (d: any) => d.children ? "pointer" : "default")
                .on("click", (event: any, d: any) => {
                    if (!d.children) return;
                    const path = d.ancestors().map((a: any) => a.data.name).reverse().slice(1);
                    stack.length = 0;
                    path.forEach((seg: string) => stack.push(seg));
                    this.rerenderAll();
                })
                .each((d: any, i: number, nodesSel: any[]) => {
                    const color = colorScale(String(d.children ? d.data.name : (d.parent?.data?.name || d.data.name)));
                    this.addTooltip(d3.select(nodesSel[i]) as any, [
                        { displayName: "Node", value: String(d.data.name), color },
                        { displayName: "Value", value: formatMeasureValue(d.value, chartData.valueFormatString) }
                    ], {
                        title: ancestorPath(d) || d.data.name,
                        subtitle: groupName !== "All" ? groupName : undefined,
                        color
                    });
                });

            // Labels on arcs
            g.selectAll("text.arc-label")
                .data(nodes.filter((d: any) => (d.x1 - d.x0) > 0.16 && (d.y1 - d.y0) > 12))
                .join("text")
                .attr("class", "arc-label")
                .attr("transform", (d: any) => {
                    const a = (d.x0 + d.x1) / 2;
                    const r = (d.y0 + d.y1) / 2;
                    const x = Math.cos(a - Math.PI / 2) * r;
                    const y = Math.sin(a - Math.PI / 2) * r;
                    const rotate = (a * 180 / Math.PI) - 90;
                    return `translate(${x},${y}) rotate(${rotate})`;
                })
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("font-size", labelFontSize + "px")
                .attr("fill", "#fff")
                .style("pointer-events", "none")
                .style("text-shadow", "0 1px 2px rgba(0,0,0,0.4)")
                .text((d: any) => String(d.data.name));

            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All") {
                panel.append("text").attr("class", "panel-title")
                    .attr("x", 0).attr("y", -6)
                    .attr("font-size", (settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize) + "px")
                    .text(groupName);
            }
        });

        if (settings.showLegend && legendCategories.length) {
            this.renderLegend(colorScale, chartData.maxValue, true, legendCategories.slice(0, settings.maxLegendItems), undefined, undefined, {
                alignFrame: { x: margin.left, y: margin.top, width: totalW, height: totalH }
            });
        }
    }
}
