/**
 * Demo / placeholder data.
 *
 * - MODEL_INFO is NOT placeholder: it is read from spectral_cancer_model.h5
 *   (layer config + weight shapes). Preprocessing fields are assumptions to be
 *   confirmed with the model author.
 * - DEMO_METRICS are placeholder values chosen to be internally consistent
 *   (all headline metrics derive from one confusion matrix). They are not
 *   measured results and every surface that shows them says so.
 * - Dataset statistics for IDC and BreakHis are from the public dataset papers.
 */
import type {
  CaseRecord,
  ConfusionMatrix,
  CurvePoint,
  DatasetName,
  DatasetSpecimen,
  EpochPoint,
  ModelInfo,
  ModelMetrics,
  ReliabilityBin,
  TissueClass,
} from "./types";
import { rng } from "./utils";
import type { SpecimenKind } from "./imaging/specimen-generator";

export const MODEL_INFO: ModelInfo = {
  name: "spectral_cancer_model",
  architecture: "MobileNetV2 · transfer learning",
  file: "spectral_cancer_model.h5",
  framework: "TensorFlow · Keras 3.13.2",
  inputShape: [96, 96, 3],
  output: "Dense(1, sigmoid) → P(cancerous)",
  parameters: { total: 2_422_081, trainable: 164_097, frozen: 2_257_984 },
  head: ["GlobalAveragePooling2D", "Dense(128, ReLU)", "Dropout(0.4)", "Dense(1, Sigmoid)"],
  optimizer: "Adam · lr 1e-3",
  loss: "Binary cross-entropy",
  gradcamLayer: "out_relu",
  gradcamResolution: [3, 3],
  classes: ["benign", "cancerous"],
  threshold: 0.5,
  version: "v0.1-research",
  updatedAt: "2026-09-23T19:11:00Z",
  preprocessing: {
    inputChannels: "RGB · unconfirmed",
    normalization: "MobileNetV2 [-1, 1] · unconfirmed",
    tiling: "96 px tiles, stride 96, background tiles skipped",
  },
};

/* ------------------------------------------------------------ specimens */

export interface DemoSpecimen {
  id: string;
  caseId: string;
  kind: SpecimenKind;
  truth: TissueClass;
  /** Pinned P(cancerous) for the demo narrative. */
  probability: number;
  seed: number;
  width: number;
  height: number;
  label: string;
}

export const DEMO_SPECIMENS: DemoSpecimen[] = [
  { id: "SPECIMEN-001", caseId: "IDC-02481", kind: "idc", truth: "cancerous", probability: 0.942, seed: 2481, width: 1536, height: 1152, label: "Invasive ductal carcinoma pattern" },
  { id: "SPECIMEN-002", caseId: "IDC-02480", kind: "benign", truth: "benign", probability: 0.113, seed: 2480, width: 1536, height: 1152, label: "Benign lobular architecture" },
  { id: "SPECIMEN-003", caseId: "IDC-02479", kind: "mixed", truth: "cancerous", probability: 0.916, seed: 2479, width: 1536, height: 1152, label: "Mixed — focal invasive nests" },
];

export const SYNTHETIC_MPP = 0.25; // nominal µm/px at 40×
export const SYNTHETIC_SCALE = 2.4; // structure scale for 1536-px demo specimens

/* -------------------------------------------------------------- dataset */

export const DATASET_STATS: Record<DatasetName, { title: string; images: string; patients: string; split: string; resolution: string; magnification: string; source: string }> = {
  IDC: {
    title: "Invasive Ductal Carcinoma (IDC) patches",
    images: "277,524 patches",
    patients: "162 whole-mount slides",
    split: "198,738 IDC− / 78,786 IDC+",
    resolution: "50 × 50 px",
    magnification: "40× (scanned)",
    source: "Janowczyk & Madabhushi, 2016",
  },
  BreakHis: {
    title: "Breast Cancer Histopathological Database",
    images: "7,909 images",
    patients: "82 patients",
    split: "2,480 benign / 5,429 malignant",
    resolution: "700 × 460 px",
    magnification: "40× · 100× · 200× · 400×",
    source: "Spanhol et al., 2016",
  },
  Custom: {
    title: "Local research uploads",
    images: "Session-dependent",
    patients: "—",
    split: "Unlabelled unless annotated",
    resolution: "Variable",
    magnification: "Variable",
    source: "User supplied",
  },
};

const BENIGN_SUB = ["Adenosis", "Fibroadenoma", "Phyllodes tumor", "Tubular adenoma"];
const MALIGNANT_SUB = ["Ductal carcinoma", "Lobular carcinoma", "Mucinous carcinoma", "Papillary carcinoma"];

