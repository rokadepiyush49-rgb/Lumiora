/**
 * Pseudo-spectral band extraction.
 *
 * Decomposes an RGB image into nine 8-bit optical bands using the same
 * conventions as OpenCV's cvtColor on uint8 input, so values here match what
 * the Python pipeline (cv2.COLOR_RGB2HSV / cv2.COLOR_RGB2LAB) produces:
 *   HSV: H ∈ [0,179] (degrees / 2), S,V ∈ [0,255]
 *   LAB: L = L*·255/100, a = a*+128, b = b*+128 (D65 white point)
 */
import type { BandChannel, BandId, BandSet, BandStats } from "../types";

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const Xn = 0.950456;
const Zn = 1.088754;
const labF = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

export function rgbToHsv8(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : (d / max) * 255;
  return [Math.round(h / 2) % 180, Math.round(s), max];
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = SRGB_TO_LINEAR[r];
  const G = SRGB_TO_LINEAR[g];
  const B = SRGB_TO_LINEAR[b];
  const X = (0.412453 * R + 0.35758 * G + 0.180423 * B) / Xn;
  const Y = 0.212671 * R + 0.71516 * G + 0.072169 * B;
  const Z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / Zn;
  const fY = labF(Y);
  const L = Y > 0.008856 ? 116 * fY - 16 : 903.3 * Y;
  return [L, 500 * (labF(X) - fY), 200 * (fY - labF(Z))];
}

/** OpenCV 8-bit LAB encoding. */
export function rgbToLab8(r: number, g: number, b: number): [number, number, number] {
  const [L, a, bb] = rgbToLab(r, g, b);
  return [
    Math.round((L * 255) / 100),
    Math.max(0, Math.min(255, Math.round(a + 128))),
    Math.max(0, Math.min(255, Math.round(bb + 128))),
  ];
}

export function computeStats(data: Uint8ClampedArray): BandStats {
  const histogram = new Array<number>(256).fill(0);
  let sum = 0;
  let sumSq = 0;
  let min = 255;
  let max = 0;
  const n = data.length;
  for (let i = 0; i < n; i++) {
    const v = data[i];
    histogram[v]++;
    sum += v;
    sumSq += v * v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  let acc = 0;
  let median = 0;
  for (let i = 0; i < 256; i++) {
    acc += histogram[i];
    if (acc >= n / 2) {
      median = i;
      break;
    }
  }
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (!histogram[i]) continue;
    const p = histogram[i] / n;
    entropy -= p * Math.log2(p);
  }
  return { mean, std: Math.sqrt(variance), variance, min, max, median, entropy, histogram };
}

export interface BandExtraction {
  bands: BandSet;
  ms: number;
}

export function extractBands(img: ImageData): BandExtraction {
  const t0 = performance.now();
  const { width, height, data } = img;
  const n = width * height;
  const out: Record<BandId, Uint8ClampedArray> = {
    R: new Uint8ClampedArray(n),
    G: new Uint8ClampedArray(n),
    B: new Uint8ClampedArray(n),
    H: new Uint8ClampedArray(n),
    S: new Uint8ClampedArray(n),
    V: new Uint8ClampedArray(n),
    L: new Uint8ClampedArray(n),
    A: new Uint8ClampedArray(n),
    Bb: new Uint8ClampedArray(n),
  };
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    out.R[i] = r;
    out.G[i] = g;
    out.B[i] = b;
    const [h, s, v] = rgbToHsv8(r, g, b);
    out.H[i] = h;
    out.S[i] = s;
    out.V[i] = v;
    const [L, A, Bb] = rgbToLab8(r, g, b);
    out.L[i] = L;
    out.A[i] = A;
    out.Bb[i] = Bb;
  }
  const bands = {} as BandSet;
  (Object.keys(out) as BandId[]).forEach((id) => {
    const channel: BandChannel = { id, width, height, data: out[id], stats: computeStats(out[id]) };
    bands[id] = channel;
  });
  return { bands, ms: performance.now() - t0 };
}

/** Pearson correlation between two bands (optionally subsampled). */
export function bandCorrelation(a: Uint8ClampedArray, b: Uint8ClampedArray, step = 3) {
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let i = 0; i < a.length; i += step) {
    const x = a[i];
    const y = b[i];
    sa += x;
    sb += y;
    saa += x * x;
    sbb += y * y;
    sab += x * y;
    n++;
  }
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2;
  const vb = sbb / n - (sb / n) ** 2;
  if (va <= 0 || vb <= 0) return 0;
  return cov / Math.sqrt(va * vb);
}

/** Render an 8-bit band as a grayscale canvas. */
export function bandToCanvas(ch: BandChannel, stretch = false): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = ch.width;
  c.height = ch.height;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(ch.width, ch.height);
  const lo = stretch ? ch.stats.min : 0;
  const span = stretch ? Math.max(1, ch.stats.max - ch.stats.min) : 255;
  for (let i = 0, p = 0; i < ch.data.length; i++, p += 4) {
    const v = stretch ? ((ch.data[i] - lo) * 255) / span : ch.data[i];
    img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
