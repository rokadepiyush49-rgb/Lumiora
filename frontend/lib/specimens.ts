"use client";

import type { DatasetSpecimen } from "./types";
import { DEMO_SPECIMENS, SYNTHETIC_SCALE, type DemoSpecimen } from "./mock-data";
import { generateCached, generateSpecimen, type SpecimenKind } from "./imaging/specimen-generator";
import { rng } from "./utils";

export function renderDemoSpecimen(d: DemoSpecimen) {
  return generateCached({ width: d.width, height: d.height, seed: d.seed, kind: d.kind, scale: SYNTHETIC_SCALE });
}

export const findDemo = (id: string) => DEMO_SPECIMENS.find((d) => d.id === id || d.caseId === id);

const MAG_SCALE: Record<number, number> = { 40: 1.1, 100: 1.9, 200: 3.1, 400: 5.2 };

function datasetKind(s: DatasetSpecimen): SpecimenKind {
  if (s.label === "benign") return "benign";
  return rng(s.seed)() < 0.3 ? "mixed" : "idc";
}

function stainShift(s: DatasetSpecimen) {
  const r = rng(s.seed + 5)();
  if (s.dataset === "BreakHis") return 0.35 + r * 0.45;
  if (s.dataset === "IDC") return -0.3 + r * 0.6;
  return -0.8 + r * 1.6;
}

/** Full-resolution synthetic rendering at the specimen's nominal size. */
export function renderDatasetSpecimen(s: DatasetSpecimen): HTMLCanvasElement {
  const kind = datasetKind(s);
  if (s.dataset === "IDC") {
    // IDC patches are 50×50 crops of downsampled slides: render larger, then reduce.
    const big = generateSpecimen({ width: 400, height: 400, seed: s.seed, kind, scale: 1.2, stainShift: stainShift(s) });
    const c = document.createElement("canvas");
    c.width = s.width;
    c.height = s.height;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(big, 0, 0, s.width, s.height);
    return c;
  }
  const scale = s.dataset === "BreakHis" ? MAG_SCALE[s.magnification] : SYNTHETIC_SCALE * (s.width / 1536);
  return generateSpecimen({ width: s.width, height: s.height, seed: s.seed, kind, scale, stainShift: stainShift(s) });
}

const thumbCache = new Map<string, string>();

export function datasetThumbnail(s: DatasetSpecimen, size = 176): string {
  const hit = thumbCache.get(s.id);
  if (hit) return hit;
  const full = renderDatasetSpecimen(s);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = s.dataset !== "IDC";
  ctx.imageSmoothingQuality = "high";
  const side = Math.min(full.width, full.height);
  ctx.drawImage(full, (full.width - side) / 2, (full.height - side) / 2, side, side, 0, 0, size, size);
  const url = c.toDataURL("image/jpeg", 0.86);
  thumbCache.set(s.id, url);
  return url;
}

export function demoThumbnail(d: DemoSpecimen, w = 240, h = 180): string {
  const key = `demo:${d.id}:${w}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const full = renderDemoSpecimen(d);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, 0, 0, w, h);
  const url = c.toDataURL("image/jpeg", 0.86);
  thumbCache.set(key, url);
  return url;
}
