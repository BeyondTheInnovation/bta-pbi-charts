"use strict";

import powerbi from "powerbi-visuals-api";
import { PDFDocument } from "pdf-lib";

import IVisualHost = powerbi.extensibility.visual.IVisualHost;

const MAX_CANVAS_SIDE = 2200;
const MAX_CANVAS_AREA = 3_600_000;
const DEFAULT_DESCRIPTION = "Chart snapshot";

export interface SvgSnapshotSource {
    svgElement: SVGSVGElement | null;
    viewportWidth: number;
    viewportHeight: number;
    scrollLeft?: number;
    scrollTop?: number;
}

export interface ExportSvgSnapshotToPdfOptions extends SvgSnapshotSource {
    host: IVisualHost;
    fileNamePrefix: string;
    fileDescription?: string;
}

export interface ExportCapability {
    allowed: boolean;
    status: powerbi.PrivilegeStatus;
    reason: string | null;
}

export async function getExportCapability(host: IVisualHost): Promise<ExportCapability> {
    const status = await host.downloadService.exportStatus();
    if (status === powerbi.PrivilegeStatus.Allowed) {
        return {
            allowed: true,
            status,
            reason: null
        };
    }

    return {
        allowed: false,
        status,
        reason: getExportDeniedReason(status)
    };
}

export async function exportSvgSnapshotToPdf(options: ExportSvgSnapshotToPdfOptions): Promise<void> {
    const capability = await getExportCapability(options.host);
    if (!capability.allowed) {
        throw new Error(capability.reason || "PDF export is unavailable in this environment.");
    }

    const pngBytes = await renderSvgToPng(options);
    const pdfBytes = await createPdfFromPng(pngBytes, options.viewportWidth, options.viewportHeight);
    const fileName = `${options.fileNamePrefix}-${formatTimestamp(new Date())}.pdf`;

    const result = await options.host.downloadService.exportVisualsContentExtended(
        uint8ArrayToBase64(pdfBytes),
        fileName,
        "pdf",
        options.fileDescription || DEFAULT_DESCRIPTION
    );

    if (!result.downloadCompleted) {
        throw new Error("Power BI did not complete the PDF download request.");
    }
}

function getExportDeniedReason(status: powerbi.PrivilegeStatus): string {
    switch (status) {
        case powerbi.PrivilegeStatus.NotDeclared:
            return "ExportContent privilege is not declared for this visual.";
        case powerbi.PrivilegeStatus.NotSupported:
            return "PDF export is not supported in this Power BI environment.";
        case powerbi.PrivilegeStatus.DisabledByAdmin:
            return "PDF export is disabled by your Power BI administrator.";
        default:
            return "PDF export is currently unavailable.";
    }
}

async function renderSvgToPng(options: SvgSnapshotSource): Promise<Uint8Array> {
    const svgElement = options.svgElement;
    if (!svgElement) {
        throw new Error("Cannot export because the SVG surface is unavailable.");
    }

    const viewportWidth = Math.max(1, Math.round(options.viewportWidth));
    const viewportHeight = Math.max(1, Math.round(options.viewportHeight));
    const viewLeft = Number.isFinite(options.scrollLeft) ? Math.max(0, Number(options.scrollLeft)) : 0;
    const viewTop = Number.isFinite(options.scrollTop) ? Math.max(0, Number(options.scrollTop)) : 0;

    const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svgClone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    svgClone.setAttribute("width", `${viewportWidth}`);
    svgClone.setAttribute("height", `${viewportHeight}`);
    svgClone.setAttribute("viewBox", `${viewLeft} ${viewTop} ${viewportWidth} ${viewportHeight}`);

    const serializer = new XMLSerializer();
    const svgMarkup = serializer.serializeToString(svgClone);
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);

    try {
        const image = await loadImage(objectUrl);
        const scale = computeCanvasScale(viewportWidth, viewportHeight);
        const canvasWidth = Math.max(1, Math.round(viewportWidth * scale));
        const canvasHeight = Math.max(1, Math.round(viewportHeight * scale));

        const canvas = document.createElement("canvas");
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Unable to create a canvas context for PDF export.");
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvasWidth, canvasHeight);
        context.drawImage(image, 0, 0, canvasWidth, canvasHeight);

        const dataUrl = canvas.toDataURL("image/png");
        return dataUrlToUint8Array(dataUrl);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function computeCanvasScale(width: number, height: number): number {
    const sideScale = Math.min(MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height, 2);
    const areaScale = Math.sqrt(MAX_CANVAS_AREA / (width * height));
    const finiteAreaScale = Number.isFinite(areaScale) ? areaScale : 1;
    const boundedScale = Math.min(sideScale, finiteAreaScale, 2);
    return Number.isFinite(boundedScale) && boundedScale > 0
        ? Math.max(0.1, boundedScale)
        : 1;
}

async function createPdfFromPng(pngBytes: Uint8Array, width: number, height: number): Promise<Uint8Array> {
    const pageWidth = Math.max(1, Math.round(width));
    const pageHeight = Math.max(1, Math.round(height));

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([pageWidth, pageHeight]);
    const image = await pdf.embedPng(pngBytes);

    page.drawImage(image, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight
    });

    return await pdf.save();
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to render SVG snapshot for PDF export."));
        image.src = url;
    });
}

function formatTimestamp(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const sec = String(date.getSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}-${hh}${min}${sec}`;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
    const marker = ",";
    const markerIndex = dataUrl.indexOf(marker);
    if (markerIndex === -1) {
        throw new Error("Invalid PNG data URL generated during export.");
    }

    const base64 = dataUrl.slice(markerIndex + marker.length);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}
