"use strict";

import powerbi from "powerbi-visuals-api";
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import { ITooltipSettings } from "./settings";

export interface TooltipMeta {
    title?: string;
    subtitle?: string;
    color?: string;
}

export interface TooltipRow {
    label: string;
    value: string;
    color?: string;
}

export interface TooltipContent {
    meta?: TooltipMeta;
    rows: TooltipRow[];
}

export function toTooltipRows(items: VisualTooltipDataItem[]): TooltipRow[] {
    return items.map(i => ({
        label: String(i.displayName ?? ""),
        value: String(i.value ?? ""),
        color: (i as any).color ? String((i as any).color) : undefined
    }));
}

export class HtmlTooltip {
    private root: HTMLElement;
    private el: HTMLDivElement;
    private settings: ITooltipSettings;
    private visible: boolean = false;

    constructor(root: HTMLElement, settings: ITooltipSettings, ownerId?: string) {
        this.root = root;
        this.settings = settings;

        const pos = (typeof window !== "undefined" && window.getComputedStyle)
            ? window.getComputedStyle(this.root).position
            : this.root.style.position;
        if (!pos || pos === "static") {
            this.root.style.position = "relative";
        }

        const existing = ownerId
            ? (this.root.querySelector(`div[data-bta-tooltip="true"][data-bta-tooltip-owner="${ownerId}"]`) as HTMLDivElement | null)
            : null;

        this.el = existing ?? document.createElement("div");
        this.el.setAttribute("data-bta-tooltip", "true");
        if (ownerId) {
            this.el.setAttribute("data-bta-tooltip-owner", ownerId);
        }
        this.el.style.position = "absolute";
        this.el.style.left = "0px";
        this.el.style.top = "0px";
        this.el.style.zIndex = "9999";
        this.el.style.pointerEvents = "none";
        this.el.style.opacity = "0";
        this.el.style.transform = "translate3d(0,0,0)";
        this.el.style.transition = "opacity 120ms ease";
        this.el.style.fontFamily = "\"Segoe UI\", -apple-system, BlinkMacSystemFont, \"Inter\", Roboto, \"Helvetica Neue\", Arial, sans-serif";
        this.el.style.fontSize = "12px";
        this.el.style.lineHeight = "1.2";

        this.applyTheme();
        if (!existing) {
            this.root.appendChild(this.el);
        }
    }

    public updateSettings(settings: ITooltipSettings): void {
        this.settings = settings;
        this.applyTheme();
    }

    public show(content: TooltipContent, clientX: number, clientY: number): void {
        this.visible = true;
        this.render(content);
        this.move(clientX, clientY);
        this.el.style.opacity = "1";
    }

    public move(clientX: number, clientY: number): void {
        if (!this.visible) return;

        const rootRect = this.root.getBoundingClientRect();
        const scrollLeft = this.root.scrollLeft || 0;
        const scrollTop = this.root.scrollTop || 0;
        const pad = 12;

        let x = clientX - rootRect.left + scrollLeft + pad;
        let y = clientY - rootRect.top + scrollTop + pad;

        // constrain inside root
        const maxW = Math.max(160, Math.min(560, this.settings.maxWidth || 320));
        this.el.style.maxWidth = `${maxW}px`;

        // force layout
        const ttRect = this.el.getBoundingClientRect();
        const w = ttRect.width;
        const h = ttRect.height;

        const right = scrollLeft + this.root.clientWidth;
        const bottom = scrollTop + this.root.clientHeight;

        if (x + w + 8 > right) {
            x = Math.max(scrollLeft + 8, clientX - rootRect.left + scrollLeft - w - pad);
        }
        if (y + h + 8 > bottom) {
            y = Math.max(scrollTop + 8, clientY - rootRect.top + scrollTop - h - pad);
        }

        this.el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    }

    public hide(): void {
        this.visible = false;
        this.el.style.opacity = "0";
    }

    public destroy(): void {
        this.el.remove();
    }

