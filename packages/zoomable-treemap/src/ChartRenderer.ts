"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, formatMeasureValue } from "@pbi-visuals/shared";
import { IVisualSettings } from "./settings";
import { IChartData } from "./ChartTransformer";

declare const require: any;
const d3Hierarchy = require("d3-hierarchy");

type HNode = any;

function collectLeafLegendKeys(node: { name?: string; children?: any[] }): string[] {
    const keys: string[] = [];
    const visit = (current: { name?: string; children?: any[] }, parentName?: string): void => {
        const children = current.children ?? [];
        if (!children.length) {
            keys.push(String(parentName ?? current.name ?? "(Blank)"));
            return;
        }
        children.forEach((child) => visit(child, String(current.name ?? parentName ?? "(Blank)")));
    };
    visit(node);
    return keys;
}

function ancestorPath(d: any): string {
    return d.ancestors().map((a: any) => a.data.name).reverse().slice(1).join(" > ");
}

function darkenColor(hex: string, amount: number): string {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
    return `rgb(${r},${g},${b})`;
}

export class ChartRenderer extends BaseRenderer<IVisualSettings> {
    private zoomStack: Map<string, any[]> = new Map();
    private lastData: IChartData | null = null;
    private lastSettings: IVisualSettings | null = null;

    constructor(context: RenderContext) {
        super(context);
    }

    private getZoomStack(groupName: string): any[] {
        if (!this.zoomStack.has(groupName)) this.zoomStack.set(groupName, []);
        return this.zoomStack.get(groupName)!;
    }

