/**
 * Spatial feature maps: Sobel gradient magnitude, tissue mask, and tissue
 * boundary contours (marching squares). All computed on the analysis-resolution
 * working image.
 */
import type { BandChannel } from "../types";
import { computeStats } from "./bands";

export function sobel(ch: BandChannel): { edges: BandChannel; ms: number } {
  const t0 = performance.now();
  const { width: w, height: h, data } = ch;
  const mag = new Float32Array(w * h);
  let max = 1;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = data[i - w - 1], t = data[i - w], tr = data[i - w + 1];
      const l = data[i - 1], r = data[i + 1];
      const bl = data[i + w - 1], b = data[i + w], br = data[i + w + 1];
      const gx = -tl - 2 * l - bl + tr + 2 * r + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      const m = Math.sqrt(gx * gx + gy * gy);
      mag[i] = m;
      if (m > max) max = m;
    }
  }
  // Normalise against the 99th percentile so a few strong edges don't wash out the map.
  const sorted = Float32Array.from(mag.filter((_, i) => i % 7 === 0)).sort();
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || max;
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < mag.length; i++) out[i] = Math.min(255, (mag[i] / p99) * 255);
  return {
    edges: { id: "L", width: w, height: h, data: out, stats: computeStats(out) },
    ms: performance.now() - t0,
  };
}

/** Coarse tissue-occupancy grid: 1 where stained tissue, 0 where glass/background. */
export function tissueGrid(sat: BandChannel, val: BandChannel, cell: number) {
  const gw = Math.ceil(sat.width / cell);
  const gh = Math.ceil(sat.height / cell);
  const grid = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let tissue = 0;
      let n = 0;
      for (let y = gy * cell; y < Math.min(sat.height, (gy + 1) * cell); y += 2) {
        for (let x = gx * cell; x < Math.min(sat.width, (gx + 1) * cell); x += 2) {
          const i = y * sat.width + x;
          if (sat.data[i] > 28 || val.data[i] < 200) tissue++;
          n++;
        }
      }
      grid[gy * gw + gx] = n ? tissue / n : 0;
    }
  }
  return { grid, gw, gh, cell };
}

/**
 * Marching squares over a scalar grid at a given iso level. Returns an SVG
 * path of independent segments in the grid's source pixel coordinates.
 */
export function contourPath(grid: Float32Array, gw: number, gh: number, cell: number, iso = 0.5, scale = 1) {
  const parts: string[] = [];
  const v = (x: number, y: number) => grid[Math.min(gh - 1, y) * gw + Math.min(gw - 1, x)];
  const interp = (a: number, b: number) => (a === b ? 0.5 : (iso - a) / (b - a));
  for (let y = 0; y < gh - 1; y++) {
    for (let x = 0; x < gw - 1; x++) {
      const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1);
      const code = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const cx = (x + 0.5) * cell * scale;
      const cy = (y + 0.5) * cell * scale;
      const s = cell * scale;
      const top: [number, number] = [cx + interp(a, b) * s, cy];
      const right: [number, number] = [cx + s, cy + interp(b, c) * s];
      const bottom: [number, number] = [cx + interp(d, c) * s, cy + s];
      const left: [number, number] = [cx, cy + interp(a, d) * s];
      const seg = (p: [number, number], q: [number, number]) =>
        parts.push(`M${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}`);
      switch (code) {
        case 1: case 14: seg(left, bottom); break;
        case 2: case 13: seg(bottom, right); break;
        case 3: case 12: seg(left, right); break;
        case 4: case 11: seg(top, right); break;
        case 5: seg(left, top); seg(bottom, right); break;
        case 6: case 9: seg(top, bottom); break;
        case 7: case 8: seg(left, top); break;
        case 10: seg(top, right); seg(left, bottom); break;
      }
    }
  }
  return parts.join("");
}

/** Separable box blur, repeated to approximate a Gaussian. */
export function blurField(src: Float32Array, w: number, h: number, radius: number, passes = 3) {
  const a = Float32Array.from(src);
  const b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k;
          if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; }
        }
        b[y * w + x] = s / n;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k;
          if (yy >= 0 && yy < h) { s += b[yy * w + x]; n++; }
        }
        a[y * w + x] = s / n;
      }
    }
  }
  return a;
}

export function normalizeField(f: Float32Array, pct = 0.995) {
  const sorted = Float32Array.from(f).sort();
  const hi = sorted[Math.floor((sorted.length - 1) * pct)] || 1;
  const lo = sorted[0];
  const out = new Float32Array(f.length);
  const span = Math.max(1e-6, hi - lo);
  for (let i = 0; i < f.length; i++) out[i] = Math.min(1, Math.max(0, (f[i] - lo) / span));
  return out;
}
