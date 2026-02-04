#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const visuals = ["bump-chart", "heatmap", "calendar-heatmap", "packed-bubble", "streamgraph", "donut-chart"];

function readPngSize(buffer) {
    if (buffer.length < 24) {
        return null;
    }
    const signature = buffer.subarray(0, 8);
    const expected = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    if (!signature.equals(expected)) {
        return null;
    }

    // IHDR starts at byte 8: length(4) + type(4) + data(13)...
    const type = buffer.subarray(12, 16).toString("ascii");
    if (type !== "IHDR") {
        return null;
    }

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
}

let ok = true;

for (const v of visuals) {
    const svgPath = path.join(repoRoot, "packages", v, "assets", "icon.svg");
    const pngPath = path.join(repoRoot, "packages", v, "assets", "icon.png");

    const svg = readFileSync(svgPath, "utf8");
    const resvg = new Resvg(svg, {
        fitTo: { mode: "width", value: 20 }
    });
    const png = resvg.render().asPng();

    const size = readPngSize(png);
    if (!size || size.width !== 20 || size.height !== 20) {
        console.error(`icon render failed for ${v}: expected 20x20, got ${size ? `${size.width}x${size.height}` : "unknown"}`);
        ok = false;
        continue;
    }

    writeFileSync(pngPath, png);
    console.log(`wrote ${path.relative(repoRoot, pngPath)}`);
}

process.exit(ok ? 0 : 1);
