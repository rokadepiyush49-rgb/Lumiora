"use client";

/**
 * Analysis session: the single source of truth for the specimen currently on
 * the workstation, its derived rasters, the pipeline, and the result.
 *
 * Stages 1–4 and 8 are computed in the browser and their timings are measured.
 * Stages 5–7 (MobileNetV2 → classification → Grad-CAM) run on the backend in
 * connected mode, or are simulated (and labelled) in demo mode.
 */
import {
  ApiError,
  type AnalysisResult,
  type ApiErrorCode,
  type BandChannel,
  type BandId,
  type BandSet,
  type CaseRecord,
  type DatasetSpecimen,
  type LogEntry,
  type LogLevel,
  type PipelineStage,
  type SpecimenMeta,
  type StageId,
  type TissueClass,
} from "../types";
import type { ColormapName } from "../imaging/colormap";
import { extractBands } from "../imaging/bands";
import { canvasToBlob, decodeFile, prepareImage, probeFile, validateFile, type PreparedImage } from "../imaging/load";
import { contourPath, sobel, tissueGrid } from "../imaging/spatial";
import { DEMO_SPECIMENS, SYNTHETIC_MPP } from "../mock-data";
import { renderDatasetSpecimen, renderDemoSpecimen } from "../specimens";
import { fmtBytes, fmtMs, hashString, safeStorage, sleep } from "../utils";
import { backendStore, checkBackend } from "./backend";
import { settingsStore, updateSettings } from "./settings";
import { createStore, useStore } from "./store";

export type OverlayMode = "original" | "gradcam" | "combined" | "edges";

export interface ViewSettings {
  overlay: OverlayMode;
  channel: "RGB" | BandId;
  heatOpacity: number;
  colormap: ColormapName;
  brightness: number;
  contrast: number;
  showTiles: boolean;
  showGrid: boolean;
  showCrosshair: boolean;
  showBoundary: boolean;
  compare: boolean;
}

export interface TissueInfo {
  fraction: number;
  path: string;
  cell: number;
}

export type Phase = "empty" | "loading" | "loaded" | "running" | "complete" | "error";

export interface SessionState {
  phase: Phase;
  specimen: SpecimenMeta | null;
  file: Blob | null;
  imageUrl: string | null;
  image: PreparedImage | null;
  bands: BandSet | null;
  edges: BandChannel | null;
  tissue: TissueInfo | null;
  result: AnalysisResult | null;
  stages: PipelineStage[];
  logs: LogEntry[];
  error: { code: ApiErrorCode | "UNKNOWN"; message: string; stage?: StageId } | null;
  runStartedAt: number | null;
  sessionStartedAt: number;
  seed: number;
  fixedProbability?: number;
  caseId: string | null;
  mpp: number;
  view: ViewSettings;
  history: CaseRecord[];
}

export const STAGE_DEFS: Omit<PipelineStage, "status">[] = [
  { id: "input", label: "Input", detail: "Decode · validate" },
  { id: "normalize", label: "Image normalization", detail: "Resample · scale to [0,1]" },
  { id: "bands", label: "Multi-band extraction", detail: "RGB · HSV · LAB" },
  { id: "spatial", label: "Spatial features", detail: "Sobel |∇| · tissue mask" },
  { id: "features", label: "MobileNetV2", detail: "96×96 tiles · 1280-d" },
  { id: "classify", label: "Classification", detail: "Sigmoid · binary" },
  { id: "gradcam", label: "Grad-CAM", detail: "out_relu · 3×3×1280" },
  { id: "explain", label: "Explanation", detail: "Overlay composition" },
];

const freshStages = (): PipelineStage[] => STAGE_DEFS.map((s) => ({ ...s, status: "waiting" }));

const DEFAULT_VIEW: ViewSettings = {
  overlay: "original",
  channel: "RGB",
  heatOpacity: 0.55,
  colormap: "inferno",
  brightness: 1,
  contrast: 1,
  showTiles: false,
  showGrid: true,
  showCrosshair: true,
  showBoundary: false,
  compare: false,
};

const HISTORY_KEY = "nexus-path:history:v1";
const COUNTER_KEY = "nexus-path:case-counter";

