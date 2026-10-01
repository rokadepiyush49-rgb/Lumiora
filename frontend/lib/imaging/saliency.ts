/**
 * Saliency rendering + the demo-mode surrogate.
 *
 * In CONNECTED mode, Grad-CAM values come from the backend (real gradients of
 * the sigmoid output w.r.t. the chosen conv layer). In DEMO mode we cannot run
 * the network, so `simulateGradCam` builds a stand-in from a hematoxylin-
 * density proxy. It is labelled "simulated" everywhere it is shown and must
 * never be presented as a model explanation.
 */
import type { BandSet, GradCamResult, TileGrid, TissueClass } from "../types";
import { blurField, normalizeField } from "./spatial";
import { colormapLUT, type ColormapName } from "./colormap";
import { rng, sigmoid } from "../utils";

/** Per-pixel hematoxylin (nuclear) likelihood from LAB bands, 0–1. */
function nuclearScore(L8: number, b8: number, S8: number) {
  const dark = Math.min(1, Math.max(0, (175 - L8) / 70));
  const blue = Math.min(1, Math.max(0, (134 - b8) / 22));
  const stained = S8 > 20 ? 1 : 0;
  return dark * blue * stained;
}

export function nuclearDensity(bands: BandSet, cell: number) {
  const { width: w, height: h } = bands.L;
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  const grid = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let s = 0, n = 0;
      for (let y = gy * cell; y < Math.min(h, (gy + 1) * cell); y++) {
        for (let x = gx * cell; x < Math.min(w, (gx + 1) * cell); x++) {
          const i = y * w + x;
          s += nuclearScore(bands.L.data[i], bands.Bb.data[i], bands.S.data[i]);
          n++;
        }
      }
      grid[gy * gw + gx] = n ? s / n : 0;
    }
  }
  return { grid, gw, gh };
}

export const GRADCAM_LAYERS = [
  { id: "out_relu", shape: [3, 3, 1280] as [number, number, number], note: "Final activation · most class-specific, coarsest" },
  { id: "block_13_expand_relu", shape: [6, 6, 576] as [number, number, number], note: "Stage-5 expansion · balance of detail and semantics" },
  { id: "block_6_expand_relu", shape: [12, 12, 192] as [number, number, number], note: "Stage-3 expansion · fine, but weakly class-specific" },
] as const;
export type GradCamLayer = (typeof GRADCAM_LAYERS)[number]["id"];

/** Surrogate saliency smoothed to mimic the spatial resolution of a given layer. */
function surrogateField(grid: Float32Array, gw: number, gh: number, layer: GradCamLayer) {
  const div = layer === "out_relu" ? 28 : layer === "block_13_expand_relu" ? 52 : 96;
  const smooth = blurField(grid, gw, gh, Math.max(1, Math.round(gw / div)), 3);
  const crowd = smooth.map((v) => Math.pow(v, layer === "out_relu" ? 1.6 : 1.3));
  return { values: normalizeField(crowd, 0.992) };
}

export function simulateGradCam(bands: BandSet, layer: GradCamLayer, target: TissueClass): GradCamResult {
  const { width: w, height: h } = bands.L;
  const cell = Math.max(4, Math.round(Math.max(w, h) / 96));
  const { grid, gw, gh } = nuclearDensity(bands, cell);
  let { values } = surrogateField(grid, gw, gh, layer);
  // For the benign target, saliency concentrates on low-density, organised regions.
  if (target === "benign") values = normalizeField(values.map((v) => Math.max(0, 0.75 - Math.abs(v - 0.35) * 1.6)), 0.99);
  const shape = GRADCAM_LAYERS.find((l) => l.id === layer)!.shape;
  return { values, width: gw, height: gh, layer, featureMap: shape, target };
}

export interface SimulatedInference {
  probability: number;
  gradcam: GradCamResult;
  tiles: TileGrid;
}

/**
 * Heuristic stand-in for the model. `fixedProbability` pins the image-level
 * output for the curated demo specimens so the demo narrative is stable.
 */
