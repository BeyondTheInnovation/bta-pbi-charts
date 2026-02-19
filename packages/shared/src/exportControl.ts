"use strict";

import powerbi from "powerbi-visuals-api";
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import {
    ExportSvgSnapshotToPdfOptions,
    SvgSnapshotSource,
    exportSvgSnapshotToPdf,
    getExportCapability
} from "./pdfExport";

export interface ExportControlOptions {
    host: IVisualHost;
    root: HTMLElement;
    fileNamePrefix: string;
}

export interface ExportControl {
    setSnapshotSource(source: SvgSnapshotSource): void;
    setHasData(hasData: boolean): void;
    refreshCapability(force?: boolean): Promise<void>;
    destroy(): void;
}

const WRAPPER_STYLE = [
    "position:absolute",
    "top:0",
    "left:0",
    "z-index:70",
    "pointer-events:auto"
].join(";");

const BUTTON_STYLE = [
    "appearance:none",
    "border:1px solid rgba(15,23,42,0.22)",
    "background:rgba(255,255,255,0.98)",
    "color:#0f172a",
    "border-radius:3px",
    "padding:0",
    "width:18px",
    "height:18px",
    "font-size:0",
    "line-height:1",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "box-shadow:0 1px 1px rgba(15,23,42,0.06)",
    "cursor:pointer"
].join(";");

const PDF_ICON_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M20 13v-2.343c0-.818 0-1.226-.152-1.594c-.152-.367-.441-.657-1.02-1.235l-4.736-4.736c-.499-.499-.748-.748-1.058-.896a2 2 0 0 0-.197-.082C12.514 2 12.161 2 11.456 2c-3.245 0-4.868 0-5.967.886a4 4 0 0 0-.603.603C4 4.59 4 6.211 4 9.456V13m9-10.5V3c0 2.828 0 4.243.879 5.121C14.757 9 16.172 9 19 9h.5m.25 7h-2.5a1 1 0 0 0-1 1v2m0 0v3m0-3h3m-15 3v-2.5m0 0V16H6a1.75 1.75 0 1 1 0 3.5zm6-3.5h1.5a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1.5z\"/></svg>";

class VisualExportControl implements ExportControl {
    private readonly host: IVisualHost;
    private readonly root: HTMLElement;
    private readonly fileNamePrefix: string;
    private readonly wrapper: HTMLDivElement;
    private readonly button: HTMLButtonElement;

    private snapshotSource: SvgSnapshotSource | null = null;
    private hasData: boolean = false;
    private busy: boolean = false;
    private destroyed: boolean = false;
    private lastKnownStatus: powerbi.PrivilegeStatus | null = null;
    private lastKnownReason: string | null = null;
    private refreshPromise: Promise<void> | null = null;
    private readonly onClick: (event: MouseEvent) => void;
    private readonly onRootScroll: () => void;

    constructor(options: ExportControlOptions) {
        this.host = options.host;
        this.root = options.root;
        this.fileNamePrefix = options.fileNamePrefix;

        if (!this.root.style.position) {
            this.root.style.position = "relative";
        }

        this.wrapper = document.createElement("div");
        this.wrapper.setAttribute("style", WRAPPER_STYLE);
        this.wrapper.className = "bta-export-control";

        this.button = document.createElement("button");
        this.button.type = "button";
        this.button.innerHTML = PDF_ICON_SVG;
        this.button.setAttribute("style", BUTTON_STYLE);
        this.button.setAttribute("aria-label", "Download PDF");
        this.button.disabled = true;
        this.button.title = "Checking export availability...";

        this.onClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            void this.handleExportClick();
        };

        this.onRootScroll = () => {
            this.syncPinnedPosition();
        };