export const sessionStore = createStore<SessionState>({
  phase: "empty",
  specimen: null,
  file: null,
  imageUrl: null,
  image: null,
  bands: null,
  edges: null,
  tissue: null,
  result: null,
  stages: freshStages(),
  logs: [],
  error: null,
  runStartedAt: null,
  sessionStartedAt: 0,
  seed: 0,
  caseId: null,
  mpp: SYNTHETIC_MPP,
  view: DEFAULT_VIEW,
  history: [],
});

export const useSession = <U,>(sel: (s: SessionState) => U) => useStore(sessionStore, sel);

/* ------------------------------------------------------------- helpers */

export function log(level: LogLevel, scope: string, message: string) {
  sessionStore.set((s) => ({ logs: [...s.logs.slice(-240), { t: Date.now(), level, scope, message }] }));
}

function setStage(id: StageId, patch: Partial<PipelineStage>) {
  sessionStore.set((s) => ({ stages: s.stages.map((st) => (st.id === id ? { ...st, ...patch } : st)) }));
}

export function setView(patch: Partial<ViewSettings>) {
  sessionStore.set((s) => ({ view: { ...s.view, ...patch } }));
}

function nextCaseId() {
  const ls = safeStorage();
  let n = 2482;
  try {
    n = Number(ls?.getItem(COUNTER_KEY) ?? 2482);
    ls?.setItem(COUNTER_KEY, String(n + 1));
  } catch {
    /* storage unavailable: counter resets per session */
  }
  return `NP-${String(n).padStart(5, "0")}`;
}

let hydrated = false;
export function hydrateSession() {
  if (hydrated) return;
  hydrated = true;
  sessionStore.set({ sessionStartedAt: Date.now(), view: { ...DEFAULT_VIEW, colormap: settingsStore.get().defaultColormap } });
  try {
    const raw = safeStorage()?.getItem(HISTORY_KEY);
    if (raw) sessionStore.set({ history: JSON.parse(raw) });
  } catch {
    /* ignore */
  }
  log("info", "system", "Workstation initialised");
}

