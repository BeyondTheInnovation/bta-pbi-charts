"use strict";

import { d3, BaseRenderer, RenderContext, ChartData, formatMeasureValue } from "@pbi-visuals/shared";
import { IVisualSettings } from "./settings";
import { IChartData, IBoxPoint } from "./ChartTransformer";

export class ChartRenderer extends BaseRenderer<IVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: ChartData, settings: IVisualSettings): void {
        this.settings = settings;
        const chartData = data as IChartData;

        if (!chartData.boxes.length) {
            this.renderNoData();
            return;
        }

        const groups = chartData.groups.length ? chartData.groups : ["All"];
        const legendFontSize = settings.textSizes?.legendFontSize || settings.legendFontSize || 11;
        const legendReservation = settings.showLegend
            ? this.getLegendReservation({
                isOrdinal: true,
                categories: chartData.xValues,
                legendFontSize,
                availableWidth: this.context.width,
                availableHeight: this.context.height
            })
            : { top: 0, right: 0, bottom: 0, left: 0 };

        const baseMin = chartData.minValue;
        const baseMax = chartData.maxValue;
        let valueSpan = baseMax - baseMin;
        if (!Number.isFinite(valueSpan) || valueSpan <= 0) {
            valueSpan = Math.max(1, Math.abs(baseMax || baseMin || 1) * 0.1);
        }
        const domainPad = valueSpan * 0.06;
        const yDomainMin = baseMin - domainPad;
        const yDomainMax = baseMax + domainPad;

        const axisTickValues = [0, 0.5, 1].map((f) => yDomainMin + (yDomainMax - yDomainMin) * f);
        const axisTickLabels = axisTickValues.map((v) => formatMeasureValue(v, chartData.valueFormatString));
        const maxAxisLabelChars = axisTickLabels.reduce((m, label) => Math.max(m, label.length), 0);
        const estimatedAxisLabelWidth = Math.max(44, Math.min(130, maxAxisLabelChars * 7 + 10));

        const margin = {
            top: 24 + legendReservation.top,
            right: 16 + legendReservation.right,
            bottom: 40 + legendReservation.bottom,
            left: 10 + estimatedAxisLabelWidth + legendReservation.left
        };
        const panelGap = groups.length > 1 ? Math.max(18, settings.smallMultiples.spacing) : 0;
        const width = Math.max(120, this.context.width - margin.left - margin.right);
        const height = Math.max(120, this.context.height - margin.top - margin.bottom - panelGap * (groups.length - 1));
        const panelHeight = height / groups.length;

        const y = d3.scaleLinear()
            .domain([yDomainMin, yDomainMax])
            .range([panelHeight, 0]);

        const colorScale = this.getCategoryColors(chartData.xValues);
        const hasOnlySingletonBuckets = chartData.boxes.every((b) => b.count <= 1);

        if (hasOnlySingletonBuckets) {
            this.context.container.append("text")
                .attr("class", "chart-hint")
                .attr("x", margin.left)
                .attr("y", Math.max(14, margin.top - 8))
                .attr("font-size", "11px")
                .attr("fill", "#6b7280")
                .text("Values are aggregated (1 point per bucket). Set Values to Don't summarize for full box distributions.");
        }