export const DATASET_SPECIMENS: DatasetSpecimen[] = (() => {
  const r = rng(7741);
  const out: DatasetSpecimen[] = [];
  for (let i = 0; i < 48; i++) {
    const m = i % 8;
    const dataset: DatasetName = m < 4 ? "IDC" : m < 7 ? "BreakHis" : "Custom";
    const label: TissueClass = r() < (dataset === "BreakHis" ? 0.66 : 0.38) ? "cancerous" : "benign";
    const mags = [40, 100, 200, 400] as const;
    const magnification = dataset === "BreakHis" ? mags[Math.floor(r() * 4)] : 40;
    const [width, height] = dataset === "IDC" ? [50, 50] : dataset === "BreakHis" ? [700, 460] : r() < 0.5 ? [2048, 1536] : [1024, 768];
    const prefix = dataset === "IDC" ? "IDC" : dataset === "BreakHis" ? "BHX" : "CUS";
    out.push({
      id: `${prefix}-${String(1200 + i * 37).padStart(5, "0")}`,
      dataset,
      label,
      magnification,
      width,
      height,
      patient: `P-${String(Math.floor(r() * 900) + 100)}`,
      seed: 10_000 + i * 97,
      subtype: dataset === "BreakHis" ? (label === "benign" ? BENIGN_SUB : MALIGNANT_SUB)[Math.floor(r() * 4)] : undefined,
    });
  }
  return out;
})();

/* ---------------------------------------------------------------- cases */

export const DEMO_CASES: CaseRecord[] = [
  { caseId: "IDC-02481", specimenId: "SPECIMEN-001", timestamp: "2026-09-24T10:42:18Z", prediction: "cancerous", confidence: 0.942, model: "MobileNetV2", status: "complete", source: "demo", dataset: "IDC" },
  { caseId: "IDC-02480", specimenId: "SPECIMEN-002", timestamp: "2026-09-24T10:31:05Z", prediction: "benign", confidence: 0.887, model: "MobileNetV2", status: "complete", source: "demo", dataset: "IDC" },
  { caseId: "IDC-02479", specimenId: "SPECIMEN-003", timestamp: "2026-09-24T09:58:44Z", prediction: "cancerous", confidence: 0.916, model: "MobileNetV2", status: "complete", source: "demo", dataset: "IDC" },
  { caseId: "IDC-02478", specimenId: "IDC-01533", timestamp: "2026-09-23T16:20:12Z", prediction: "benign", confidence: 0.971, model: "MobileNetV2", status: "complete", source: "demo", dataset: "IDC" },
  { caseId: "IDC-02477", specimenId: "IDC-01496", timestamp: "2026-09-23T15:02:51Z", prediction: "cancerous", confidence: 0.781, model: "MobileNetV2", status: "complete", source: "demo", dataset: "IDC" },
  { caseId: "IDC-02476", specimenId: "IDC-01570", timestamp: "2026-09-23T14:47:09Z", prediction: "benign", confidence: 0.534, model: "MobileNetV2", status: "review", source: "demo", dataset: "IDC", note: "Indeterminate — P within ±0.10 of threshold" },
  { caseId: "BHX-00912", specimenId: "BHX-01348", timestamp: "2026-09-22T11:13:37Z", prediction: "cancerous", confidence: 0.958, model: "MobileNetV2", status: "complete", source: "demo", dataset: "BreakHis" },
  { caseId: "IDC-02475", specimenId: "upload", timestamp: "2026-09-22T10:02:20Z", prediction: null, confidence: null, model: "MobileNetV2", status: "failed", source: "demo", dataset: "Custom", note: "Decode error: truncated PNG stream" },
  { caseId: "BHX-00911", specimenId: "BHX-01385", timestamp: "2026-09-21T17:40:02Z", prediction: "benign", confidence: 0.902, model: "MobileNetV2", status: "complete", source: "demo", dataset: "BreakHis" },
  { caseId: "CUS-00031", specimenId: "CUS-01459", timestamp: "2026-09-21T09:26:48Z", prediction: "cancerous", confidence: 0.689, model: "MobileNetV2", status: "review", source: "demo", dataset: "Custom", note: "Low confidence — stain outside training distribution" },
];

/* -------------------------------------------------------------- metrics */