export function simulateInference(
  bands: BandSet,
  displayWidth: number,
  displayHeight: number,
  opts: { seed: number; fixedProbability?: number },
): SimulatedInference {
  const { width: w, height: h } = bands.L;
  const cell = Math.max(4, Math.round(Math.max(w, h) / 96));
  const { grid, gw, gh } = nuclearDensity(bands, cell);

  const { values } = surrogateField(grid, gw, gh, "out_relu");

  // Tile grid in display-image pixel space (model input is 96 px).
  const tileSize = 96;
  let stride = 96;
  while (Math.ceil(displayWidth / stride) * Math.ceil(displayHeight / stride) > 2400) stride *= 2;
  const cols = Math.ceil(displayWidth / stride);
  const rows = Math.ceil(displayHeight / stride);
  const rand = rng(opts.seed ^ 0x9e3779b9);
  const probabilities: number[] = [];
  const fx = w / displayWidth;
  const fy = h / displayHeight;
  const tileDensities: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * stride * fx / cell), x1 = Math.max(x0 + 1, Math.floor(Math.min(displayWidth, c * stride + tileSize) * fx / cell));
      const y0 = Math.floor(r * stride * fy / cell), y1 = Math.max(y0 + 1, Math.floor(Math.min(displayHeight, r * stride + tileSize) * fy / cell));
      let s = 0, n = 0, tissue = 0;
      for (let y = y0; y < Math.min(gh, y1); y++) {
        for (let x = x0; x < Math.min(gw, x1); x++) {
          const v = grid[y * gw + x];
          s += v; n++;
          const i = Math.min(h - 1, y * cell) * w + Math.min(w - 1, x * cell);
          if (bands.S.data[i] > 22 || bands.V.data[i] < 205) tissue++;
        }
      }
      if (!n || tissue / n < 0.25) {
        probabilities.push(NaN);
        continue;
      }
      const d = s / n;
      tileDensities.push(d);
      // Bounded away from 0/1: a surrogate should never look certain.
      const p = 0.02 + 0.96 * sigmoid(10 * (d - 0.2) + (rand() - 0.5) * 0.9);
      probabilities.push(p);
    }
  }

  let probability = opts.fixedProbability ?? NaN;
  if (Number.isNaN(probability)) {
    const valid = probabilities.filter((p) => !Number.isNaN(p)).sort((a, b) => b - a);
    const top = valid.slice(0, Math.max(1, Math.ceil(valid.length * 0.15)));
    const topMean = top.reduce((a, b) => a + b, 0) / top.length;
    probability = Math.min(0.97, Math.max(0.03, topMean * 0.94 + 0.02));
  }

  const target: TissueClass = probability >= 0.5 ? "cancerous" : "benign";
  return {
    probability,
    gradcam: { values, width: gw, height: gh, layer: "out_relu", featureMap: [3, 3, 1280], target },
    tiles: { tileSize, stride, cols, rows, probabilities },
  };
}

/** Colormap a [0,1] field into a canvas. "alpha" mode fades low activations. */
export function renderField(
  values: Float32Array,
  w: number,
  h: number,
  cmap: ColormapName,
  mode: "alpha" | "opaque" = "alpha",
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const lut = colormapLUT(cmap);
  for (let i = 0, p = 0; i < values.length; i++, p += 4) {
    const v = Math.min(1, Math.max(0, values[i]));
    const k = Math.round(v * 255) * 3;
    img.data[p] = lut[k];
    img.data[p + 1] = lut[k + 1];
    img.data[p + 2] = lut[k + 2];
    img.data[p + 3] = mode === "opaque" ? 255 : Math.round(255 * Math.min(1, Math.pow(v, 0.85) * 1.15));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Decode a grayscale PNG heatmap (backend format) into a [0,1] field. */
export async function decodeHeatmapPng(src: string): Promise<{ values: Float32Array; width: number; height: number }> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const values = new Float32Array(c.width * c.height);
  for (let i = 0; i < values.length; i++) values[i] = d[i * 4] / 255;
  return { values, width: c.width, height: c.height };
}
