#!/usr/bin/env node
/**
 * Deterministic sample dataset generator for Power BI visuals in this repo.
 *
 * Goals:
 * - Rich dimensions: Category/Subcategory, Region, Channel, Scenario
 * - Daily grain (good for calendar heatmap) with derived Month/Quarter fields
 * - Past vs future split around 2026-02-10 (good for dotted future line logic)
 * - Some gaps + zeros + occasional negative profit (edge cases)
 *
 * Usage:
 *   node scripts/generate-sample-data.mjs > sample-data.csv
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0xdecafbad);

const categories = [
  { name: "Automotive", subs: ["Parts", "Tools", "Care"] },
  { name: "Beauty", subs: ["Makeup", "Skincare", "Hair"] },
  { name: "Books", subs: ["Fiction", "Non-fiction", "Kids"] },
  { name: "Clothing", subs: ["Mens", "Womens", "Kids"] },
  { name: "Electronics", subs: ["Phones", "Laptops", "Audio"] },
  { name: "Food", subs: ["Produce", "Snacks", "Drinks"] },
  { name: "Home", subs: ["Kitchen", "Furniture", "Decor"] },
  { name: "Sports", subs: ["Gym", "Outdoor", "Team Sports"] }
];

const regions = ["East", "North", "South", "West"];
const channels = ["Online", "Retail"];

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISODate(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function monthLabel(d) {
  return `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function yearMonth(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function quarterLabel(d) {
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${q} ${d.getUTCFullYear()}`;
}

function dayOfYear(d) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((cur - start) / (24 * 3600 * 1000)) + 1;
}

function clampInt(n, min, max) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

const todayISO = "2026-02-10";

// CSV header: keep legacy columns while adding a couple of useful derived ones.
const header = [
  "Date",
  "Month",
  "YearMonth",
  "Quarter",
  "Year",
  "Category",
  "Subcategory",
  "Region",
  "Channel",
  "Scenario",
  "Value",
  "Units",
  "Profit"
];

process.stdout.write(header.join(",") + "\n");

// Daily data range: restrict to a single year (2026) to keep testing focused.
const start = new Date(Date.UTC(2026, 0, 1));
const end = new Date(Date.UTC(2026, 11, 31));

let dayIndex = 0;
for (let t = start.getTime(); t <= end.getTime(); t += 24 * 3600 * 1000, dayIndex++) {
  const d = new Date(t);
  const iso = toISODate(d);

  // Alternate channel by day to keep the dataset size reasonable but still cover both.
  const channel = channels[dayIndex % channels.length];
  const scenario = iso <= todayISO ? "Actual" : "Forecast";

  const mLabel = monthLabel(d);
  const ym = yearMonth(d);
  const q = quarterLabel(d);
  const year = d.getUTCFullYear();

  // Seasonality: smooth annual cycle + slight overall trend.
  const doy = dayOfYear(d);
  const season = Math.sin((2 * Math.PI * doy) / 365);
  const trend = (year - 2025) * 0.08 + (doy / 365) * 0.06;

  for (let cIdx = 0; cIdx < categories.length; cIdx++) {
    const cat = categories[cIdx];
    // Rotate subcategory per month to cover more subcategories across time without exploding rows.
    const sub = cat.subs[(d.getUTCMonth() + cIdx) % cat.subs.length];

    for (let rIdx = 0; rIdx < regions.length; rIdx++) {
      const region = regions[rIdx];

      // Deterministic small gaps: drop some weekend rows for specific (category, region) combos.
      const dayOfWeek = d.getUTCDay(); // 0 Sun .. 6 Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      if (isWeekend && ((cIdx + rIdx) % 5 === 0)) continue;

      const base =
        900 +
        cIdx * 120 +
        rIdx * 60 +
        (channel === "Online" ? 70 : -30);

      const noise = (rng() - 0.5) * 140;
      const valueRaw = base * (1 + 0.22 * season + trend) + noise;

      // Inject zeros for edge-case testing (delta, label formatting).
      const isZeroDay =
        d.getUTCDate() === 13 &&
        cat.name === "Beauty" &&
        region === "West" &&
        channel === "Retail";

      const value = isZeroDay ? 0 : clampInt(valueRaw, 0, 9000);

      // Units loosely tied to Value but varies by category.
      const avgPrice = 40 + cIdx * 6 + (channel === "Online" ? -2 : 3);
      const units = Math.max(
        0,
        clampInt(value / Math.max(10, avgPrice) + (rng() - 0.5) * 6, 0, 400)
      );

      // Profit: margin varies; sometimes negative in Forecast for specific combos.
      let margin = 0.18 + 0.02 * season - 0.01 * rIdx + (channel === "Online" ? 0.015 : -0.01);
      if (cat.name === "Electronics") margin -= 0.03; // tighter margins
      if (scenario === "Forecast" && cat.name === "Electronics" && region === "South") margin -= 0.25; // occasional losses

      const profit = clampInt(value * margin + (rng() - 0.5) * 80, -1200, 2500);

      const row = [
        iso,
        mLabel,
        ym,
        q,
        String(year),
        cat.name,
        sub,
        region,
        channel,
        scenario,
        String(value),
        String(units),
        String(profit)
      ];

      process.stdout.write(row.join(",") + "\n");
    }
  }
}