    private truncateLabel(text: string, maxWidth: number, fontSize: number): string {
        const approxCharW = fontSize * 0.6;
        const maxChars = Math.max(1, Math.floor(maxWidth / approxCharW));
        if (text.length <= maxChars) return text;
        return text.substring(0, maxChars - 1) + "\u2026";
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

        if (!chartData.groups.length) {
            this.renderNoData();
            return;
        }

        const groups = chartData.groups;
        const borderColor = settings.treemapBorderColor || "#ffffff";
        const borderWidth = settings.treemapBorderWidth ?? 2;
        const innerGap = Math.max(0, borderWidth);
        const outerPad = Math.max(1, Math.round(borderWidth * 0.5));

        const legendCategories = Array.from(new Set(
            groups.flatMap((groupName) => {
                const rootData = chartData.treeByGroup.get(groupName);
                if (!rootData) return [];
                return collectLeafLegendKeys(rootData);
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
        const totalWidth = Math.max(220, this.context.width - margin.left - margin.right);
        const totalHeight = Math.max(140, this.context.height - margin.top - margin.bottom - panelGap * (groups.length - 1));
        const panelHeight = totalHeight / groups.length;
        const breadcrumbH = 24;
        const labelFontSize = settings.textSizes.xAxisFontSize || settings.xAxisFontSize;

        groups.forEach((groupName, groupIndex) => {
            const rootData = chartData.treeByGroup.get(groupName);
            if (!rootData) return;

            const stack = this.getZoomStack(groupName);
            const panelY = margin.top + groupIndex * (panelHeight + panelGap);
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

            const hasChildren = !!(zoomRoot.children && zoomRoot.children.length);
            const isZoomed = stack.length > 0;
            const treemapY = isZoomed ? breadcrumbH + 2 : 0;
            const treemapH = Math.max(40, panelHeight - treemapY);

            // Breadcrumb bar
            if (isZoomed) {
                const crumbParts = ["root", ...stack];
                let cx = 0;
                const crumbGroup = panel.append("g").attr("class", "breadcrumb-bar");

                crumbGroup.append("rect")
                    .attr("x", 0).attr("y", 0)
                    .attr("width", totalWidth).attr("height", breadcrumbH)
                    .attr("fill", "#f8f9fa").attr("rx", 4)
                    .attr("stroke", "#e5e7eb").attr("stroke-width", 1);

                crumbParts.forEach((part, idx) => {
                    const isLast = idx === crumbParts.length - 1;
                    const label = idx === 0 ? "\u2190 All" : part;
                    const crumb = crumbGroup.append("text")
                        .attr("x", cx + 10).attr("y", 16)
                        .attr("font-size", "11px")
                        .attr("font-family", settings.xAxisFontFamily)
                        .attr("fill", isLast ? "#1f2937" : "#4b7bec")
                        .style("font-weight", isLast ? "600" : "500")
                        .style("cursor", isLast ? "default" : "pointer")
                        .text(label);

                    if (!isLast) {
                        crumb.on("click", () => {
                            stack.length = idx;
                            this.rerenderAll();
                        });
                    }

                    cx += label.length * 7 + 18;
                    if (!isLast) {
                        crumbGroup.append("text")
                            .attr("x", cx).attr("y", 16)
                            .attr("font-size", "10px").attr("fill", "#b0b8c4")
                            .text("\u203A");
                        cx += 12;
                    }
                });
            }

            // Treemap layout
            const treemap = d3Hierarchy.treemap()
                .size([totalWidth, treemapH])
                .paddingInner(innerGap)
                .paddingOuter(outerPad)
                .round(true);

            treemap(zoomRoot);
            const nodes: HNode[] = hasChildren ? zoomRoot.children : [zoomRoot];

            nodes.forEach((node: any) => {
                const nx0 = node.x0;
                const ny0 = node.y0 + treemapY;
                const nw = Math.max(1, node.x1 - node.x0);
                const nh = Math.max(1, node.y1 - node.y0);
                const canZoom = !!(node.children && node.children.length);
                const nodeName = String(node.data.name ?? "(Blank)");
                const nodeColor = colorScale(String(node.parent?.data?.name || nodeName));

                if (canZoom) {
                    const headerH = Math.min(20, Math.max(14, nh * 0.18));
                    const subY = ny0 + headerH;
                    const subH = Math.max(1, nh - headerH);

                    // Parent background
                    const bgRect = panel.append("rect")
                        .attr("class", "treemap-cell")
                        .attr("x", nx0).attr("y", ny0)
                        .attr("width", nw).attr("height", nh)
                        .attr("fill", darkenColor(nodeColor, 30))
                        .attr("stroke", borderColor)
                        .attr("stroke-width", borderWidth)
                        .attr("rx", 2)
                        .style("cursor", "pointer")
                        .on("click", () => { stack.push(nodeName); this.rerenderAll(); });

                    this.addTooltip(bgRect as any, [
                        { displayName: "Category", value: nodeName, color: nodeColor },
                        { displayName: "Value", value: formatMeasureValue(node.value, chartData.valueFormatString) }
                    ], {
                        title: ancestorPath(node) || nodeName,
                        subtitle: groupName !== "All" ? groupName : undefined,
                        color: nodeColor
                    });

                    // Header label
                    if (nw > 36 && nh > 18) {
                        panel.append("text")
                            .attr("class", "cell-label header-label")
                            .attr("x", nx0 + 5).attr("y", ny0 + headerH - 5)
                            .attr("font-size", Math.max(9, labelFontSize) + "px")
                            .attr("font-weight", "700")
                            .attr("fill", "#fff")
                            .style("pointer-events", "none")
                            .text(this.truncateLabel(nodeName, nw - 10, labelFontSize));
                    }

                    // Sub-treemap
                    const subTreemap = d3Hierarchy.treemap()
                        .size([nw - 2, subH - 1])
                        .paddingInner(Math.max(1, Math.round(borderWidth * 0.5)))
                        .paddingOuter(0)
                        .round(true);

                    const subRoot = d3Hierarchy.hierarchy(node.data)
                        .sum((d: any) => Number(d.value) || 0)
                        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));
                    subTreemap(subRoot);
                    const subLeaves: HNode[] = subRoot.leaves();

                    subLeaves.forEach((leaf: any) => {
                        const lx = nx0 + 1 + leaf.x0;
                        const ly = subY + leaf.y0;
                        const lw = Math.max(1, leaf.x1 - leaf.x0);
                        const lh = Math.max(1, leaf.y1 - leaf.y0);
                        const leafColor = colorScale(String(leaf.parent?.data?.name || nodeName));

                        const leafRect = panel.append("rect")
                            .attr("class", "treemap-cell leaf-cell")
                            .attr("x", lx).attr("y", ly)
                            .attr("width", lw).attr("height", lh)
                            .attr("fill", leafColor)
                            .attr("stroke", borderColor)
                            .attr("stroke-width", Math.max(0.5, borderWidth * 0.5))
                            .attr("rx", 1)
                            .style("cursor", "pointer")
                            .on("click", () => { stack.push(nodeName); this.rerenderAll(); });

                        this.addTooltip(leafRect as any, [
                            { displayName: "Node", value: String(leaf.data.name), color: leafColor },
                            { displayName: "Value", value: formatMeasureValue(leaf.value, chartData.valueFormatString) }
                        ], {
                            title: nodeName + " \u203A " + String(leaf.data.name),
                            subtitle: groupName !== "All" ? groupName : undefined,
                            color: leafColor
                        });

                        if (lw > 36 && lh > 16) {
                            panel.append("text")
                                .attr("class", "cell-label leaf-label")
                                .attr("x", lx + 4).attr("y", ly + 13)
                                .attr("font-size", Math.max(8, labelFontSize - 1) + "px")
                                .attr("fill", "#fff")
                                .style("pointer-events", "none")
                                .text(this.truncateLabel(String(leaf.data.name), lw - 8, labelFontSize - 1));
                        }
                    });
                } else {
                    // Leaf node
                    const leafRect = panel.append("rect")
                        .attr("class", "treemap-cell leaf-cell")
                        .attr("x", nx0).attr("y", ny0)
                        .attr("width", nw).attr("height", nh)
                        .attr("fill", nodeColor)
                        .attr("stroke", borderColor)
                        .attr("stroke-width", borderWidth)
                        .attr("rx", 2);

                    this.addTooltip(leafRect as any, [
                        { displayName: "Node", value: nodeName, color: nodeColor },
                        { displayName: "Value", value: formatMeasureValue(node.value, chartData.valueFormatString) }
                    ], {
                        title: ancestorPath(node) || nodeName,
                        subtitle: groupName !== "All" ? groupName : undefined,
                        color: nodeColor
                    });

                    if (nw > 36 && nh > 16) {
                        panel.append("text")
                            .attr("class", "cell-label leaf-label")
                            .attr("x", nx0 + 5).attr("y", ny0 + 15)
                            .attr("font-size", labelFontSize + "px")
                            .attr("fill", "#fff")
                            .style("pointer-events", "none")
                            .text(this.truncateLabel(nodeName, nw - 10, labelFontSize));
                    }
                }
            });

            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All") {
                panel.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0).attr("y", -6)
                    .attr("font-size", (settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize) + "px")
                    .text(groupName);
            }
        });

        if (settings.showLegend && legendCategories.length) {
            this.renderLegend(colorScale, chartData.maxValue, true, legendCategories.slice(0, settings.maxLegendItems), undefined, undefined, {
                alignFrame: { x: margin.left, y: margin.top, width: totalWidth, height: totalHeight }
            });
        }
    }
}
