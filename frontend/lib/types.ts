/**
 * Domain types for NEXUS PATH.
 *
 * Shapes mirror the FastAPI contract in /backend (snake_case on the wire,
 * normalised to camelCase in lib/api.ts). The model these types describe is
 * spectral_cancer_model.h5: MobileNetV2 backbone, 96×96×3 input, single
 * sigmoid output (P[cancerous]).
 */

export type TissueClass = "cancerous" | "benign";

/** The nine pseudo-spectral optical bands (OpenCV 8-bit conventions). */
export type BandId = "R" | "G" | "B" | "H" | "S" | "V" | "L" | "A" | "Bb";
export type ColorSpace = "RGB" | "HSV" | "LAB";

export interface BandDescriptor {
  id: BandId;
  /** Short channel glyph shown in the UI, e.g. "b*" for LAB blue–yellow. */
  glyph: string;
  name: string;
  space: ColorSpace;
  /** Native 8-bit dynamic range after OpenCV conversion. */
  range: [number, number];
  description: string;
}

export interface BandStats {
  mean: number;
  std: number;
  variance: number;
  min: number;
  max: number;
  median: number;
  /** Shannon entropy in bits of the 256-bin histogram. */
  entropy: number;
  /** 256-bin histogram (counts). */
  histogram: number[];
}

export interface BandChannel {
  id: BandId;
  width: number;
  height: number;
  /** 8-bit intensities, row-major. */
  data: Uint8ClampedArray;
  stats: BandStats;
}

export type BandSet = Record<BandId, BandChannel>;

/** Patch-level probabilities from tiled inference (model input is 96 px). */
export interface TileGrid {
  tileSize: number;
  stride: number;
  cols: number;
  rows: number;
  /** Row-major P(cancerous) per tile, 0–1. NaN = background tile (skipped). */
  probabilities: number[];
}

export interface GradCamResult {
  /** Row-major saliency in [0,1]. */
  values: Float32Array;
  width: number;
  height: number;
  layer: string;
  /** Spatial size of the target layer's activation map, e.g. [3,3,1280]. */
  featureMap: [number, number, number];
  target: TissueClass;
}

export interface StageTimings {
  preprocess?: number;
  bands?: number;
  features?: number;
  classify?: number;
  gradcam?: number;
  total?: number;
}

export interface AnalysisResult {
  caseId: string;
  prediction: TissueClass;
  /** Confidence in the predicted class (0–1). */
  confidence: number;
  /** Raw sigmoid output P(cancerous) aggregated over tiles. */
  probabilityMalignant: number;
  threshold: number;
  /** Width of the indeterminate band around the threshold. */
  indeterminateMargin: number;
  model: string;
  modelVersion: string;
  inferenceMs: number;
  timings: StageTimings;
  gradcam: GradCamResult | null;
  tiles: TileGrid | null;
  aggregation: string;
  /** "backend" = real model output; "demo" = simulated in-browser. */
  source: "backend" | "demo";
  /** Human-readable note explaining how a simulated result was produced. */
  simulationNote?: string;
  completedAt: string;
}

export type ConfidenceBand = "high" | "moderate" | "low" | "indeterminate";

export interface ModelInfo {
  name: string;
  architecture: string;
  file: string;
  framework: string;
  inputShape: [number, number, number];
  output: string;
  parameters: { total: number; trainable: number; frozen: number };
  head: string[];
  optimizer: string;
  loss: string;
  gradcamLayer: string;
  gradcamResolution: [number, number];
  classes: [TissueClass, TissueClass];
  threshold: number;
  version: string;
  updatedAt: string;
  /** Preprocessing assumptions the backend applies before inference. */
  preprocessing: { inputChannels: string; normalization: string; tiling: string };
}

export interface ConfusionMatrix {
  tn: number;
  fp: number;
  fn: number;
  tp: number;
}

export interface EpochPoint {
  epoch: number;
  trainAcc: number;
  valAcc: number;
  trainLoss: number;
  valLoss: number;
}

export interface CurvePoint {
  x: number;
  y: number;
  threshold?: number;
}

export interface ReliabilityBin {
  bin: number;
  predicted: number;
  observed: number;
  count: number;
}

export interface ModelMetrics {
  isPlaceholder: boolean;
  split: string;
  samples: number;
  confusion: ConfusionMatrix;
  valLoss: number;
  auc: number;
  history: EpochPoint[];
  roc: CurvePoint[];
  pr: CurvePoint[];
  reliability: ReliabilityBin[];
  ece: number;
}

export type CaseStatus = "complete" | "review" | "failed" | "running";

export interface CaseRecord {
  caseId: string;
  specimenId: string;
  timestamp: string;
  prediction: TissueClass | null;
  confidence: number | null;
  model: string;
  status: CaseStatus;
  source: "backend" | "demo";
  dataset: string;
  note?: string;
}

export type DatasetName = "IDC" | "BreakHis" | "Custom";

export interface DatasetSpecimen {
  id: string;
  dataset: DatasetName;
  label: TissueClass;
  magnification: 40 | 100 | 200 | 400;
  width: number;
  height: number;
  patient: string;
  seed: number;
  subtype?: string;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  modelLoaded: boolean;
  modelFile?: string;
  device: "GPU" | "CPU" | "MPS" | string;
  deviceName?: string;
  memoryUsedGb?: number;
  memoryTotalGb?: number;
  version?: string;
  uptimeS?: number;
  lastModelUpdate?: string;
  latencyMs?: number;
}

export type ConnectionMode = "checking" | "connected" | "demo";

export type StageStatus = "waiting" | "running" | "done" | "error" | "skipped";

export type StageId =
  | "input"
  | "normalize"
  | "bands"
  | "spatial"
  | "features"
  | "classify"
  | "gradcam"
  | "explain";

export interface PipelineStage {
  id: StageId;
  label: string;
  detail: string;
  status: StageStatus;
  ms?: number;
  output?: string;
  simulated?: boolean;
}

export type LogLevel = "info" | "ok" | "warn" | "error" | "debug";

export interface LogEntry {
  t: number;
  level: LogLevel;
  scope: string;
  message: string;
}

export interface SpecimenMeta {
  id: string;
  name: string;
  source: "sample" | "upload" | "dataset";
  width: number;
  height: number;
  sizeBytes: number;
  mime: string;
  colorProfile: string;
  bitDepth: number;
  synthetic: boolean;
  /** Ground truth when known (synthetic / dataset specimens only). */
  truth?: TissueClass;
  magnification: number;
  dataset: string;
  /** Downsampled for display when the source exceeded viewer limits. */
  displayScale: number;
}

export type ApiErrorCode =
  | "BACKEND_UNAVAILABLE"
  | "INVALID_IMAGE"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT"
  | "SERVER_ERROR";

export class ApiError extends Error {
  code: ApiErrorCode;
  status?: number;
  constructor(code: ApiErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
