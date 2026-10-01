/**
 * Perceptual colormaps for saliency rendering.
 * Inferno / viridis use the 6th-order polynomial fits of the matplotlib maps;
 * jet is included because most Grad-CAM literature uses it, but it is not
 * perceptually uniform and is not the default.
 */
export type ColormapName = "inferno" | "viridis" | "jet" | "gray";

export const COLORMAPS: { id: ColormapName; label: string; note: string }[] = [
  { id: "inferno", label: "Inferno", note: "Perceptually uniform · CVD-safe" },
  { id: "viridis", label: "Viridis", note: "Perceptually uniform · CVD-safe" },
  { id: "jet", label: "Jet", note: "Literature convention · non-uniform" },
  { id: "gray", label: "Gray", note: "Linear luminance" },
];

type V3 = [number, number, number];
const poly = (c: V3[], t: number): V3 => {
  const out: V3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    let v = c[6][k];
    for (let i = 5; i >= 0; i--) v = v * t + c[i][k];
    out[k] = v;
  }
  return out;
};

const INFERNO: V3[] = [
  [0.0002189403691192265, 0.001651004631001012, -0.01948089843709184],
  [0.1065134194856116, 0.5639564367884091, 3.932712388889277],
  [11.60249308247187, -3.972853965665698, -15.9423941062914],
  [-41.70399613139459, 17.43639888205313, 44.35414519872813],
  [77.162935699427, -33.40235894210092, -81.80730925738993],
  [-71.31942824499214, 32.62606426397723, 73.20951985803202],
  [25.13112622477341, -12.24266895238567, -23.07032500287172],
];

const VIRIDIS: V3[] = [
  [0.2777273272234177, 0.005407344544966578, 0.3340998053353061],
  [0.1050930431085774, 1.404613529898575, 1.384590162594685],
  [-0.3308618287255563, 0.214847559468213, 0.09509516302823659],
  [-4.634230498983486, -5.799100973351585, -19.33244095627987],
  [6.228269936347081, 14.17993336680509, 56.69055260068105],
  [4.776384997670288, -13.74514537774601, -65.35303263337234],
  [-5.435455855934631, 4.645852612178535, 26.3124352495832],
];

const c01 = (v: number) => Math.min(1, Math.max(0, v));

function sample(name: ColormapName, t: number): V3 {
  switch (name) {
    case "inferno":
      return poly(INFERNO, t);
    case "viridis":
      return poly(VIRIDIS, t);
    case "jet":
      return [c01(1.5 - Math.abs(4 * t - 3)), c01(1.5 - Math.abs(4 * t - 2)), c01(1.5 - Math.abs(4 * t - 1))];
    default:
      return [t, t, t];
  }
}

const LUT_CACHE = new Map<ColormapName, Uint8ClampedArray>();

/** 256×RGB lookup table. */
export function colormapLUT(name: ColormapName): Uint8ClampedArray {
  const hit = LUT_CACHE.get(name);
  if (hit) return hit;
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = sample(name, i / 255);
    lut[i * 3] = c01(r) * 255;
    lut[i * 3 + 1] = c01(g) * 255;
    lut[i * 3 + 2] = c01(b) * 255;
  }
  LUT_CACHE.set(name, lut);
  return lut;
}

export function colormapCss(name: ColormapName, stops = 12) {
  const lut = colormapLUT(name);
  const parts: string[] = [];
  for (let i = 0; i <= stops; i++) {
    const k = Math.round((i / stops) * 255) * 3;
    parts.push(`rgb(${lut[k]},${lut[k + 1]},${lut[k + 2]}) ${((i / stops) * 100).toFixed(1)}%`);
  }
  return `linear-gradient(to right, ${parts.join(",")})`;
}

export function colorAt(name: ColormapName, t: number) {
  const lut = colormapLUT(name);
  const k = Math.round(c01(t) * 255) * 3;
  return `rgb(${lut[k]},${lut[k + 1]},${lut[k + 2]})`;
}