        this.button.addEventListener("click", this.onClick);
        this.root.addEventListener("scroll", this.onRootScroll, { passive: true });
        this.wrapper.appendChild(this.button);
        this.root.appendChild(this.wrapper);
        this.syncPinnedPosition();
    }

    public setSnapshotSource(source: SvgSnapshotSource): void {
        this.snapshotSource = source;
        this.syncPinnedPosition();
        this.updateUi();
    }

    public setHasData(hasData: boolean): void {
        this.hasData = hasData;
        this.updateUi();
    }

    public async refreshCapability(force: boolean = false): Promise<void> {
        if (this.destroyed) {
            return;
        }

        if (!force && this.lastKnownStatus !== null) {
            this.updateUi();
            return;
        }

        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        this.button.disabled = true;
        this.button.title = "Checking export availability...";

        this.refreshPromise = getExportCapability(this.host)
            .then((capability) => {
                this.lastKnownStatus = capability.status;
                this.lastKnownReason = capability.reason;
            })
            .catch((error) => {
                this.lastKnownStatus = powerbi.PrivilegeStatus.NotSupported;
                this.lastKnownReason = error instanceof Error
                    ? error.message
                    : "PDF export is unavailable.";
            })
            .finally(() => {
                this.refreshPromise = null;
                this.updateUi();
            });

        return this.refreshPromise;
    }

    public destroy(): void {
        this.destroyed = true;
        this.button.removeEventListener("click", this.onClick);
        this.root.removeEventListener("scroll", this.onRootScroll);
        this.wrapper.remove();
    }

    private async handleExportClick(): Promise<void> {
        if (this.destroyed || this.busy) {
            return;
        }

        if (this.lastKnownStatus === null) {
            await this.refreshCapability(true);
        }

        if (!this.isExportAllowed()) {
            this.updateUi();
            return;
        }

        if (!this.hasData || !this.snapshotSource || !this.snapshotSource.svgElement) {
            this.updateUi();
            return;
        }

        this.busy = true;
        this.updateUi();

        try {
            const payload: ExportSvgSnapshotToPdfOptions = {
                host: this.host,
                fileNamePrefix: this.fileNamePrefix,
                svgElement: this.snapshotSource.svgElement,
                viewportWidth: this.snapshotSource.viewportWidth,
                viewportHeight: this.snapshotSource.viewportHeight,
                scrollLeft: this.snapshotSource.scrollLeft,
                scrollTop: this.snapshotSource.scrollTop
            };

            await exportSvgSnapshotToPdf(payload);
            this.button.title = "PDF downloaded.";
        } catch (error) {
            this.button.title = error instanceof Error
                ? error.message
                : "PDF export failed.";
        } finally {
            this.busy = false;
            this.updateUi();
        }
    }

    private isExportAllowed(): boolean {
        return this.lastKnownStatus === powerbi.PrivilegeStatus.Allowed;
    }

    private updateUi(): void {
        if (this.destroyed) {
            return;
        }

        if (this.busy) {
            this.button.disabled = true;
            this.button.title = "Preparing PDF export...";
            return;
        }

        if (this.lastKnownStatus === null) {
            this.button.disabled = true;
            this.button.title = "Checking export availability...";
            return;
        }

        if (!this.isExportAllowed()) {
            this.button.disabled = true;
            this.button.title = this.lastKnownReason || "PDF export is unavailable.";
            return;
        }

        if (!this.hasData || !this.snapshotSource || !this.snapshotSource.svgElement) {
            this.button.disabled = true;
            this.button.title = "No chart data to export.";
            return;
        }

        this.button.disabled = false;
        this.button.title = "Download the current chart as a PDF file.";
    }

    private syncPinnedPosition(): void {
        const scrollLeft = this.root.scrollLeft || 0;
        const scrollTop = this.root.scrollTop || 0;
        const wrapperWidth = this.wrapper.offsetWidth || 18;
        const left = scrollLeft + Math.max(0, this.root.clientWidth - wrapperWidth - 1);
        this.wrapper.style.left = `${left}px`;
        this.wrapper.style.top = `${scrollTop}px`;
    }
}

export function createExportControl(options: ExportControlOptions): ExportControl {
    return new VisualExportControl(options);
}