        groups.forEach((groupName, groupIndex) => {
            const panelY = margin.top + groupIndex * (panelHeight + panelGap);
            const panel = this.context.container.append("g")
                .attr("class", "panel")
                .attr("transform", "translate(" + margin.left + "," + Math.round(panelY) + ")");

            const boxes = chartData.boxes.filter((b) => b.group === groupName);
            const xDomain = boxes.map((b) => b.category);
            const x = d3.scalePoint<string>().domain(xDomain).range([0, width]).padding(0.5);
            const step = xDomain.length > 1 ? Math.max(16, width / xDomain.length * 0.5) : Math.min(48, width * 0.5);
            const half = step / 2;

            panel.selectAll("line.grid")
                .data([0, 0.25, 0.5, 0.75, 1].map((f) => yDomainMin + (yDomainMax - yDomainMin) * f))
                .join("line")
                .attr("x1", 0)
                .attr("x2", width)
                .attr("y1", (d) => Math.round(y(d)))
                .attr("y2", (d) => Math.round(y(d)))
                .attr("stroke", this.getGridStroke("#e5e7eb"))
                .attr("stroke-width", 1)
                .attr("opacity", 0.65);

            const marks = panel.selectAll("g.mark")
                .data(boxes)
                .join("g")
                .attr("class", "mark")
                .attr("transform", (d) => "translate(" + Math.round(x(d.category) ?? 0) + ",0)");

            marks.each((d: IBoxPoint, i, nodes) => {
                const node = d3.select(nodes[i]);
                const color = colorScale(d.category);
                const yMin = Math.round(y(d.min));
                const yMax = Math.round(y(d.max));
                const yQ1 = Math.round(y(d.q1));
                const yQ3 = Math.round(y(d.q3));
                const yMedian = Math.round(y(d.median));

                node.append("line")
                    .attr("x1", 0)
                    .attr("x2", 0)
                    .attr("y1", yMin)
                    .attr("y2", yMax)
                    .attr("stroke", "#4b5563")
                    .attr("stroke-width", 1.25);

                const boxTop = Math.min(yQ3, yQ1);
                const boxHeight = Math.max(4, Math.abs(yQ1 - yQ3));
                node.append("rect")
                    .attr("x", -half)
                    .attr("y", boxTop)
                    .attr("width", step)
                    .attr("height", boxHeight)
                    .attr("fill", color)
                    .attr("fill-opacity", 0.55)
                    .attr("stroke", color)
                    .attr("stroke-width", 1.5)
                    .attr("rx", 3);

                node.append("line")
                    .attr("x1", -half)
                    .attr("x2", half)
                    .attr("y1", yMedian)
                    .attr("y2", yMedian)
                    .attr("stroke", "#111827")
                    .attr("stroke-width", 2);

                node.append("line")
                    .attr("x1", -half * 0.65)
                    .attr("x2", half * 0.65)
                    .attr("y1", yMin)
                    .attr("y2", yMin)
                    .attr("stroke", "#4b5563")
                    .attr("stroke-width", 1.25);

                node.append("line")
                    .attr("x1", -half * 0.65)
                    .attr("x2", half * 0.65)
                    .attr("y1", yMax)
                    .attr("y2", yMax)
                    .attr("stroke", "#4b5563")
                    .attr("stroke-width", 1.25);

                node.selectAll("circle.outlier")
                    .data(d.outliers)
                    .join("circle")
                    .attr("class", "outlier")
                    .attr("cx", 0)
                    .attr("cy", (v) => Math.round(y(v)))
                    .attr("r", 2.5)
                    .attr("fill", color)
                    .attr("stroke", "#111827")
                    .attr("stroke-width", 0.8);

                const hitHalf = Math.max(10, half);
                const hitTop = Math.min(yMin, yMax, yMedian);
                const hitBottom = Math.max(yMin, yMax, yMedian);
                const rawHitHeight = Math.max(1, hitBottom - hitTop);
                const hitHeight = Math.max(16, rawHitHeight);
                const hitY = rawHitHeight >= hitHeight
                    ? hitTop
                    : Math.round((hitTop + hitBottom) / 2 - hitHeight / 2);

                this.addTooltip(node.append("rect")
                    .attr("x", -hitHalf)
                    .attr("y", hitY)
                    .attr("width", hitHalf * 2)
                    .attr("height", hitHeight)
                    .attr("fill", "transparent") as any,
                [
                    { displayName: chartData.valueDisplayName || "Value", value: formatMeasureValue(d.median, chartData.valueFormatString), color },
                    { displayName: "Q1", value: formatMeasureValue(d.q1, chartData.valueFormatString) },
                    { displayName: "Q3", value: formatMeasureValue(d.q3, chartData.valueFormatString) },
                    { displayName: "Min", value: formatMeasureValue(d.min, chartData.valueFormatString) },
                    { displayName: "Max", value: formatMeasureValue(d.max, chartData.valueFormatString) },
                    { displayName: "Count", value: String(d.count) }
                ], {
                    title: d.category,
                    subtitle: groupName !== "All" ? groupName : undefined,
                    color
                });
            });

            if (settings.showYAxis) {
                panel.selectAll("text.y-label")
                    .data([0, 0.5, 1])
                    .join("text")
                    .attr("x", -8)
                    .attr("y", (f) => Math.round(y(yDomainMin + (yDomainMax - yDomainMin) * f)) + 4)
                    .attr("text-anchor", "end")
                    .attr("font-size", (settings.textSizes.yAxisFontSize || settings.yAxisFontSize) + "px")
                    .attr("fill", settings.yAxisColor)
                    .text((f) => formatMeasureValue(yDomainMin + (yDomainMax - yDomainMin) * f, chartData.valueFormatString));
            }

            if (settings.showXAxis) {
                panel.selectAll("text.x-label")
                    .data(xDomain)
                    .join("text")
                    .attr("x", (d) => Math.round(x(d) ?? 0))
                    .attr("y", Math.round(panelHeight + 14))
                    .attr("text-anchor", "middle")
                    .attr("font-size", (settings.textSizes.xAxisFontSize || settings.xAxisFontSize) + "px")
                    .attr("fill", settings.xAxisColor)
                    .text((d) => d);
            }

            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All") {
                panel.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", 8)
                    .attr("font-size", (settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize) + "px")
                    .text(groupName);
            }

            if (groups.length > 1 && groupIndex < groups.length - 1 && panelGap > 0) {
                const separatorY = Math.round(panelY + panelHeight + panelGap * 0.5);
                this.context.container.append("line")
                    .attr("class", "panel-separator")
                    .attr("x1", margin.left)
                    .attr("x2", margin.left + width)
                    .attr("y1", separatorY)
                    .attr("y2", separatorY)
                    .attr("stroke", "#6b7280")
                    .attr("stroke-width", 1.5)
                    .attr("opacity", 0.9);
            }
        });

        if (settings.showLegend) {
            this.renderLegend(colorScale, chartData.maxValue, true, chartData.xValues, undefined, undefined, {
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