function persistHistory(history: CaseRecord[]) {
  try {
    safeStorage()?.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

let abort: AbortController | null = null;

function releaseUrl() {
  const u = sessionStore.get().imageUrl;
  if (u) URL.revokeObjectURL(u);
}

function resetForLoad() {
  abort?.abort();
  releaseUrl();
  sessionStore.set({
    phase: "loading",
    specimen: null,
    file: null,
    imageUrl: null,
    image: null,
    bands: null,
    edges: null,
    tissue: null,
    result: null,
    error: null,
    stages: freshStages(),
    runStartedAt: null,
    fixedProbability: undefined,
    view: { ...sessionStore.get().view, overlay: "original", channel: "RGB", compare: false },
  });
}

function fail(code: ApiErrorCode | "UNKNOWN", message: string, stage?: StageId) {
  sessionStore.set({ phase: "error", error: { code, message, stage } });
  if (stage) setStage(stage, { status: "error", output: code });
  log("error", stage ?? "load", message);
}

/* --------------------------------------------------------------- loading */

async function finishLoad(prep: PreparedImage, meta: Omit<SpecimenMeta, "width" | "height" | "displayScale">, file: Blob, decodeMs: number, opts: { seed: number; caseId: string; fixedProbability?: number; mpp: number }) {
  sessionStore.set({
    phase: "loaded",
    image: prep,
    file,
    imageUrl: URL.createObjectURL(file),
    seed: opts.seed,
    caseId: opts.caseId,
    fixedProbability: opts.fixedProbability,
    mpp: opts.mpp,
    specimen: { ...meta, width: prep.sourceWidth, height: prep.sourceHeight, displayScale: prep.displayScale },
  });
  setStage("input", { status: "done", ms: decodeMs + prep.ms, output: `${prep.sourceWidth}×${prep.sourceHeight} · RGB` });
  log("ok", "input", `Loaded ${meta.name} · ${prep.sourceWidth}×${prep.sourceHeight} · ${fmtBytes(meta.sizeBytes)} · ${meta.colorProfile}`);
  if (prep.displayScale < 1) log("warn", "input", `Display raster downsampled ×${prep.displayScale.toFixed(3)} (viewer limit 4096 px)`);
}

export async function loadFile(file: File) {
  resetForLoad();
  log("info", "input", `Reading ${file.name} (${fmtBytes(file.size)})`);
  try {
    validateFile(file);
    const probe = await probeFile(file);
    const t0 = performance.now();
    const src = await decodeFile(file);
    const decodeMs = performance.now() - t0;
    const w = "naturalWidth" in src ? src.naturalWidth : src.width;
    const h = "naturalHeight" in src ? src.naturalHeight : src.height;
    const prep = prepareImage(src, w, h);
    await finishLoad(
      prep,
      {
        id: file.name.replace(/\.[^.]+$/, "").toUpperCase(),
        name: file.name,
        source: "upload",
        sizeBytes: file.size,
        mime: file.type || `image/${probe.format.toLowerCase()}`,
        colorProfile: `${probe.colorType} · ${probe.colorProfile}`,
        bitDepth: probe.bitDepth,
        synthetic: false,
        magnification: 40,
        dataset: "Custom upload",
      },
      file,
      decodeMs,
      { seed: hashString(file.name + file.size), caseId: nextCaseId(), mpp: SYNTHETIC_MPP },
    );
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError("INVALID_IMAGE", "Image could not be read.");
    fail(err.code, err.message, "input");
  }
}

export async function loadDemo(id: string) {
  const d = DEMO_SPECIMENS.find((s) => s.id === id || s.caseId === id);
  if (!d) return;
  resetForLoad();
  log("info", "input", `Loading demo specimen ${d.id} (synthetic)`);
  await sleep(16);
  const t0 = performance.now();
  const canvas = renderDemoSpecimen(d);
  const blob = await canvasToBlob(canvas);
  const decodeMs = performance.now() - t0;
  const prep = prepareImage(canvas, canvas.width, canvas.height);
  await finishLoad(
    prep,
    {
      id: d.id,
      name: `${d.id}.PNG`,
      source: "sample",
      sizeBytes: blob.size,
      mime: "image/png",
      colorProfile: "RGB · sRGB (synthetic)",
      bitDepth: 8,
      synthetic: true,
      truth: d.truth,
      magnification: 40,
      dataset: "Demo · synthetic H&E",
    },
    blob,
    decodeMs,
    { seed: d.seed, caseId: d.caseId, fixedProbability: d.probability, mpp: SYNTHETIC_MPP },
  );
}

export async function loadDataset(s: DatasetSpecimen) {
  resetForLoad();
  log("info", "input", `Loading ${s.id} from ${s.dataset} (synthetic preview)`);
  await sleep(16);
  const t0 = performance.now();
  const canvas = renderDatasetSpecimen(s);
  const blob = await canvasToBlob(canvas);
  const decodeMs = performance.now() - t0;
  const prep = prepareImage(canvas, canvas.width, canvas.height);
  const mpp = s.dataset === "BreakHis" ? { 40: 0.49, 100: 0.2, 200: 0.1, 400: 0.05 }[s.magnification] ?? 0.25 : SYNTHETIC_MPP;
  await finishLoad(
    prep,
    {
      id: s.id,
      name: `${s.id}.PNG`,
      source: "dataset",
      sizeBytes: blob.size,
      mime: "image/png",
      colorProfile: "RGB · sRGB (synthetic)",
      bitDepth: 8,
      synthetic: true,
      truth: s.label,
      magnification: s.magnification,
      dataset: `${s.dataset}${s.subtype ? ` · ${s.subtype}` : ""}`,
    },
    blob,
    decodeMs,
    { seed: s.seed, caseId: nextCaseId(), mpp },
  );
}

export function clearSession() {
  abort?.abort();
  releaseUrl();
  sessionStore.set({
    phase: "empty",
    specimen: null,
    file: null,
    imageUrl: null,
    image: null,
    bands: null,
    edges: null,
    tissue: null,
    result: null,
    error: null,
    stages: freshStages(),
    caseId: null,
    runStartedAt: null,
  });
  log("info", "session", "Session cleared");
}

/* -------------------------------------------------------------- pipeline */

export async function runAnalysis() {
  const s0 = sessionStore.get();
  if (!s0.image || !s0.file || s0.phase === "running") return;
  abort?.abort();
  abort = new AbortController();
  const signal = abort.signal;
  const reduced = settingsStore.get().reducedMotion || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const dwell = reduced ? 0 : 240;
  const { image, file } = s0;
  const inputStage = s0.stages.find((s) => s.id === "input");

  sessionStore.set({
    phase: "running",
    error: null,
    result: null,
    runStartedAt: Date.now(),
    stages: freshStages().map((s) => (s.id === "input" && inputStage ? inputStage : s)),
  });
  log("info", "pipeline", `Run started · case ${s0.caseId} · engine ${backendStore.get().mode === "connected" ? "backend" : "demo"}`);

  const step = async <T,>(id: StageId, fn: () => T | Promise<T>, output: (r: T, ms: number) => string, simulated = false) => {
    setStage(id, { status: "running", simulated });
    await sleep(dwell / 2);
    const t0 = performance.now();
    const r = await fn();
    const ms = performance.now() - t0;
    await sleep(dwell / 2);
    if (signal.aborted) throw new Error("cancelled");
    setStage(id, { status: "done", ms, output: output(r, ms) });
    return r;
  };

  try {
    // 2 normalisation — per-channel statistics on the [0,1]-scaled work raster
    await step(
      "normalize",
      () => {
        const d = image.work.data;
        const m = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) {
          m[0] += d[i];
          m[1] += d[i + 1];
          m[2] += d[i + 2];
        }
        const n = d.length / 4;
        return m.map((v) => v / n / 255);
      },
      (m, ms) => {
        log("ok", "normalize", `Work raster ${image.work.width}×${image.work.height} · μRGB=(${m.map((v) => v.toFixed(3)).join(", ")}) · ${fmtMs(ms)}`);
        return `${image.work.width}×${image.work.height} · [0,1]`;
      },
    );

    // 3 multi-band extraction
    const { bands } = await step(
      "bands",
      () => extractBands(image.work),
      (r, ms) => {
        log("ok", "bands", `9 channels extracted (RGB/HSV/LAB, OpenCV 8-bit) · ${fmtMs(ms)}`);
        return "9 channels";
      },
    );
    sessionStore.set({ bands });

    // 4 spatial features
    await step(
      "spatial",
      () => {
        const { edges } = sobel(bands.L);
        const cell = Math.max(4, Math.round(Math.max(bands.S.width, bands.S.height) / 64));
        const tg = tissueGrid(bands.S, bands.V, cell);
        const fraction = tg.grid.reduce((a, b) => a + b, 0) / tg.grid.length;
        const path = contourPath(tg.grid, tg.gw, tg.gh, cell, 0.5, 1 / image.workScale);
        return { edges, tissue: { fraction, path, cell } };
      },
      (r, ms) => {
        log("ok", "spatial", `Sobel gradient on L* · tissue coverage ${(r.tissue.fraction * 100).toFixed(1)}% · ${fmtMs(ms)}`);
        sessionStore.set({ edges: r.edges, tissue: r.tissue });
        return `|∇| · tissue ${(r.tissue.fraction * 100).toFixed(0)}%`;
      },
    );

    // 5–7 model: backend or demo engine
    const { api } = backendStore.get();
    const demo = api.mode === "demo";
    const cur = sessionStore.get();
    setStage("features", { status: "running", simulated: demo });
    log("info", "model", demo ? "Demo engine: simulating MobileNetV2 inference (no model connected)" : `POST ${api.baseUrl}/api/analyze · ${fmtBytes(file.size)}`);

    let result: AnalysisResult;
    try {
      const pending = api.analyze(
        { file, filename: cur.specimen?.name ?? "specimen.png", caseId: cur.caseId ?? "NP-00000", bands, width: image.width, height: image.height, seed: cur.seed, fixedProbability: cur.fixedProbability },
        signal,
      );
      result = await pending;
    } catch (e) {
      if (signal.aborted) throw e;
      const err = e instanceof ApiError ? e : new ApiError("SERVER_ERROR", (e as Error).message);
      fail(err.code, err.message, "features");
      if (err.code === "BACKEND_UNAVAILABLE") void checkBackend();
      return;
    }

    // Backend tiles are in source pixels; the viewer works in display pixels.
    if (result.source === "backend" && result.tiles && image.displayScale !== 1) {
      result = { ...result, tiles: { ...result.tiles, stride: result.tiles.stride * image.displayScale, tileSize: result.tiles.tileSize * image.displayScale } };
    }
    const t = result.timings;
    setStage("features", { status: "done", ms: t.features, output: result.tiles ? `${result.tiles.probabilities.filter((p) => !Number.isNaN(p)).length} tiles · 1280-d` : "1280-d", simulated: demo });
    log("ok", "model", `Features extracted · ${fmtMs(t.features)}${demo ? " (simulated)" : ""}`);
    await sleep(dwell);
    setStage("classify", { status: "running", simulated: demo });
    await sleep(dwell);
    setStage("classify", { status: "done", ms: t.classify, output: `P=${result.probabilityMalignant.toFixed(3)} · ${result.prediction}`, simulated: demo });
    log(result.prediction === "cancerous" ? "warn" : "ok", "classify", `P(cancerous)=${result.probabilityMalignant.toFixed(4)} · threshold ${result.threshold} → ${result.prediction.toUpperCase()}${demo ? " (simulated)" : ""}`);
    setStage("gradcam", { status: "running", simulated: demo });
    await sleep(dwell);
    setStage("gradcam", {
      status: "done",
      ms: t.gradcam,
      output: result.gradcam ? `${result.gradcam.layer} · ${result.gradcam.featureMap.slice(0, 2).join("×")}` : "unavailable",
      simulated: demo,
    });
    log("ok", "gradcam", `Saliency for target “${result.gradcam?.target ?? result.prediction}” from ${result.gradcam?.layer ?? "—"}${demo ? " (simulated surrogate)" : ""}`);

    // 8 explanation
    await step(
      "explain",
      () => {
        sessionStore.set({ result });
        return true;
      },
      (_r, ms) => {
        log("ok", "explain", `Overlay composed · ${fmtMs(ms)}`);
        return "Overlay ready";
      },
    );

    const rec: CaseRecord = {
      caseId: result.caseId,
      specimenId: cur.specimen?.id ?? "—",
      timestamp: result.completedAt,
      prediction: result.prediction,
      confidence: result.confidence,
      model: result.model,
      status: Math.abs(result.probabilityMalignant - result.threshold) < result.indeterminateMargin ? "review" : "complete",
      source: result.source,
      dataset: cur.specimen?.dataset ?? "Custom",
    };
    const history = [rec, ...sessionStore.get().history.filter((h) => h.caseId !== rec.caseId)];
    persistHistory(history);
    sessionStore.set({ phase: "complete", history, view: { ...sessionStore.get().view, overlay: "combined" } });
    log("ok", "pipeline", `Run complete · ${result.caseId} · total ${fmtMs(Date.now() - (sessionStore.get().runStartedAt ?? Date.now()))}`);
  } catch (e) {
    if (signal.aborted) {
      log("warn", "pipeline", "Run cancelled");
      sessionStore.set({ phase: "loaded", stages: freshStages().map((s) => (s.id === "input" && inputStage ? inputStage : s)) });
      return;
    }
    fail("UNKNOWN", (e as Error).message ?? "Unexpected pipeline error");
  }
}

export function cancelRun() {
  abort?.abort();
}

export async function retryInDemoMode() {
  updateSettings({ forceDemo: true });
  await checkBackend();
  sessionStore.set({ phase: "loaded", error: null });
  await runAnalysis();
}

/** Re-run Grad-CAM for a different layer or target class on the current case. */
export async function regenerateGradcam(layer: string, target: TissueClass) {
  const s = sessionStore.get();
  if (!s.result || !s.bands || !s.file || !s.image) return;
  const { api } = backendStore.get();
  log("info", "gradcam", `Recomputing saliency · layer ${layer} · target ${target}${api.mode === "demo" ? " (simulated)" : ""}`);
  const t0 = performance.now();
  try {
    const g = await api.gradcam(
      { file: s.file, filename: s.specimen?.name ?? "specimen.png", caseId: s.result.caseId, bands: s.bands, width: s.image.width, height: s.image.height, seed: s.seed },
      { layer, target },
    );
    const cur = sessionStore.get().result;
    if (cur) sessionStore.set({ result: { ...cur, gradcam: g } });
    log("ok", "gradcam", `${layer} · ${g.featureMap.join("×")} · ${fmtMs(performance.now() - t0)}`);
  } catch (e) {
    log("error", "gradcam", (e as Error).message);
    throw e;
  }
}
