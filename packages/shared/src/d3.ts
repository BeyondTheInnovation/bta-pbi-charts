"use strict";

/**
 * Selective D3 re-exports.
 *
 * Instead of `import * as d3 from "d3"` (which bundles 30+ subpackages),
 * we re-export only the functions and types actually used across the visuals.
 * This cuts ~60-80 KB from each visual bundle by eliminating d3-geo,
 * d3-hierarchy, d3-dsv, d3-zoom, d3-brush, d3-transition, and many others.
 */

// d3-selection
export {
    select,
    selectAll,
    pointer,
    type Selection,
} from "d3-selection";

// d3-scale
export {
    scaleLinear,
    scaleOrdinal,
    scalePoint,
    scaleSequential,
    scaleSqrt,
    type ScaleOrdinal,
    type ScaleSequential,
} from "d3-scale";

// d3-shape
export {
    arc,
    area,
    line,
    pie,
    stack,
    stackOffsetWiggle,
    stackOrderInsideOut,
    curveBasis,
    curveLinear,
    curveMonotoneX,
    type PieArcDatum,
    type SeriesPoint,
} from "d3-shape";

// d3-interpolate
export { interpolate } from "d3-interpolate";

// d3-array
export { sum } from "d3-array";

// d3-scale-chromatic
export { schemeCategory10 } from "d3-scale-chromatic";

// d3-force
export {
    forceCenter,
    forceCollide,
    forceManyBody,
    forceSimulation,
    forceY,
} from "d3-force";

// d3-color (transitive dep of d3-interpolate / d3-scale, but occasionally
// used indirectly via the colour parsing path)
export { color } from "d3-color";
