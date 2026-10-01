/**
 * API abstraction.
 *
 * Every screen talks to a `NexusApi`. Two implementations exist:
 *   createHttpApi(baseUrl) — the FastAPI backend in /backend
 *   createDemoApi()        — in-browser simulation (lib/mock-api.ts)
 *
 * The BackendProvider probes GET /api/health on start-up and picks one; the
 * rest of the app never branches on mode except to *label* demo output.
 */
import {
  ApiError,
  type AnalysisResult,
  type BandId,
  type BandSet,
  type CaseRecord,
  type GradCamResult,
  type HealthStatus,
  type ModelInfo,
  type ModelMetrics,
  type TileGrid,
  type TissueClass,
} from "./types";
import { decodeHeatmapPng } from "./imaging/saliency";

export const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface AnalyzeInput {
  file: Blob;
  filename: string;
  caseId: string;
  /** Client-side bands (always computed locally; used by the demo engine). */
  bands: BandSet;
  width: number;
  height: number;
  seed: number;
  /** Demo narrative only: pin P(cancerous) for curated specimens. */
  fixedProbability?: number;
}

export interface GradCamOptions {
  layer?: string;
  target?: TissueClass;
}

export interface SpectralSummary {
  bands: Partial<Record<BandId, { mean: number; std: number; histogram?: number[] }>>;
  ms: number;
}

export interface NexusApi {
  mode: "connected" | "demo";
  baseUrl?: string;
  health(): Promise<HealthStatus>;
  modelInfo(): Promise<ModelInfo>;
  metrics(): Promise<ModelMetrics>;
  cases(): Promise<CaseRecord[]>;
  analyze(input: AnalyzeInput, signal?: AbortSignal): Promise<AnalysisResult>;
  gradcam(input: AnalyzeInput, opts: GradCamOptions, signal?: AbortSignal): Promise<GradCamResult>;
  spectral(input: AnalyzeInput, signal?: AbortSignal): Promise<SpectralSummary>;
}

/* ------------------------------------------------------------ wire types */

interface WireTiles {
  tile_size: number;
  stride: number;
  cols: number;
  rows: number;
  probabilities: (number | null)[];
}

interface WireGradCam {
  heatmap: string;
  width: number;
  height: number;
  layer: string;
  feature_map: [number, number, number];
  target: TissueClass;
}

interface WireAnalyze {
  case_id: string;
  prediction: TissueClass;
  confidence: number;
  probability_malignant: number;
  threshold: number;
  indeterminate_margin?: number;
  model: string;
  model_version: string;
  inference_time: number;
  timings?: Record<string, number>;
  aggregation?: string;
  tiles?: WireTiles | null;
  gradcam?: WireGradCam | null;
}

interface WireHealth {
  status: HealthStatus["status"];
  model_loaded: boolean;
  model_file?: string;
  device: string;
  device_name?: string;
  memory_used_gb?: number;
  memory_total_gb?: number;
  version?: string;
  uptime_s?: number;
  last_model_update?: string;
}

/* --------------------------------------------------------------- helpers */

async function request<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), init.timeoutMs ?? 30_000);
  const onAbort = () => ctrl.abort("cancelled");
  init.signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail ?? body.message ?? detail;
      } catch {
        /* non-JSON error body */
      }
      if (res.status === 415 || res.status === 422) throw new ApiError("INVALID_IMAGE", String(detail), res.status);
      if (res.status === 503) throw new ApiError("MODEL_UNAVAILABLE", String(detail), res.status);
      throw new ApiError("SERVER_ERROR", `${res.status} ${detail}`, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (ctrl.signal.aborted && ctrl.signal.reason === "timeout") throw new ApiError("TIMEOUT", "Request timed out.");
    if (ctrl.signal.aborted) throw new ApiError("SERVER_ERROR", "Request cancelled.");
    throw new ApiError("BACKEND_UNAVAILABLE", "Backend unreachable.");
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onAbort);
  }
}

const mapTiles = (t?: WireTiles | null): TileGrid | null =>
  t ? { tileSize: t.tile_size, stride: t.stride, cols: t.cols, rows: t.rows, probabilities: t.probabilities.map((p) => (p == null ? NaN : p)) } : null;

async function mapGradCam(g?: WireGradCam | null): Promise<GradCamResult | null> {
  if (!g) return null;
  const { values, width, height } = await decodeHeatmapPng(g.heatmap);
  return { values, width, height, layer: g.layer, featureMap: g.feature_map, target: g.target };
}

const mapHealth = (h: WireHealth, latencyMs?: number): HealthStatus => ({
  status: h.status,
  modelLoaded: h.model_loaded,
  modelFile: h.model_file,
  device: h.device,
  deviceName: h.device_name,
  memoryUsedGb: h.memory_used_gb,
  memoryTotalGb: h.memory_total_gb,
  version: h.version,
  uptimeS: h.uptime_s,
  lastModelUpdate: h.last_model_update,
  latencyMs,
});

