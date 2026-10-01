"use client";

/**
 * Report export. Everything is generated client-side from the current session.
 * Every format carries the research disclaimer and, for demo runs, an explicit
 * "SIMULATED" marker.
 */
import type { SessionState } from "./state/session";
import { BANDS, download, fmtBytes, fmtMs, fmtPct } from "./utils";
import { canvasToBlob } from "./imaging/load";
import { composeXai } from "./imaging/compose";
import { DEMO_METRICS, MODEL_INFO, metricsFromConfusion } from "./mock-data";

export const DISCLAIMER =
  "Research prototype for educational and experimental use. Model outputs are not medical diagnoses and should not be used as a substitute for qualified clinical evaluation.";

export type ExportKind = "pdf" | "json" | "png" | "bands";

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

function requireResult(s: SessionState) {
  if (!s.result || !s.image || !s.specimen || !s.bands) throw new Error("No completed analysis to export.");
  return { result: s.result, image: s.image, specimen: s.specimen, bands: s.bands };
}

export function buildJson(s: SessionState) {
  const { result, specimen, bands, image } = requireResult(s);
  const g = result.gradcam;
  let grid: number[][] | null = null;
  if (g) {
    grid = [];
    for (let y = 0; y < g.height; y++) grid.push(Array.from(g.values.slice(y * g.width, (y + 1) * g.width), (v) => Math.round(v * 1000) / 1000));
  }
  return {
    schema: "nexus-path/analysis@1",
    generated_at: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    simulated: result.source === "demo",
    simulation_note: result.simulationNote ?? null,
    case_id: result.caseId,
    specimen: {
      id: specimen.id,
      filename: specimen.name,
      source: specimen.source,
      synthetic: specimen.synthetic,
      width: specimen.width,
      height: specimen.height,
      size_bytes: specimen.sizeBytes,
      color_profile: specimen.colorProfile,
      bit_depth: specimen.bitDepth,
      magnification_nominal: specimen.magnification,
      dataset: specimen.dataset,
      analysis_raster: [image.work.width, image.work.height],
    },
    prediction: {
      label: result.prediction,
      confidence: result.confidence,
      probability_malignant: result.probabilityMalignant,
      threshold: result.threshold,
      indeterminate_margin: result.indeterminateMargin,
      aggregation: result.aggregation,
    },
    model: {
      name: result.model,
      version: result.modelVersion,
      file: MODEL_INFO.file,
      input_shape: MODEL_INFO.inputShape,
      parameters: MODEL_INFO.parameters,
      preprocessing: MODEL_INFO.preprocessing,
    },
    timings_ms: Object.fromEntries(s.stages.map((st) => [st.id, st.ms != null ? Math.round(st.ms * 10) / 10 : null])),
    bands: Object.fromEntries(
      BANDS.map((b) => {
        const st = bands[b.id].stats;
        return [b.id, { name: b.name, space: b.space, range: b.range, mean: st.mean, std: st.std, variance: st.variance, min: st.min, max: st.max, median: st.median, entropy_bits: st.entropy, histogram: st.histogram }];
      }),
    ),
    tiles: result.tiles && {
      tile_size: result.tiles.tileSize,
      stride: result.tiles.stride,
      cols: result.tiles.cols,
      rows: result.tiles.rows,
      probabilities: result.tiles.probabilities.map((p) => (Number.isNaN(p) ? null : Math.round(p * 10000) / 10000)),
    },
    gradcam: g && { layer: g.layer, feature_map: g.featureMap, target: g.target, grid_shape: [g.height, g.width], grid },
  };
}

async function heatmapCanvas(s: SessionState, maxW = 2048) {
  const { image, result } = requireResult(s);
  const w = Math.min(maxW, image.width);
  const h = Math.round((w * image.height) / image.width);
  return composeXai("overlay", image.display, result.gradcam, s.view.colormap, s.view.heatOpacity, w, h);
}

function bandsCsv(s: SessionState) {
  const { bands } = requireResult(s);
  const head = ["band", "name", "space", "range_min", "range_max", "mean", "std", "variance", "min", "max", "median", "entropy_bits", ...Array.from({ length: 256 }, (_, i) => `h${i}`)];
  const rows = BANDS.map((b) => {
    const st = bands[b.id].stats;
    return [b.id === "Bb" ? "b*" : b.glyph, b.name, b.space, b.range[0], b.range[1], st.mean.toFixed(4), st.std.toFixed(4), st.variance.toFixed(4), st.min, st.max, st.median, st.entropy.toFixed(4), ...st.histogram];
  });
  return `# ${DISCLAIMER}\n${head.join(",")}\n${rows.map((r) => r.join(",")).join("\n")}\n`;
}

