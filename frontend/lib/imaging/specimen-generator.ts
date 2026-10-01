/**
 * Procedural H&E-like tissue renderer for demo specimens.
 *
 * Produces SYNTHETIC images that imitate hematoxylin (purple nuclei) and eosin
 * (pink stroma/cytoplasm) staining so the interface can be exercised without
 * bundling patient data. These are not real histology and are labelled
 * "synthetic" wherever they appear.
 *
 *   benign → lobular acini with basal nuclei, lumens, adipocytes, sparse stroma
 *   idc    → crowded pleomorphic nuclear nests, cribriform spaces, desmoplasia
 *   mixed  → both, in separate regions
 */
import { rng } from "../utils";

export type SpecimenKind = "benign" | "idc" | "mixed";

export interface GenerateOptions {
  width: number;
  height: number;
  seed: number;
  kind: SpecimenKind;
  /** Pixel scale of structures (1 = ~40× look at 1400 px wide). */
  scale?: number;
  /** Stain variability −1…1 (hue drift between "labs"). */
  stainShift?: number;
}

const TAU = Math.PI * 2;

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(seed: number) {
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(seed: number, octaves = 4) {
  const n = valueNoise(seed);
  return (x: number, y: number) => {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      s += amp * n(x * f, y * f);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / norm;
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

interface Blob {
  x: number;
  y: number;
  r: number;
  pts: [number, number][];
}

function makeBlob(cx: number, cy: number, r0: number, rand: () => number, lobes = 28): Blob {
  const n = valueNoise(Math.floor(rand() * 1e6));
  const off = rand() * 10;
  const pts: [number, number][] = [];
  for (let i = 0; i < lobes; i++) {
    const t = (i / lobes) * TAU;
    const rr = r0 * (0.62 + 0.62 * n(Math.cos(t) * 1.6 + off, Math.sin(t) * 1.6 + off));
    pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr * 0.85]);
  }
  return { x: cx, y: cy, r: r0, pts };
}

function pointInPoly(x: number, y: number, pts: [number, number][]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function tracePoly(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  const m = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = m(pts[pts.length - 1], pts[0]);
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const mid = m(p, q);
    ctx.quadraticCurveTo(p[0], p[1], mid[0], mid[1]);
  }
  ctx.closePath();
}

export function generateSpecimen(opts: GenerateOptions): HTMLCanvasElement {
  const { width: W, height: H, seed, kind } = opts;
  const s = opts.scale ?? 1;
  const shift = opts.stainShift ?? 0;
  const rand = rng(seed);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const eosH = 334 + shift * 8;
  const hemH = 266 + shift * 10;
  const area = (W * H) / (s * s);

  // 1 ── slide glass
  ctx.fillStyle = `hsl(${eosH + 10}, 22%, 95%)`;
  ctx.fillRect(0, 0, W, H);

  // 2 ── tissue occupancy + eosin stroma (low-res field, smoothly upscaled)
  const tissueN = fbm(seed + 11, 5);
  const toneN = fbm(seed + 23, 4);
  const freq = 0.0019 / s;
  const thr = kind === "idc" ? 0.3 : kind === "mixed" ? 0.34 : 0.37;
  const lw = Math.ceil(W / 5), lh = Math.ceil(H / 5);
  const field = document.createElement("canvas");
  field.width = lw;
  field.height = lh;
  const fctx = field.getContext("2d")!;
  const fimg = fctx.createImageData(lw, lh);
  const mask = new Float32Array(lw * lh);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const px = x * 5, py = y * 5;
      const t = tissueN(px * freq, py * freq);
      const a = Math.min(1, Math.max(0, (t - thr) / 0.07));
      mask[y * lw + x] = a;
      const tone = toneN(px * freq * 3, py * freq * 3);
      const [r, g, b] = hslToRgb(eosH + (tone - 0.5) * 14, 42 + tone * 20, 84 - tone * 12);
      const i = (y * lw + x) * 4;
      fimg.data[i] = r;
      fimg.data[i + 1] = g;
      fimg.data[i + 2] = b;
      fimg.data[i + 3] = a * 255;
    }
  }
  fctx.putImageData(fimg, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(field, 0, 0, W, H);
  const inTissue = (x: number, y: number) => {
    const xi = Math.min(lw - 1, Math.max(0, Math.floor(x / 5)));
    const yi = Math.min(lh - 1, Math.max(0, Math.floor(y / 5)));
    return mask[yi * lw + xi];
  };

  // 3 ── collagen fibres following a flow field, with pale clefts between bundles
  const flow = fbm(seed + 37, 3);
  const flowAngle = (x: number, y: number) => flow(x * 0.0035 / s, y * 0.0035 / s) * TAU * 2;
  const stroke = (count: number, style: () => string, width: () => number, steps: () => number, stepLen: number, minTissue: number) => {
    for (let i = 0; i < count; i++) {
      let x = rand() * W, y = rand() * H;
      if (inTissue(x, y) < minTissue) continue;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const n = steps();
      for (let k = 0; k < n; k++) {
        const a = flowAngle(x, y) + (rand() - 0.5) * 0.5;
        x += Math.cos(a) * stepLen * s;
        y += Math.sin(a) * stepLen * s;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = style();
      ctx.lineWidth = width();
      ctx.stroke();
    }
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const dense = kind === "idc" ? 1.25 : 1;
  stroke(Math.round((area / 240) * dense), () => `hsla(${eosH + (rand() - 0.5) * 12}, ${46 + rand() * 16}%, ${58 + rand() * 16}%, ${0.1 + rand() * 0.2})`, () => (0.35 + rand() * 1.1) * s, () => 5 + Math.floor(rand() * 9), 5.5, 0.4);
  stroke(Math.round(area / 1300), () => `hsla(${eosH + 12}, 30%, ${91 + rand() * 4}%, ${0.35 + rand() * 0.35})`, () => (0.6 + rand() * 1.8) * s, () => 4 + Math.floor(rand() * 10), 6, 0.55);
  stroke(Math.round(area / 900), () => `hsla(${eosH - 4}, 55%, ${50 + rand() * 8}%, ${0.12 + rand() * 0.14})`, () => (1.2 + rand() * 2.2) * s, () => 3 + Math.floor(rand() * 5), 7, 0.6);

  const nucleus = (x: number, y: number, rx: number, ry: number, rot: number, h: number, sat: number, l: number, alpha = 0.86, detail = true) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    ctx.fillStyle = `hsla(${h}, ${sat}%, ${l}%, ${alpha})`;
    ctx.fill();
    ctx.lineWidth = 0.55 * s;
    ctx.strokeStyle = `hsla(${h}, ${sat + 4}%, ${Math.max(8, l - 9)}%, ${alpha * 0.4})`;
    ctx.stroke();
    if (detail && rx > 2.2 * s) {
      const granules = 3 + Math.floor(rand() * (rx / s));
      for (let k = 0; k < granules; k++) {
        const a = rand() * TAU, d = Math.sqrt(rand()) * Math.min(rx, ry) * 0.75;
        const dark = rand() < 0.6;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, (0.45 + rand() * 0.75) * s, 0, TAU);
        ctx.fillStyle = dark ? `hsla(${h + 6}, ${sat + 6}%, ${Math.max(10, l - 12 - rand() * 8)}%, 0.5)` : `hsla(${h - 8}, ${Math.max(10, sat - 12)}%, ${l + 14}%, 0.32)`;
        ctx.fill();
      }
    }
  };

  // 4 ── adipocytes (benign / mixed)
  if (kind !== "idc") {
    const clusters = kind === "benign" ? 2 : 1;
    for (let c = 0; c < clusters; c++) {
      const cx = rand() * W, cy = rand() * H, R = (120 + rand() * 140) * s;
      const cells = Math.round((R * R) / (900 * s * s));
      for (let i = 0; i < cells; i++) {
        const a = rand() * TAU, d = Math.sqrt(rand()) * R;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        const r = (16 + rand() * 20) * s;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * (0.8 + rand() * 0.3), rand() * TAU, 0, TAU);
        ctx.fillStyle = `hsl(${eosH + 10}, 20%, 95%)`;
        ctx.fill();
        ctx.lineWidth = 1.1 * s;
        ctx.strokeStyle = `hsla(${eosH}, 40%, 70%, 0.9)`;
        ctx.stroke();
      }
    }
  }

  // 5 ── benign lobules: acini with basal nuclei and myoepithelial rim
  const drawGland = (cx: number, cy: number, R: number) => {
    const asp = 0.7 + rand() * 0.3, rot = rand() * Math.PI;
    const inner = R * (0.5 + rand() * 0.15);
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * asp, rot, 0, TAU);
    ctx.fillStyle = `hsl(${eosH - 10}, 30%, ${73 + rand() * 4}%)`;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy, inner, inner * asp, rot, 0, TAU);
    ctx.fillStyle = `hsl(${eosH + 10}, 24%, 94%)`;
    ctx.fill();
    if (rand() < 0.5) {
      ctx.beginPath();
      ctx.ellipse(cx + (rand() - 0.5) * inner * 0.4, cy, inner * 0.5, inner * 0.35 * asp, rot, 0, TAU);
      ctx.fillStyle = `hsla(${eosH}, 45%, 82%, 0.6)`;
      ctx.fill();
    }
    const ring = (inner + R) / 2;
    const count = Math.floor((TAU * ring) / (6.4 * s));
    for (let i = 0; i < count; i++) {
      const t = (i / count) * TAU + (rand() - 0.5) * 0.06;
      const rr = inner + (R - inner) * (0.45 + rand() * 0.3);
      const lx = Math.cos(t) * rr, ly = Math.sin(t) * rr * asp;
      const x = cx + lx * Math.cos(rot) - ly * Math.sin(rot);
      const y = cy + lx * Math.sin(rot) + ly * Math.cos(rot);
      nucleus(x, y, (2.4 + rand() * 0.8) * s, (3.8 + rand() * 1.4) * s, t + rot, hemH + (rand() - 0.5) * 8, 26 + rand() * 8, 36 + rand() * 7);
    }
    const myo = Math.floor(count * 0.45);
    for (let i = 0; i < myo; i++) {
      const t = rand() * TAU;
      const lx = Math.cos(t) * R * 0.97, ly = Math.sin(t) * R * 0.97 * asp;
      const x = cx + lx * Math.cos(rot) - ly * Math.sin(rot);
      const y = cy + lx * Math.sin(rot) + ly * Math.cos(rot);
      nucleus(x, y, 3.6 * s, 1.4 * s, t + rot + Math.PI / 2, hemH, 30, 28, 0.85, false);
    }
  };

  const glandsIn = (cx: number, cy: number, spread: number, n: number) => {
    const placed: [number, number, number][] = [];
    for (let tries = 0; tries < n * 12 && placed.length < n; tries++) {
      const a = rand() * TAU, d = Math.sqrt(rand()) * spread;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.85;
      const R = (26 + rand() * 30) * s;
      if (x < -R || y < -R || x > W + R || y > H + R) continue;
      if (placed.some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + R + 6 * s)) continue;
      placed.push([x, y, R]);
    }
    placed.forEach(([x, y, R]) => drawGland(x, y, R));
  };

  if (kind === "benign") {
    const lobules = Math.max(1, Math.round(area / 520000));
    for (let i = 0; i < lobules; i++) glandsIn(W * (0.2 + rand() * 0.6), H * (0.2 + rand() * 0.6), (170 + rand() * 90) * s, 12 + Math.floor(rand() * 8));
  } else if (kind === "mixed") {
    glandsIn(W * 0.25, H * 0.35, 170 * s, 12);
  }

  // 6 ── IDC nests: crowded, pleomorphic, hyperchromatic nuclei
  const nests: Blob[] = [];
  if (kind !== "benign") {
    const count = kind === "idc" ? Math.max(3, Math.round(area / 190000)) : Math.max(2, Math.round(area / 420000));
    for (let i = 0; i < count; i++) {
      const cx = kind === "mixed" ? W * (0.5 + rand() * 0.45) : rand() * W;
      const cy = rand() * H;
      nests.push(makeBlob(cx, cy, (55 + rand() * 95) * s, rand));
    }
    for (const nest of nests) {
      tracePoly(ctx, nest.pts);
      ctx.fillStyle = `hsl(${eosH - 22}, ${22 + rand() * 8}%, ${66 + rand() * 6}%)`;
      ctx.fill();
      const n = Math.round((Math.PI * nest.r * nest.r) / (58 * s * s));
      const placed: [number, number, number][] = [];
      for (let tries = 0; tries < n * 4 && placed.length < n; tries++) {
        const a = rand() * TAU, d = Math.sqrt(rand()) * nest.r * 1.2;
        const x = nest.x + Math.cos(a) * d, y = nest.y + Math.sin(a) * d * 0.85;
        if (!pointInPoly(x, y, nest.pts)) continue;
        const rx = (3.2 + rand() * 3.6) * s;
        if (placed.some(([px, py, pr]) => Math.hypot(px - x, py - y) < (pr + rx) * 0.78)) continue;
        placed.push([x, y, rx]);
        nucleus(x, y, rx, rx * (0.62 + rand() * 0.36), rand() * Math.PI, hemH + (rand() - 0.5) * 24, 24 + rand() * 18, 30 + rand() * 18, 0.8 + rand() * 0.12);
        if (rand() < 0.28) {
          ctx.beginPath();
          ctx.arc(x + (rand() - 0.5) * rx * 0.5, y + (rand() - 0.5) * rx * 0.3, (0.9 + rand() * 0.8) * s, 0, TAU);
          ctx.fillStyle = `hsla(${hemH + 40}, 45%, 22%, 0.85)`;
          ctx.fill();
        }
      }
      // cribriform spaces
      const holes = Math.floor(rand() * 4);
      for (let k = 0; k < holes; k++) {
        const a = rand() * TAU, d = rand() * nest.r * 0.5;
        const hx = nest.x + Math.cos(a) * d, hy = nest.y + Math.sin(a) * d;
        const hr = (5 + rand() * 9) * s;
        ctx.beginPath();
        ctx.ellipse(hx, hy, hr, hr * (0.7 + rand() * 0.3), rand() * TAU, 0, TAU);
        ctx.fillStyle = `hsl(${eosH + 10}, 24%, 93%)`;
        ctx.fill();
        ctx.lineWidth = 1 * s;
        ctx.strokeStyle = `hsla(${hemH}, 34%, 30%, 0.7)`;
        ctx.stroke();
      }
      // mitotic figures
      if (rand() < 0.6) {
        const x = nest.x + (rand() - 0.5) * nest.r * 0.6, y = nest.y + (rand() - 0.5) * nest.r * 0.6;
        const a = rand() * Math.PI;
        for (let k = 0; k < 7; k++) {
          const o = (k - 3) * 1.6 * s;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * o + (rand() - 0.5) * 2 * s, y + Math.sin(a) * o + (rand() - 0.5) * 2 * s, (1.2 + rand()) * s, 0, TAU);
          ctx.fillStyle = `hsla(${hemH + 10}, 50%, 14%, 0.95)`;
          ctx.fill();
        }
      }
    }
    // single-file infiltration through stroma
    const files = kind === "idc" ? 4 : 2;
    for (let f = 0; f < files; f++) {
      let x = rand() * W, y = rand() * H;
      if (inTissue(x, y) < 0.5) continue;
      const cells = 4 + Math.floor(rand() * 6);
      for (let k = 0; k < cells; k++) {
        const a = flowAngle(x, y);
        nucleus(x + (rand() - 0.5) * 4 * s, y + (rand() - 0.5) * 4 * s, (3.2 + rand() * 1.6) * s, (2.2 + rand()) * s, a, hemH, 30, 32 + rand() * 8);
        x += Math.cos(a) * (10 + rand() * 6) * s;
        y += Math.sin(a) * (10 + rand() * 6) * s;
      }
    }
  }

  // 7 ── stromal fibroblasts (spindle) and lymphocytes (small round, dark)
  const fibro = Math.round(area / (kind === "idc" ? 2600 : 3400));
  for (let i = 0; i < fibro; i++) {
    const x = rand() * W, y = rand() * H;
    if (inTissue(x, y) < 0.6) continue;
    if (nests.some((n) => Math.hypot(n.x - x, n.y - y) < n.r * 0.9)) continue;
    nucleus(x, y, (4.5 + rand() * 3.5) * s, (1.1 + rand() * 0.8) * s, flowAngle(x, y), hemH - 4, 26, 34 + rand() * 8, 0.75, false);
  }
  const lymph = Math.round(area / (kind === "benign" ? 16000 : 5200));
  for (let i = 0; i < lymph; i++) {
    const cx = rand() * W, cy = rand() * H;
    if (inTissue(cx, cy) < 0.5) continue;
    const clump = 1 + Math.floor(rand() * (kind === "benign" ? 3 : 7));
    for (let k = 0; k < clump; k++) {
      const r = (2.2 + rand() * 0.9) * s;
      nucleus(cx + (rand() - 0.5) * 18 * s, cy + (rand() - 0.5) * 18 * s, r, r * (0.85 + rand() * 0.15), rand() * TAU, hemH - 12, 36, 24 + rand() * 8, 0.88, false);
    }
  }

  // 8 ── optics: slight defocus, stain cast, vignetting, sensor grain
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const octx = out.getContext("2d")!;
  if ("filter" in octx) octx.filter = `blur(${0.32 * s}px)`;
  octx.drawImage(canvas, 0, 0);
  if ("filter" in octx) octx.filter = "none";

  octx.globalCompositeOperation = "multiply";
  octx.fillStyle = `hsla(${300 + shift * 30}, 30%, ${93 + rand() * 4}%, 1)`;
  octx.fillRect(0, 0, W, H);
  const vg = octx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  vg.addColorStop(0, "rgba(255,255,255,1)");
  vg.addColorStop(1, "rgba(200,188,205,1)");
  octx.fillStyle = vg;
  octx.fillRect(0, 0, W, H);
  octx.globalCompositeOperation = "source-over";

  const img = octx.getImageData(0, 0, W, H);
  const grain = rng(seed ^ 0x51f15e);
  for (let p = 0; p < img.data.length; p += 4) {
    const g = (grain() - 0.5) * 10;
    img.data[p] += g + (grain() - 0.5) * 5;
    img.data[p + 1] += g + (grain() - 0.5) * 5;
    img.data[p + 2] += g + (grain() - 0.5) * 5;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

const cache = new Map<string, HTMLCanvasElement>();
export function generateCached(opts: GenerateOptions) {
  const key = `${opts.kind}:${opts.seed}:${opts.width}x${opts.height}:${opts.scale ?? 1}:${opts.stainShift ?? 0}`;
  let c = cache.get(key);
  if (!c) {
    c = generateSpecimen(opts);
    cache.set(key, c);
  }
  return c;
}