function form(input: AnalyzeInput, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("image", input.file, input.filename);
  fd.append("case_id", input.caseId);
  Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  return fd;
}

/* ------------------------------------------------------------ http impl */

export async function probeBackend(baseUrl: string, timeoutMs = 1800): Promise<HealthStatus | null> {
  const t0 = performance.now();
  try {
    const h = await request<WireHealth>(`${baseUrl}/api/health`, { timeoutMs });
    return mapHealth(h, performance.now() - t0);
  } catch {
    return null;
  }
}

export function createHttpApi(baseUrl: string): NexusApi {
  const u = (p: string) => `${baseUrl.replace(/\/$/, "")}${p}`;
  return {
    mode: "connected",
    baseUrl,
    async health() {
      const t0 = performance.now();
      const h = await request<WireHealth>(u("/api/health"), { timeoutMs: 4000 });
      return mapHealth(h, performance.now() - t0);
    },
    async modelInfo() {
      const m = await request<Record<string, unknown>>(u("/api/model-info"));
      return {
        name: m.name as string,
        architecture: m.architecture as string,
        file: m.file as string,
        framework: m.framework as string,
        inputShape: m.input_shape as [number, number, number],
        output: m.output as string,
        parameters: m.parameters as ModelInfo["parameters"],
        head: m.head as string[],
        optimizer: m.optimizer as string,
        loss: m.loss as string,
        gradcamLayer: m.gradcam_layer as string,
        gradcamResolution: m.gradcam_resolution as [number, number],
        classes: m.classes as ModelInfo["classes"],
        threshold: m.threshold as number,
        version: m.version as string,
        updatedAt: m.updated_at as string,
        preprocessing: {
          inputChannels: (m.preprocessing as Record<string, string>).input_channels,
          normalization: (m.preprocessing as Record<string, string>).normalization,
          tiling: (m.preprocessing as Record<string, string>).tiling,
        },
      };
    },
    async metrics() {
      const m = await request<Record<string, unknown>>(u("/api/metrics"));
      const c = m.confusion as { tn: number; fp: number; fn: number; tp: number };
      return {
        isPlaceholder: Boolean(m.is_placeholder),
        split: m.split as string,
        samples: m.samples as number,
        confusion: c,
        valLoss: m.val_loss as number,
        auc: m.auc as number,
        history: ((m.history as Record<string, number>[]) ?? []).map((h) => ({ epoch: h.epoch, trainAcc: h.train_acc, valAcc: h.val_acc, trainLoss: h.train_loss, valLoss: h.val_loss })),
        roc: (m.roc as ModelMetrics["roc"]) ?? [],
        pr: (m.pr as ModelMetrics["pr"]) ?? [],
        reliability: (m.reliability as ModelMetrics["reliability"]) ?? [],
        ece: (m.ece as number) ?? NaN,
      };
    },
    async cases() {
      const rows = await request<Record<string, unknown>[]>(u("/api/cases"));
      return rows.map((r) => ({
        caseId: r.case_id as string,
        specimenId: r.specimen_id as string,
        timestamp: r.timestamp as string,
        prediction: (r.prediction as TissueClass) ?? null,
        confidence: (r.confidence as number) ?? null,
        model: r.model as string,
        status: r.status as CaseRecord["status"],
        source: "backend",
        dataset: (r.dataset as string) ?? "Custom",
        note: r.note as string | undefined,
      }));
    },
    async analyze(input, signal) {
      const w = await request<WireAnalyze>(u("/api/analyze"), { method: "POST", body: form(input), signal, timeoutMs: 120_000 });
      const t = w.timings ?? {};
      return {
        caseId: w.case_id,
        prediction: w.prediction,
        confidence: w.confidence,
        probabilityMalignant: w.probability_malignant,
        threshold: w.threshold,
        indeterminateMargin: w.indeterminate_margin ?? 0.1,
        model: w.model,
        modelVersion: w.model_version,
        inferenceMs: w.inference_time,
        timings: { preprocess: t.preprocess, features: t.features, classify: t.classify, gradcam: t.gradcam, total: t.total },
        gradcam: await mapGradCam(w.gradcam),
        tiles: mapTiles(w.tiles),
        aggregation: w.aggregation ?? "Mean of top-15% tile probabilities",
        source: "backend",
        completedAt: new Date().toISOString(),
      };
    },
    async gradcam(input, opts, signal) {
      const g = await request<WireGradCam>(u("/api/gradcam"), {
        method: "POST",
        body: form(input, { layer: opts.layer ?? "out_relu", target: opts.target ?? "cancerous" }),
        signal,
        timeoutMs: 120_000,
      });
      return (await mapGradCam(g))!;
    },
    async spectral(input, signal) {
      const t0 = performance.now();
      const r = await request<{ bands: SpectralSummary["bands"] }>(u("/api/spectral-analysis"), { method: "POST", body: form(input), signal });
      return { bands: r.bands, ms: performance.now() - t0 };
    },
  };
}