    private applyTheme(): void {
        const s = this.settings;

        // Allow theme defaults but always respect explicit colors.
        let background = s.backgroundColor;
        let border = s.borderColor;
        let text = s.textColor;

        if (s.theme === "dark") {
            background = background || "#111827";
            border = border || "#374151";
            text = text || "#f9fafb";
        } else {
            background = background || "#ffffff";
            border = border || "#e5e7eb";
            text = text || "#111827";
        }

        this.el.style.background = background;
        this.el.style.color = text;
        this.el.style.border = `1px solid ${border}`;
        this.el.style.borderRadius = `${Math.max(0, Math.min(24, s.borderRadius || 10))}px`;
        this.el.style.padding = "10px 10px";
        this.el.style.boxShadow = s.shadow ? "0 12px 28px rgba(0,0,0,0.18)" : "none";
        this.el.style.backdropFilter = "blur(0px)";
    }

    private render(content: TooltipContent): void {
        const { meta, rows } = content;
        const showRowSwatches = this.settings.showColorSwatch && rows.some(r => !!r.color);
        const showSwatch = this.settings.showColorSwatch && !!meta?.color && !showRowSwatches;

        this.el.replaceChildren();

        if (meta?.title || meta?.subtitle) {
            const header = document.createElement("div");
            header.style.display = "flex";
            header.style.gap = "8px";
            header.style.alignItems = meta?.subtitle ? "flex-start" : "center";
            header.style.marginBottom = rows.length ? "8px" : "0";

            if (showSwatch) {
                const swatch = document.createElement("div");
                swatch.style.width = "10px";
                swatch.style.height = "10px";
                swatch.style.borderRadius = "3px";
                swatch.style.marginTop = meta?.subtitle ? "3px" : "0";
                swatch.style.background = meta!.color!;
                swatch.style.border = "1px solid rgba(0,0,0,0.08)";
                header.appendChild(swatch);
            }

            const titles = document.createElement("div");
            titles.style.minWidth = "0";

            if (meta?.title) {
                const title = document.createElement("div");
                title.textContent = meta.title;
                title.style.fontWeight = "600";
                title.style.fontSize = "12px";
                title.style.whiteSpace = "nowrap";
                title.style.overflow = "hidden";
                title.style.textOverflow = "ellipsis";
                titles.appendChild(title);
            }
            if (meta?.subtitle) {
                const subtitle = document.createElement("div");
                subtitle.textContent = meta.subtitle;
                subtitle.style.opacity = "0.78";
                subtitle.style.fontSize = "11px";
                subtitle.style.marginTop = "2px";
                subtitle.style.whiteSpace = "nowrap";
                subtitle.style.overflow = "hidden";
                subtitle.style.textOverflow = "ellipsis";
                titles.appendChild(subtitle);
            }

            header.appendChild(titles);
            this.el.appendChild(header);
        }

        if (rows.length) {
            const table = document.createElement("div");
            table.style.display = "grid";
            table.style.gridTemplateColumns = showRowSwatches ? "auto 1fr auto" : "1fr auto";
            table.style.columnGap = "12px";
            table.style.rowGap = "6px";
            table.style.alignItems = "baseline";

            for (const r of rows) {
                if (showRowSwatches) {
                    const sw = document.createElement("div");
                    sw.style.width = "10px";
                    sw.style.height = "10px";
                    sw.style.borderRadius = "3px";
                    sw.style.marginTop = "1px";
                    sw.style.background = r.color ? r.color : "transparent";
                    sw.style.border = r.color ? "1px solid rgba(0,0,0,0.08)" : "1px solid transparent";
                    table.appendChild(sw);
                }

                const k = document.createElement("div");
                k.textContent = r.label;
                k.style.opacity = "0.78";
                k.style.fontSize = "11px";
                k.style.whiteSpace = "nowrap";
                k.style.overflow = "hidden";
                k.style.textOverflow = "ellipsis";

                const v = document.createElement("div");
                v.textContent = r.value;
                v.style.fontWeight = "600";
                v.style.fontSize = "11px";
                v.style.textAlign = "right";
                v.style.whiteSpace = "nowrap";

                table.appendChild(k);
                table.appendChild(v);
            }

            this.el.appendChild(table);
        }
    }
}
