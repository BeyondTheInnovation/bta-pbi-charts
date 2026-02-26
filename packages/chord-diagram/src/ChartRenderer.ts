"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, formatMeasureValue } from "@pbi-visuals/shared";
import { IVisualSettings } from "./settings";
import { IChartData } from "./ChartTransformer";

declare const require: any;
const chordLib = require("d3-chord");

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
        const margin = { top: 24, right: 10, bottom: 10, left: 10 };
        const panelGap = groups.length > 1 ? Math.max(18, settings.smallMultiples.spacing) : 0;
        const width = Math.max(220, this.context.width - margin.left - margin.right);
        const height = Math.max(180, this.context.height - margin.top - margin.bottom - panelGap * (groups.length - 1));
        const panelHeight = height / groups.length;

        groups.forEach((groupName, groupIndex) => {
            const def = chartData.matricesByGroup.get(groupName);
            if (!def || def.names.length < 2) return;

            const panelY = margin.top + groupIndex * (panelHeight + panelGap);
            const panel = this.context.container.append("g")
                .attr("class", "panel")
                .attr("transform", "translate(" + margin.left + "," + Math.round(panelY) + ")");

            const labelSpace = Math.max(40, Math.min(70, width * 0.08));
            const radius = Math.max(52, Math.min(width, panelHeight) / 2 - labelSpace);
            const bandWidth = Math.max(8, Math.min(14, radius * 0.08));
            const inner = radius - bandWidth;
            const cx = width / 2;
            const cy = panelHeight / 2;

            const chord = chordLib.chord().padAngle(0.04).sortSubgroups((a: number, b: number) => b - a);
            const chords = chord(def.matrix);
            const colorScale = this.getCategoryColors(def.names);

            const g = panel.append("g").attr("transform", "translate(" + Math.round(cx) + "," + Math.round(cy) + ")");

            const arc = d3.arc<any>().innerRadius(inner).outerRadius(radius);
            const ribbon = chordLib.ribbon().radius(inner);

            // Render ribbons first (behind arcs)
            const ribbonPaths = g.selectAll("path.ribbon")
                .data(chords)
                .join("path")
                .attr("class", "ribbon mark")
                .attr("d", ribbon as any)
                .attr("fill", (d: any) => colorScale(def.names[d.source.index]))
                .attr("fill-opacity", 0.42)
                .attr("stroke", "none")
                .each((d: any, i: number, nodes: any[]) => {
                    const source = def.names[d.source.index];
                    const target = def.names[d.target.index];
                    this.addTooltip(d3.select(nodes[i]) as any, [
                        { displayName: "Source", value: source, color: colorScale(source) },
                        { displayName: "Target", value: target, color: colorScale(target) },
                        { displayName: "Value", value: formatMeasureValue(d.source.value, chartData.valueFormatString) }
                    ], {
                        title: source + " \u2192 " + target,
                        subtitle: groupName !== "All" ? groupName : undefined,
                        color: colorScale(source)
                    });
                });

            // Render arcs (on top of ribbons)
            const arcPaths = g.selectAll("path.group")
                .data(chords.groups)
                .join("path")
                .attr("class", "group mark")
                .attr("d", arc as any)
                .attr("fill", (d: any) => colorScale(def.names[d.index]))
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 0.8)
                .each((d: any, i: number, nodes: any[]) => {
                    this.addTooltip(d3.select(nodes[i]) as any, [
                        { displayName: "Category", value: def.names[d.index], color: colorScale(def.names[d.index]) },
                        { displayName: "Total", value: formatMeasureValue(d.value, chartData.valueFormatString) }
                    ], {
                        title: def.names[d.index],
                        subtitle: groupName !== "All" ? groupName : undefined,
                        color: colorScale(def.names[d.index])
                    });
                });

            // Hover interaction: highlight connected ribbons
            arcPaths
                .on("mouseenter", (_event: any, d: any) => {
                    const idx = d.index;
                    ribbonPaths.attr("fill-opacity", (r: any) =>
                        r.source.index === idx || r.target.index === idx ? 0.75 : 0.08
                    );
                    arcPaths.attr("opacity", (a: any) => a.index === idx ? 1 : 0.4);
                })
                .on("mouseleave", () => {
                    ribbonPaths.attr("fill-opacity", 0.42);
                    arcPaths.attr("opacity", 1);
                });

            ribbonPaths
                .on("mouseenter", (_event: any, d: any) => {
                    const si = d.source.index;
                    const ti = d.target.index;
                    ribbonPaths.attr("fill-opacity", (r: any) =>
                        r.source.index === si && r.target.index === ti ? 0.8 : 0.06
                    );
                    arcPaths.attr("opacity", (a: any) =>
                        a.index === si || a.index === ti ? 1 : 0.4
                    );
                })
                .on("mouseleave", () => {
                    ribbonPaths.attr("fill-opacity", 0.42);
                    arcPaths.attr("opacity", 1);
                });

            // Labels — horizontal for readability, with collision nudging
            const fontSize = settings.textSizes.xAxisFontSize || settings.xAxisFontSize || 10;
            const minArcAngle = 0.035; // ~2 degrees

            // Compute label positions, then nudge overlapping ones
            const labelPositions = chords.groups.map((d: any) => {
                const a = (d.startAngle + d.endAngle) / 2;
                const r = radius + 8;
                const x = Math.cos(a - Math.PI / 2) * r;
                const y = Math.sin(a - Math.PI / 2) * r;
                const isLeft = x < 0;
                return { x, y, adjustedY: y, isLeft, angle: a, arcAngle: d.endAngle - d.startAngle };
            });

            // Sort by y position and nudge overlapping labels apart
            const minGap = fontSize * 1.3;
            const sorted = labelPositions.map((p, i) => ({ ...p, i })).sort((a, b) => a.y - b.y);
            for (let k = 1; k < sorted.length; k++) {
                const prev = sorted[k - 1];
                const curr = sorted[k];
                const gap = curr.adjustedY - prev.adjustedY;
                if (gap < minGap) {
                    const shift = (minGap - gap) / 2;
                    prev.adjustedY -= shift;
                    curr.adjustedY += shift;
                    labelPositions[prev.i].adjustedY = prev.adjustedY;
                    labelPositions[curr.i].adjustedY = curr.adjustedY;
                }
            }

            g.selectAll("text.label")
                .data(chords.groups)
                .join("text")
                .attr("class", "label")
                .attr("transform", (_d: any, i: number) => {
                    const p = labelPositions[i];
                    return "translate(" + Math.round(p.x) + "," + Math.round(p.adjustedY) + ")";
                })
                .attr("text-anchor", (_d: any, i: number) => labelPositions[i].isLeft ? "end" : "start")
                .attr("dominant-baseline", "central")
                .attr("font-size", fontSize + "px")
                .attr("fill", settings.xAxisColor || "#374151")
                .attr("opacity", (_d: any, i: number) => labelPositions[i].arcAngle >= minArcAngle ? 1 : 0)
                .text((d: any) => def.names[d.index]);

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
