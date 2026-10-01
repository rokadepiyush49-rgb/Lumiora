export { cn } from "cn";

import type { AnalysisResult, BandDescriptor, BandId, ConfidenceBand } from "./types";

/* ------------------------------------------------------------------ format */

export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v == null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(digits)}%`;

export const fmtNum = (v: number | null | undefined, digits = 1) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);

export const fmtInt = (v: number) => v.toLocaleString("en-US");

export const fmtMs = (v: number | null | undefined) =>
  v == null ? "—" : v < 1 ? "<1 ms" : `${Math.round(v)} ms`;

export function fmtBytes(bytes: number) {
  if (!bytes) return "—";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtTime(iso: string | number) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

export function fmtClock(t: number, origin: number) {
  const dt = Math.max(0, t - origin);
  return `+${(dt / 1000).toFixed(3)}s`;
}

/* ------------------------------------------------------------------ math */

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** mulberry32 — small deterministic PRNG for reproducible demo data. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ domain */

export const BANDS: BandDescriptor[] = [
  { id: "R", glyph: "R", name: "Red", space: "RGB", range: [0, 255], description: "Long-wavelength reflectance; eosin-rich stroma appears bright." },
  { id: "G", glyph: "G", name: "Green", space: "RGB", range: [0, 255], description: "Strongest absorption by eosin; highest stroma/nucleus contrast in RGB." },
  { id: "B", glyph: "B", name: "Blue", space: "RGB", range: [0, 255], description: "Hematoxylin transmits blue; nuclei retain intensity relative to R/G." },
  { id: "H", glyph: "H", name: "Hue", space: "HSV", range: [0, 179], description: "Chromatic angle (OpenCV 0–179). Separates purple nuclei from pink stroma." },
  { id: "S", glyph: "S", name: "Saturation", space: "HSV", range: [0, 255], description: "Stain concentration proxy; background glass is desaturated." },
  { id: "V", glyph: "V", name: "Value", space: "HSV", range: [0, 255], description: "Max-channel brightness; tissue vs. background separation." },
  { id: "L", glyph: "L*", name: "Lightness", space: "LAB", range: [0, 255], description: "Perceptual lightness (L*×255/100). Tracks optical density." },
  { id: "A", glyph: "a*", name: "Green–Red", space: "LAB", range: [0, 255], description: "Opponent axis a*+128. Elevated in eosinophilic regions." },
  { id: "Bb", glyph: "b*", name: "Blue–Yellow", space: "LAB", range: [0, 255], description: "Opponent axis b*+128. Depressed where hematoxylin dominates." },
];

export const BAND_IDS = BANDS.map((b) => b.id) as BandId[];
export const bandById = (id: BandId) => BANDS.find((b) => b.id === id)!;

export function confidenceBand(r: Pick<AnalysisResult, "probabilityMalignant" | "threshold" | "indeterminateMargin" | "confidence">): ConfidenceBand {
  if (Math.abs(r.probabilityMalignant - r.threshold) < r.indeterminateMargin) return "indeterminate";
  if (r.confidence >= 0.9) return "high";
  if (r.confidence >= 0.75) return "moderate";
  return "low";
}

export const CONFIDENCE_LABEL: Record<ConfidenceBand, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
  indeterminate: "Indeterminate",
};

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function safeStorage() {
  try {
    const k = "__np_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return null;
  }
}