// Standard normal helpers for the binormal ROC model.
function erf(x: number) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
function PhiInv(p: number) {
  // Acklam's rational approximation
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const CONFUSION: ConfusionMatrix = { tn: 1875, fp: 173, fn: 115, tp: 1837 };

function buildHistory(): EpochPoint[] {
  const r = rng(314);
  const out: EpochPoint[] = [];
  for (let e = 1; e <= 30; e++) {
    const k = 1 - Math.exp(-e / 6.5);
    const trainAcc = 0.74 + 0.215 * k + (r() - 0.5) * 0.006;
    const valAcc = 0.77 + 0.158 * k - Math.max(0, e - 22) * 0.0007 + (r() - 0.5) * 0.012;
    const trainLoss = 0.58 * Math.exp(-e / 7) + 0.12 + (r() - 0.5) * 0.008;
    const valLoss = 0.52 * Math.exp(-e / 7.5) + 0.19 + Math.max(0, e - 20) * 0.0025 + (r() - 0.5) * 0.018;
    out.push({ epoch: e, trainAcc, valAcc, trainLoss, valLoss });
  }
  return out;
}

function buildRoc(a = 2.66, b = 1): { roc: CurvePoint[]; pr: CurvePoint[]; auc: number } {
  const prevalence = (CONFUSION.tp + CONFUSION.fn) / (CONFUSION.tp + CONFUSION.fn + CONFUSION.tn + CONFUSION.fp);
  const roc: CurvePoint[] = [{ x: 0, y: 0, threshold: 1 }];
  const pr: CurvePoint[] = [];
  for (let i = 1; i < 60; i++) {
    const fpr = Math.pow(i / 60, 2.2);
    const tpr = Phi(a + b * PhiInv(fpr));
    roc.push({ x: fpr, y: tpr, threshold: 1 - i / 60 });
    const precision = (tpr * prevalence) / (tpr * prevalence + fpr * (1 - prevalence));
    pr.push({ x: tpr, y: precision });
  }
  roc.push({ x: 1, y: 1, threshold: 0 });
  pr.unshift({ x: 0, y: 1 });
  pr.sort((p, q) => p.x - q.x);
  const auc = Phi(a / Math.sqrt(1 + b * b));
  return { roc, pr, auc };
}

function buildReliability(): { bins: ReliabilityBin[]; ece: number } {
  const bins: ReliabilityBin[] = [];
  const counts = [612, 318, 204, 161, 143, 152, 181, 239, 402, 1588];
  let ece = 0;
  const total = counts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 10; i++) {
    const predicted = (i + 0.5) / 10;
    // mild over-confidence at the extremes, typical of un-calibrated CNNs
    const observed = Math.min(1, Math.max(0, predicted + (predicted - 0.5) * -0.09 + (i === 4 ? 0.03 : 0)));
    bins.push({ bin: i, predicted, observed, count: counts[i] });
    ece += (counts[i] / total) * Math.abs(predicted - observed);
  }
  return { bins, ece };
}

export const DEMO_METRICS: ModelMetrics = (() => {
  const { roc, pr, auc } = buildRoc();
  const { bins, ece } = buildReliability();
  const history = buildHistory();
  return {
    isPlaceholder: true,
    split: "Held-out test split (placeholder)",
    samples: CONFUSION.tn + CONFUSION.fp + CONFUSION.fn + CONFUSION.tp,
    confusion: CONFUSION,
    valLoss: history[history.length - 1].valLoss,
    auc,
    history,
    roc,
    pr,
    reliability: bins,
    ece,
  };
})();

export function metricsFromConfusion(c: ConfusionMatrix) {
  const total = c.tn + c.fp + c.fn + c.tp;
  const accuracy = (c.tp + c.tn) / total;
  const precision = c.tp / (c.tp + c.fp);
  const recall = c.tp / (c.tp + c.fn);
  const specificity = c.tn / (c.tn + c.fp);
  const f1 = (2 * precision * recall) / (precision + recall);
  const npv = c.tn / (c.tn + c.fn);
  return { accuracy, precision, recall, specificity, f1, npv, total };
}

/* ------------------------------------------------------------ endpoints */

export const API_ENDPOINTS = [
  { method: "POST", path: "/api/analyze", summary: "Full pipeline: tiling → inference → Grad-CAM", body: "multipart: image", returns: "prediction, confidence, tiles, gradcam, timings" },
  { method: "POST", path: "/api/spectral-analysis", summary: "RGB/HSV/LAB band decomposition + statistics", body: "multipart: image", returns: "bands{9}: mean, std, histogram" },
  { method: "POST", path: "/api/gradcam", summary: "Grad-CAM for a chosen layer / target class", body: "multipart: image, layer, target", returns: "heatmap PNG (grayscale), layer, shape" },
  { method: "GET", path: "/api/model-info", summary: "Architecture, parameters, preprocessing", body: "—", returns: "ModelInfo" },
  { method: "GET", path: "/api/metrics", summary: "Evaluation metrics for the loaded weights", body: "—", returns: "confusion, curves, history" },
  { method: "GET", path: "/api/cases", summary: "Recent analyses recorded by the server", body: "—", returns: "CaseRecord[]" },
  { method: "GET", path: "/api/health", summary: "Liveness, device, memory, model state", body: "—", returns: "HealthStatus" },
] as const;
