"use strict";

import { d3, BaseRenderer, RenderContext, formatLabel, formatMeasureValue } from "@pbi-visuals/shared";
import { IBubbleVisualSettings } from "./settings";
import { BubbleData, BubbleNode } from "./BubbleTransformer";

interface SimulationNode extends BubbleNode {
    x: number;
    y: number;
    vx?: number;
    vy?: number;
}

export class BubbleRenderer extends BaseRenderer<IBubbleVisualSettings> {
    constructor(context: RenderContext) {
        super(context);
    }

    public render(data: any, settings: IBubbleVisualSettings): void {
        this.settings = settings;
        const bubbleData = data as BubbleData;

        if (!bubbleData.nodes || bubbleData.nodes.length === 0) {
            this.renderNoData();
            return;
        }

        const { nodes, categories, legendItems, groups, maxValue, minValue } = bubbleData;

        const legendCategories = bubbleData.hasLegendRoleData ? legendItems : [];
        const legendReserve = this.getLegendReservation({ isOrdinal: true, categories: legendCategories });

        const titleSpacing = settings.smallMultiples.titleSpacing || 25;
        const panelTitleFontSize = this.getEffectiveFontSize(
            settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize,
            6,
            40
        );
        const hasPanelTitles = Boolean(settings.smallMultiples.showTitle && groups.length > 1 && groups.some(g => g !== "All" && g !== "(Blank)"));
        const titleReserve = hasPanelTitles ? Math.round(titleSpacing + panelTitleFontSize + 8) : 0;
        const interPanelGap = groups.length > 1
            ? (hasPanelTitles ? Math.max(settings.smallMultiples.spacing, titleReserve) : settings.smallMultiples.spacing)
            : 0;

        const margin = {
            top: 12 + legendReserve.top + titleReserve,
            right: 12 + legendReserve.right,
            bottom: 12 + legendReserve.bottom,
            left: 12 + legendReserve.left
        };

        const chartWidth = this.context.width - margin.left - margin.right;
        const groupCount = groups.length;
        const totalSpacing = (groupCount - 1) * interPanelGap;
        const availableHeight = this.context.height - margin.top - margin.bottom - totalSpacing;

        // Color scale for legend groups. If no legend role is bound, keep a single crisp color (native-like).
        const colorScale = bubbleData.hasLegendRoleData
            ? this.getCategoryColors(legendItems, bubbleData.categoryColorMap)
            : null;
        const fallbackColor = this.getCategoryColor(0);
        const bubbleStroke = this.isHighContrastMode() ? this.getThemeForeground("#111827") : "#ffffff";

        // Radius scale based on values
        const radiusScale = d3.scaleSqrt()
            .domain([minValue, maxValue])
            .range([settings.bubble.minBubbleSize, settings.bubble.maxBubbleSize]);

        let currentY = margin.top;

        groups.forEach((groupName) => {
            const groupNodes = nodes
                .filter(n => n.groupValue === groupName)
                .map(n => ({
                    ...n,
                    radius: radiusScale(n.value),
                    x: chartWidth / 2,
                    y: availableHeight / groupCount / 2
                })) as SimulationNode[];

            const groupHeight = availableHeight / groupCount;
            const centerX = chartWidth / 2;
            const centerY = groupHeight / 2;

            const panelGroup = this.context.container.append("g")
                .attr("class", "bubble-panel")
                .attr("transform", `translate(${Math.round(margin.left)}, ${Math.round(currentY)})`);

            // Group title with configurable spacing
            if (settings.smallMultiples.showTitle && groups.length > 1 && groupName !== "All" && groupName !== "(Blank)") {
                const titleSpacing = settings.smallMultiples.titleSpacing || 25;
                const titleFontSize = this.getEffectiveFontSize(
                    settings.textSizes.panelTitleFontSize || settings.smallMultiples.titleFontSize,
                    6, 40
                );
                const displayTitle = formatLabel(groupName, chartWidth, titleFontSize);
                const title = panelGroup.append("text")
                    .attr("class", "panel-title")
                    .attr("x", 0)
                    .attr("y", -Math.round(titleSpacing))
                    .attr("font-size", `${titleFontSize}px`)
                    .attr("font-weight", "600")
                    .attr("fill", this.getTitleTextColor("#333"))
                    .text(displayTitle);

                if (displayTitle !== groupName) {
                    this.addTooltip(title as any, [{ displayName: "Group", value: groupName }]);
                }
            }

            // Calculate cluster centers if clustering is enabled
            const clusterCenters = new Map<string, { x: number; y: number }>();
            if (settings.bubble.clusterByCategory) {
                const uniqueCategories = [...new Set(groupNodes.map(n => n.category))];
                const angleStep = (2 * Math.PI) / uniqueCategories.length;
                const clusterRadius = Math.min(chartWidth, groupHeight) * 0.25;

                uniqueCategories.forEach((cat, i) => {
                    const angle = i * angleStep - Math.PI / 2;
                    clusterCenters.set(cat, {
                        x: centerX + Math.cos(angle) * clusterRadius,
                        y: centerY + Math.sin(angle) * clusterRadius
                    });
                });
            }

            // Create force simulation
            const simulation = d3.forceSimulation<SimulationNode>(groupNodes)
                .force("charge", d3.forceManyBody().strength(5))
                .force("center", d3.forceCenter(centerX, centerY))
                .force("collision", d3.forceCollide<SimulationNode>().radius(d => d.radius + 2).strength(0.9));

            // Add clustering force if enabled
            if (settings.bubble.clusterByCategory && clusterCenters.size > 1) {
                simulation.force("cluster", (alpha: number) => {
                    groupNodes.forEach(node => {
                        const center = clusterCenters.get(node.category);
                        if (center) {
                            node.vx = (node.vx || 0) + (center.x - node.x) * alpha * 0.3;
                            node.vy = (node.vy || 0) + (center.y - node.y) * alpha * 0.3;
                        }
                    });
                });
            }

            // Add boundary force to keep bubbles within the panel
            simulation.force("boundary", () => {
                groupNodes.forEach(node => {
                    const padding = node.radius + 5;
                    node.x = Math.max(padding, Math.min(chartWidth - padding, node.x));
                    node.y = Math.max(padding, Math.min(groupHeight - padding, node.y));
                });
            });

            // Run simulation synchronously
            simulation.stop();
            const maxTicks = Math.min(220, Math.max(80, Math.round(groupNodes.length * 1.8)));
            for (let iterations = 0; iterations < maxTicks; iterations++) {
                simulation.tick();
            }

            // SVG rendering
            const bubbles = panelGroup.selectAll(".bubble")
                .data(groupNodes)
                .enter()
                .append("circle")
                .attr("class", "bubble")
                .attr("data-selection-key", d => d.category)
                .attr("cx", d => this.snapToPixelInt(d.x))
                .attr("cy", d => this.snapToPixelInt(d.y))
                .attr("r", d => d.radius)
                .attr("fill", d => (colorScale ? colorScale(d.legendKey) : fallbackColor))
                .attr("stroke", bubbleStroke)
                .attr("stroke-width", 2)
                .attr("opacity", this.isHighContrastMode() ? 1 : 0.85);

            // Add tooltips
            bubbles.each((d, i, nodes) => {
                const bubble = d3.select(nodes[i]);
                const bubbleColor = colorScale ? colorScale(d.legendKey) : fallbackColor;
                this.addTooltip(bubble as any, [
                    { displayName: "Value", value: formatMeasureValue(d.value, bubbleData.valueFormatString), color: bubbleColor }
                ], {
                    title: d.category,
                    subtitle: (groupName !== "All" && groupName !== "(Blank)") ? groupName : undefined,
                    color: bubbleColor
                });
            });

            // Draw labels inside bubbles (if enabled and bubble is large enough)
            if (settings.bubble.showLabels) {
                // Helper function to get font size based on settings
                const getFontSize = (radius: number): number => {
                    if (settings.bubble.labelSizeMode === "fixed") {
                        return Math.round(settings.bubble.labelFontSize);
                    }
                    // Auto mode - scale with bubble size
                    const computed = radius / 3;
                    return Math.max(
                        settings.bubble.minLabelFontSize,
                        Math.min(settings.bubble.maxLabelFontSize, computed)
                    );
                };

                panelGroup.selectAll(".bubble-label")
                    .data(groupNodes.filter(d => d.radius >= 20))
                    .enter()
                    .append("text")
                    .attr("class", "bubble-label")
                    .attr("x", d => Math.round(d.x))
                    .attr("y", d => Math.round(d.y))
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "middle")
                    .attr("font-size", d => getFontSize(d.radius) + "px")
                    .attr("font-weight", "600")
                    .attr("fill", d => this.getContrastColor(colorScale ? colorScale(d.legendKey) : fallbackColor))
                    .attr("pointer-events", "none")
                    .text(d => this.truncateLabel(d.category, d.radius, getFontSize(d.radius)));
            }

            currentY += groupHeight + interPanelGap;
        });

        // Categorical legend - use same color scale with overrides
        if (bubbleData.hasLegendRoleData) {
            const legendColorScale = this.getCategoryColors(legendItems, bubbleData.categoryColorMap);
            this.renderLegend(legendColorScale, maxValue, true, legendItems, undefined, undefined, {
                alignFrame: {
                    x: margin.left,
                    y: margin.top,
                    width: chartWidth,
                    height: Math.max(0, this.context.height - margin.top - margin.bottom)
                }
            });
        }
    }

    private truncateLabel(text: string, radius: number, fontSize: number = 12): string {
        // Truncate based on measured width so it works across fonts and locales
        const maxWidth = Math.max(0, radius * 1.8);
        return formatLabel(text, maxWidth, fontSize);
    }
}