async function buildPdf(s: SessionState) {
  const { result, image, specimen, bands } = requireResult(s);
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 14;
  const demo = result.source === "demo";
  const ink = (g: number) => doc.setTextColor(g, g, g);
  const label = (t: string, x: number, y: number) => {
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    ink(110);
    doc.text(t.toUpperCase(), x, y);
  };
  const value = (t: string, x: number, y: number, size = 9, mono = true) => {
    doc.setFont(mono ? "courier" : "helvetica", "normal");
    doc.setFontSize(size);
    ink(20);
    doc.text(t, x, y);
  };
  const rule = (y: number) => {
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(M, y, W - M, y);
  };

  // header
  doc.setFillColor(14, 17, 21);
  doc.rect(0, 0, W, 22, "F");
  doc.setFont("courier", "bold");
  doc.setFontSize(12);
  doc.setTextColor(120, 205, 220);
  doc.text("NEXUS PATH", M, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(170);
  doc.text("Computational Histopathology · Analysis Report", M, 15.5);
  doc.setFont("courier", "normal");
  doc.text(`CASE ${result.caseId}`, W - M, 10, { align: "right" });
  doc.text(new Date(result.completedAt).toUTCString(), W - M, 15.5, { align: "right" });

  let y = 30;
  if (demo) {
    doc.setFillColor(255, 244, 214);
    doc.setDrawColor(210, 160, 40);
    doc.rect(M, y - 4.5, W - 2 * M, 10, "FD");
    doc.setFont("courier", "bold");
    doc.setFontSize(8);
    doc.setTextColor(120, 80, 0);
    doc.text("SIMULATED OUTPUT — DEMO MODE", M + 3, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(result.simulationNote ?? "", M + 3, y + 4);
    y += 12;
  }

  // result block
  label("Analysis result", M, y);
  doc.setFont("courier", "bold");
  doc.setFontSize(16);
  if (result.prediction === "cancerous") doc.setTextColor(190, 60, 45);
  else doc.setTextColor(30, 130, 110);
  doc.text(result.prediction === "cancerous" ? "CANCEROUS TISSUE DETECTED" : "BENIGN TISSUE PATTERN", M, y + 8);
  label("Confidence", 140, y);
  value(fmtPct(result.confidence), 140, y + 8, 16);
  y += 14;
  value(`P(cancerous) = ${result.probabilityMalignant.toFixed(4)} · threshold ${result.threshold} · indeterminate ±${result.indeterminateMargin}`, M, y, 8);
  y += 4;
  value(`Aggregation: ${result.aggregation}`, M, y, 8);
  y += 5;
  rule(y);
  y += 6;

  // images
  const iw = (W - 2 * M - 8) / 3;
  const ih = (iw * image.height) / image.width;
  const modes = [
    ["original", "ORIGINAL"],
    ["heatmap", demo ? "SALIENCY (SIMULATED)" : "GRAD-CAM HEATMAP"],
    ["overlay", "OVERLAY"],
  ] as const;
  modes.forEach(([m, t], i) => {
    const c = composeXai(m, image.display, result.gradcam, s.view.colormap, s.view.heatOpacity, 600, Math.round((600 * image.height) / image.width));
    doc.addImage(c.toDataURL("image/jpeg", 0.88), "JPEG", M + i * (iw + 4), y, iw, ih);
    label(t, M + i * (iw + 4), y + ih + 4);
  });
  y += ih + 9;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  ink(90);
  doc.text(
    doc.splitTextToSize(
      `Highlighted regions represent image features that contributed to the model prediction (layer ${result.gradcam?.layer ?? "—"}, ${result.gradcam?.featureMap.join("×") ?? "—"}). They should not be interpreted as definitive tumor boundaries.`,
      W - 2 * M,
    ),
    M,
    y,
  );
  y += 9;
  rule(y);
  y += 6;

  // two-column: specimen / model
  const col2 = W / 2 + 2;
  label("Specimen metadata", M, y);
  label("Model", col2, y);
  y += 5;
  const specRows: [string, string][] = [
    ["Specimen", specimen.id],
    ["File", specimen.name],
    ["Dimensions", `${specimen.width} x ${specimen.height} px`],
    ["File size", fmtBytes(specimen.sizeBytes)],
    ["Colour", specimen.colorProfile],
    ["Magnification", `${specimen.magnification}x (nominal)`],
    ["Dataset", specimen.dataset],
    ["Synthetic", specimen.synthetic ? "yes (procedural)" : "no"],
  ];
  const modelRows: [string, string][] = [
    ["Architecture", "MobileNetV2 (transfer learning)"],
    ["Weights", MODEL_INFO.file],
    ["Task", "Binary classification"],
    ["Input", `${MODEL_INFO.inputShape.join(" x ")} tiles`],
    ["Features", "Multi-band optical (RGB/HSV/LAB)"],
    ["Explainability", "Grad-CAM"],
    ["Version", result.modelVersion],
    ["Inference", fmtMs(result.inferenceMs)],
  ];
  specRows.forEach(([k, v], i) => {
    label(k, M, y + i * 4.6);
    value(v.length > 34 ? v.slice(0, 33) + "…" : v, M + 26, y + i * 4.6, 7.5);
  });
  modelRows.forEach(([k, v], i) => {
    label(k, col2, y + i * 4.6);
    value(v, col2 + 26, y + i * 4.6, 7.5);
  });
  y += specRows.length * 4.6 + 3;
  rule(y);
  y += 6;

  // bands table
  label("Optical band statistics (OpenCV 8-bit conventions)", M, y);
  y += 5;
  const cols = ["Band", "Space", "Mean", "Std", "Var", "Min", "Max", "Entropy"];
  const cx = [M, M + 22, M + 42, M + 62, M + 82, M + 104, M + 120, M + 136];
  cols.forEach((c, i) => label(c, cx[i], y));
  y += 4;
  BANDS.forEach((b) => {
    const st = bands[b.id].stats;
    const v = [b.glyph, b.space, st.mean.toFixed(1), st.std.toFixed(1), st.variance.toFixed(0), String(st.min), String(st.max), `${st.entropy.toFixed(2)} b`];
    v.forEach((t, i) => value(t, cx[i], y, 7.5));
    y += 4.1;
  });
  y += 2;
  rule(y);
  y += 6;

  // timings + performance metadata
  label("Pipeline timings", M, y);
  label("Performance metadata", col2, y);
  y += 5;
  const timingRows = s.stages.map((st) => [st.label, st.status === "done" ? `${fmtMs(st.ms)}${st.simulated ? " (sim)" : ""}` : st.status] as [string, string]);
  timingRows.forEach(([k, v], i) => {
    label(k, M, y + i * 4.3);
    value(v, M + 44, y + i * 4.3, 7.5);
  });
  const m = metricsFromConfusion(DEMO_METRICS.confusion);
  const perf: [string, string][] = [
    ["Accuracy", fmtPct(m.accuracy)],
    ["Precision", fmtPct(m.precision)],
    ["Recall", fmtPct(m.recall)],
    ["F1", fmtPct(m.f1)],
    ["ROC AUC", DEMO_METRICS.auc.toFixed(3)],
    ["Status", "PLACEHOLDER — not measured"],
  ];
  perf.forEach(([k, v], i) => {
    label(k, col2, y + i * 4.3);
    value(v, col2 + 26, y + i * 4.3, 7.5);
  });

  // footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(210);
    doc.line(M, 280, W - M, 280);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    ink(110);
    doc.text(doc.splitTextToSize(DISCLAIMER, W - 2 * M - 20), M, 284);
    doc.setFont("courier", "normal");
    doc.text(`${p}/${pages}`, W - M, 284, { align: "right" });
  }
  return doc;
}

export async function exportAnalysis(kind: ExportKind, s: SessionState) {
  const { result } = requireResult(s);
  const base = `${result.caseId}_${stamp()}${result.source === "demo" ? "_SIMULATED" : ""}`;
  switch (kind) {
    case "json":
      download(new Blob([JSON.stringify(buildJson(s), null, 2)], { type: "application/json" }), `${base}.json`);
      return `${base}.json`;
    case "png": {
      const c = await heatmapCanvas(s);
      download(await canvasToBlob(c), `${base}_gradcam.png`);
      return `${base}_gradcam.png`;
    }
    case "bands":
      download(new Blob([bandsCsv(s)], { type: "text/csv" }), `${base}_bands.csv`);
      return `${base}_bands.csv`;
    case "pdf": {
      const doc = await buildPdf(s);
      doc.save(`${base}_report.pdf`);
      return `${base}_report.pdf`;
    }
  }
}
