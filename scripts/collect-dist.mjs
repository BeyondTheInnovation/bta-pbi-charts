#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const packagesDir = path.join(repoRoot, "packages");
const rootDistDir = path.join(repoRoot, "dist");

fs.mkdirSync(rootDistDir, { recursive: true });

// Clean existing root dist pbiviz files so users don't see stale versions.
for (const file of fs.readdirSync(rootDistDir)) {
    if (file.toLowerCase().endsWith(".pbiviz")) {
        fs.rmSync(path.join(rootDistDir, file), { force: true });
    }
}

const packageNames = fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

const prettyNames = {
    "bump-chart": "BTA-Bump-Chart.pbiviz",
    "calendar-heatmap": "BTA-Calendar-Heatmap.pbiviz",
    "heatmap": "BTA-Heatmap.pbiviz",
    "packed-bubble": "BTA-Packed-Bubble.pbiviz",
    "streamgraph": "BTA-Streamgraph.pbiviz",
    "donut-chart": "BTA-Donut-Chart.pbiviz",
    "bollinger-bands": "BTA-Bollinger-Bands.pbiviz",
    "inline-labels-line": "BTA-Inline-Labels-Line.pbiviz",
    "world-history-timeline": "BTA-World-History-Timeline.pbiviz"
};

let copied = 0;

for (const pkg of packageNames) {
    const pkgDist = path.join(packagesDir, pkg, "dist");
    if (!fs.existsSync(pkgDist)) continue;

    const files = fs.readdirSync(pkgDist)
        .filter(f => f.toLowerCase().endsWith(".pbiviz"))
        .map(f => ({ name: f, mtimeMs: fs.statSync(path.join(pkgDist, f)).mtimeMs }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (files.length === 0) continue;

    // Copy only the most recently created package per visual.
    const file = files[0].name;

    const src = path.join(pkgDist, file);
    const dstName = prettyNames[pkg] ?? file;
    const dst = path.join(rootDistDir, dstName);
    fs.copyFileSync(src, dst);
    copied++;
}

console.log(`collected ${copied} .pbiviz file(s) into dist/`);
