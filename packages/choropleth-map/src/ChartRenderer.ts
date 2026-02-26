"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, formatMeasureValue } from "@pbi-visuals/shared";
import { IVisualSettings } from "./settings";
import { IChartData } from "./ChartTransformer";

declare const require: any;
const topojson = require("topojson-client");
const d3Geo = require("d3-geo");
const worldAtlas = require("world-atlas/countries-110m.json");
const countryNames = require("./data/country-names.json") as Array<{ id: string; name: string }>;

function normalizeLocation(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const idToName = new Map<string, string>();
const normalizedNameToId = new Map<string, string>();
countryNames.forEach((entry) => {
    idToName.set(String(entry.id), entry.name);
    normalizedNameToId.set(normalizeLocation(entry.name), String(entry.id));
});

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
        const width = Math.max(260, this.context.width - margin.left - margin.right);
        const height = Math.max(160, this.context.height - margin.top - margin.bottom - panelGap * (groups.length - 1));
        const panelHeight = height / groups.length;

        const features = topojson.feature(worldAtlas, worldAtlas.objects.countries).features;

        groups.forEach((groupName, groupIndex) => {
            const panelY = margin.top + groupIndex * (panelHeight + panelGap);
            const panel = this.context.container.append("g")
                .attr("class", "panel")
                .attr("transform", "translate(" + margin.left + "," + Math.round(panelY) + ")");

            const valueMap = chartData.valuesByGroup.get(groupName) ?? new Map<string, number>();

            const projectedValues = new Map<string, number>();
            valueMap.forEach((value, normLocation) => {
                const id = normalizedNameToId.get(normLocation) ?? normLocation;
                projectedValues.set(String(id), value);
            });

            const values = Array.from(projectedValues.values());
            const min = values.length ? Math.min(...values) : 0;
            const max = values.length ? Math.max(...values) : 1;
            const colorScale = this.getColorScale(min, max || min + 1);

            const projection = d3Geo.geoNaturalEarth1();
            projection.fitSize([width, panelHeight], { type: "FeatureCollection", features });
            const path = d3Geo.geoPath(projection);

            panel.selectAll("path.mark")
                .data(features)
                .join("path")
                .attr("class", "mark")
                .attr("d", path)
                .attr("fill", (f: any) => {
                    const id = String(f.id);
                    const v = projectedValues.get(id);
                    return Number.isFinite(v) ? colorScale(v) : "#e5e7eb";
                })
                .attr("stroke", "#9ca3af")
                .attr("stroke-width", 0.4)
                .each((f: any, i: number, nodes: any[]) => {
                    const id = String(f.id);
                    const value = projectedValues.get(id);
                    const country = idToName.get(id) || "Unknown";
                    const fill = Number.isFinite(value) ? colorScale(value as number) : "#e5e7eb";

                    this.addTooltip(d3.select(nodes[i]) as any, [
                        { displayName: "Location", value: country, color: fill },
                        { displayName: "Value", value: Number.isFinite(value) ? formatMeasureValue(value as number, chartData.valueFormatString) : "(No Data)" }
                    ], {
                        title: country,
                        subtitle: groupName !== "All" ? groupName : undefined,
                        color: fill
                    });
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
    }
}
