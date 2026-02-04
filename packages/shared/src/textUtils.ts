"use strict";

/**
 * Text measurement and label rotation utilities
 */

export type RotateMode = "auto" | "always" | "never";

export interface LabelRotationConfig {
    mode: RotateMode;
    labels: string[];
    availableWidth: number;
    fontSize: number;
    rotationAngle?: number;  // Default: 45 degrees
}

export interface LabelRotationResult {
    shouldRotate: boolean;
    skipInterval: number;
}

// Cache for text measurements to avoid repeated DOM operations
const textWidthCache = new Map<string, number>();

/**
 * Measure text width using canvas context (faster than SVG)
 * Falls back to character estimation if canvas is unavailable
 */
export function measureTextWidth(text: string, fontSize: number, fontFamily: string = "sans-serif"): number {
    // Multi-line labels: use the widest line.
    if (text.includes("\n")) {
        return Math.max(...text.split("\n").map(line => measureTextWidth(line, fontSize, fontFamily)));
    }

    const cacheKey = `${text}|${fontSize}|${fontFamily}`;

    if (textWidthCache.has(cacheKey)) {
        return textWidthCache.get(cacheKey)!;
    }

    let width: number;

    // Try canvas-based measurement (most accurate and fastest)
    if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.font = `${fontSize}px ${fontFamily}`;
            width = ctx.measureText(text).width;
            textWidthCache.set(cacheKey, width);
            return width;
        }
    }

    // Fallback: estimate based on character count and font size
    // Average character width is approximately 0.6 * fontSize for sans-serif
    width = text.length * fontSize * 0.6;
    textWidthCache.set(cacheKey, width);
    return width;
}

/**
 * Measure the width of multiple labels and return the maximum
 */
export function measureMaxLabelWidth(labels: string[], fontSize: number, fontFamily?: string): number {
    if (labels.length === 0) return 0;
    return Math.max(...labels.map(label => measureTextWidth(label, fontSize, fontFamily)));
}

/**
 * Calculate if rotation is needed and what skip interval to use based on actual collision detection
 */
export function calculateLabelRotation(config: LabelRotationConfig): LabelRotationResult {
    const { mode, labels, availableWidth, fontSize, rotationAngle = 45 } = config;

    // Handle edge cases
    if (labels.length === 0) {
        return { shouldRotate: false, skipInterval: 1 };
    }

    if (labels.length === 1) {
        return { shouldRotate: mode === "always", skipInterval: 1 };
    }

    if (availableWidth <= 0 || fontSize <= 0) {
        return { shouldRotate: mode === "always", skipInterval: 1 };
    }

    const padding = 4; // Minimum padding between labels
    const maxWidth = measureMaxLabelWidth(labels, fontSize);
    const angleRad = (rotationAngle * Math.PI) / 180;
    const rotatedWidth = maxWidth * Math.cos(angleRad) + fontSize * Math.sin(angleRad);

    const visibleLabelCount = (total: number, skip: number): number => {
        if (total <= 0) return 0;
        if (skip <= 1) return total;
        const base = Math.ceil(total / skip); // indices 0, skip, 2*skip, ...
        return ((total - 1) % skip === 0) ? base : base + 1; // always include last label
    };

    const findMinSkipThatFits = (effectiveLabelWidth: number): number => {
        for (let skip = 1; skip <= labels.length; skip++) {
            const count = visibleLabelCount(labels.length, skip);
            const spacePerLabel = availableWidth / Math.max(1, count);
            if ((effectiveLabelWidth + padding) <= spacePerLabel) {
                return skip;
            }
        }
        return labels.length;
    };

    const skipNoRotate = findMinSkipThatFits(maxWidth);
    const skipRotate = findMinSkipThatFits(rotatedWidth);

    // Always mode - always rotate (but still skip if needed to avoid overlap)
    if (mode === "always") {
        return { shouldRotate: true, skipInterval: skipRotate };
    }

    // Never mode - never rotate, but may need to skip labels
    if (mode === "never") {
        return { shouldRotate: false, skipInterval: skipNoRotate };
    }

    // Auto mode - choose rotation vs skipping jointly:
    // - Prefer showing more labels (smaller skip)
    // - Prefer no rotation when skip is equal
    if (skipNoRotate === 1) {
        return { shouldRotate: false, skipInterval: 1 };
    }
    if (skipRotate === 1) {
        return { shouldRotate: true, skipInterval: 1 };
    }
    if (skipRotate < skipNoRotate) {
        return { shouldRotate: true, skipInterval: skipRotate };
    }
    return { shouldRotate: false, skipInterval: skipNoRotate };
}

/**
 * Clear the text measurement cache
 * Call this if you need to free memory or if font settings change significantly
 */
export function clearTextWidthCache(): void {
    textWidthCache.clear();
}

/**
 * Format a label for display, truncating if necessary
 */
export function formatLabel(text: string, maxWidth: number, fontSize: number): string {
    if (text.includes("\n")) {
        return text
            .split("\n")
            .map(line => formatLabel(line, maxWidth, fontSize))
            .join("\n");
    }

    const currentWidth = measureTextWidth(text, fontSize);

    if (currentWidth <= maxWidth) {
        return text;
    }

    // Binary search for optimal truncation length
    let low = 0;
    let high = text.length;
    const ellipsis = "...";
    const ellipsisWidth = measureTextWidth(ellipsis, fontSize);

    while (low < high) {
        const mid = Math.floor((low + high + 1) / 2);
        const truncated = text.substring(0, mid);
        const truncatedWidth = measureTextWidth(truncated, fontSize) + ellipsisWidth;

        if (truncatedWidth <= maxWidth) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    if (low === 0) {
        return ellipsis;
    }

    return text.substring(0, low) + ellipsis;
}
