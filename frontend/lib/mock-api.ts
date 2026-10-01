/**
 * Demo-mode implementation of NexusApi. Runs entirely in the browser.
 * Classification and Grad-CAM are SIMULATED (see lib/imaging/saliency.ts);
 * results carry source: "demo" and a simulationNote so the UI can label them.
 */
import type { AnalyzeInput, NexusApi } from "./api";
import type { AnalysisResult, BandId } from "./types";
import { DEMO_CASES, DEMO_METRICS, MODEL_INFO } from "./mock-data";
import { simulateGradCam, simulateInference, type GradCamLayer } from "./imaging/saliency";
import { BAND_IDS, rng, sleep } from "./utils";

function jitter(seed: number, base: number, spread: number) {
  return Math.round(base + (rng(seed)() - 0.5) * spread);
}

async function simulate(input: AnalyzeInput, signal?: AbortSignal): Promise<AnalysisResult> {
  const t0 = performance.now();
  const sim = simulateInference(input.bands, input.width, input.height, { seed: input.seed, fixedProbability: input.fixedProbability });
  const compute = performance.now() - t0;
  // Simulated network latency, shaped like MobileNetV2 CPU inference on ~100 tiles.
  const features = jitter(input.seed, 118, 30);
  const classify = jitter(input.seed + 1, 34, 10);
  const gradcam = jitter(input.seed + 2, 21, 8);
  await sleep(features + classify + gradcam);
  if (signal?.aborted) throw new Error("cancelled");
  const p = sim.probability;
  const prediction = p >= MODEL_INFO.threshold ? "cancerous" : "benign";
  return {
    caseId: input.caseId,
    prediction,
    confidence: prediction === "cancerous" ? p : 1 - p,
    probabilityMalignant: p,
    threshold: MODEL_INFO.threshold,
    indeterminateMargin: 0.1,
    model: "MobileNetV2",
    modelVersion: MODEL_INFO.version,
    inferenceMs: features + classify + gradcam + 11,
    timings: { features, classify, gradcam, total: features + classify + gradcam + Math.round(compute) },
    gradcam: sim.gradcam,
    tiles: sim.tiles,
    aggregation: "Mean of top-15% tile probabilities",
    source: "demo",
    simulationNote:
      input.fixedProbability != null
        ? "Curated demo specimen: output is a fixed illustrative value, not model inference."
        : "No model connected: output simulated from a hematoxylin-density heuristic, not model inference.",
    completedAt: new Date().toISOString(),
  };
}

export function createDemoApi(): NexusApi {
  return {
    mode: "demo",
    async health() {
      return {
        status: "degraded",
        modelLoaded: false,
        device: "CPU",
        deviceName: "Browser (demo engine)",
        version: "demo",
        lastModelUpdate: MODEL_INFO.updatedAt,
      };
    },
    async modelInfo() {
      return MODEL_INFO;
    },
    async metrics() {
      return DEMO_METRICS;
    },
    async cases() {
      return DEMO_CASES;
    },
    analyze: simulate,
    async gradcam(input, opts) {
      await sleep(60);
      return simulateGradCam(input.bands, (opts.layer ?? "out_relu") as GradCamLayer, opts.target ?? "cancerous");
    },
    async spectral(input) {
      const bands: Record<string, { mean: number; std: number; histogram: number[] }> = {};
      BAND_IDS.forEach((id: BandId) => {
        const s = input.bands[id].stats;
        bands[id] = { mean: s.mean, std: s.std, histogram: s.histogram };
      });
      return { bands, ms: 0 };
    },
  };
}
