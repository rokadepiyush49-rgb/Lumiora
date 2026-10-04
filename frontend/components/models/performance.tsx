"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, ComposedChart, Area } from "recharts";
import { TriangleAlert } from "lucide-react";
import type { ConfusionMatrix as CM, ModelInfo, ModelMetrics } from "@/lib/types";
import { cn, fmtInt, fmtPct } from "@/lib/utils";
import { useBackend } from "@/lib/state/backend";
import { DEMO_METRICS, MODEL_INFO, metricsFromConfusion } from "@/lib/mock-data";
import { DemoBadge, KV, Panel, PanelHeader, Tag, TLabel } from "@/components/ui/workstation";
import { AXIS, ChartFrame, ChartTooltip, GRID, Legend, SERIES } from "@/components/charts/chart-kit";

function useModelData() {
  const api = useBackend((s) => s.api);
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Model info falls back to the bundled h5 inspection; metrics fall back to
    // labelled placeholders when the server has no recorded evaluation.
    api
      .modelInfo()
      .catch(() => MODEL_INFO)
      .then((i) => {
        if (alive) setInfo(i);
      });
    api
      .metrics()
      .then((m) => {
        if (!alive) return;
        setMetrics(m);
        setFallback(null);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setMetrics(DEMO_METRICS);
        setFallback(api.mode === "connected" ? `Backend reports: ${e.message}` : null);
      });
    return () => {
      alive = false;
    };
  }, [api]);
  return { metrics, info, fallback };
}

function StatTile({ label, value, sub, placeholder }: { label: string; value: string; sub?: string; placeholder?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1 bg-panel px-3.5 py-3", placeholder && "hatch")}>
      <span className="t-label">{label}</span>
      <span className="text-[26px] leading-none font-medium tracking-tight text-foreground">{value}</span>
      {sub && <span className="t-mono text-[10px] text-dim">{sub}</span>}
    </div>
  );
}

/* ------------------------------------------------------ confusion matrix */

type CellKey = "tn" | "fp" | "fn" | "tp";
const CELL_META: Record<CellKey, { name: string; row: string; col: string; note: (c: CM) => string }> = {
  tn: { name: "True negative", row: "Actual benign", col: "Predicted benign", note: (c) => `${fmtInt(c.tn)} benign tiles correctly classified. Specificity ${fmtPct(c.tn / (c.tn + c.fp))}.` },
  fp: { name: "False positive", row: "Actual benign", col: "Predicted cancerous", note: (c) => `${fmtInt(c.fp)} benign tiles flagged as cancerous — over-calls that would add review workload. False-positive rate ${fmtPct(c.fp / (c.tn + c.fp))}.` },
  fn: { name: "False negative", row: "Actual cancerous", col: "Predicted benign", note: (c) => `${fmtInt(c.fn)} malignant tiles missed. In screening this is the costlier error; miss rate ${fmtPct(c.fn / (c.fn + c.tp))}.` },
  tp: { name: "True positive", row: "Actual cancerous", col: "Predicted cancerous", note: (c) => `${fmtInt(c.tp)} malignant tiles detected. Sensitivity (recall) ${fmtPct(c.tp / (c.tp + c.fn))}.` },
};

function ConfusionMatrix({ c, placeholder }: { c: CM; placeholder: boolean }) {
  const [sel, setSel] = useState<CellKey>("fn");
  const max = Math.max(c.tn, c.fp, c.fn, c.tp);
  const rowTotal = { tn: c.tn + c.fp, fp: c.tn + c.fp, fn: c.fn + c.tp, tp: c.fn + c.tp };
  const cell = (k: CellKey) => {
    const v = c[k];
    const t = v / max;
    const diag = k === "tn" || k === "tp";
    return (
      <button
        key={k}
        type="button"
        onClick={() => setSel(k)}
        onMouseEnter={() => setSel(k)}
        onFocus={() => setSel(k)}
        aria-pressed={sel === k}
        aria-label={`${CELL_META[k].name}: ${v}`}
        className={cn("relative flex aspect-[2/1] flex-col items-center justify-center gap-0.5 transition-[box-shadow]", sel === k && "shadow-[inset_0_0_0_2px_var(--foreground)]")}
        style={{ background: `color-mix(in oklch, ${SERIES[0]} ${Math.round(12 + t * 70)}%, #15181b)` }}
      >
        <span className={cn("t-mono text-[22px] leading-none font-medium", t > 0.55 ? "text-[#061013]" : "text-foreground")}>{fmtInt(v)}</span>
        <span className={cn("t-mono text-[10px]", t > 0.55 ? "text-[#061013]/80" : "text-muted-foreground")}>{fmtPct(v / rowTotal[k])} of row</span>
        <span className={cn("t-label absolute top-1.5 left-2 !text-[8.5px]", t > 0.55 ? "!text-[#061013]/70" : "")}>{diag ? (k === "tn" ? "TN" : "TP") : k === "fp" ? "FP" : "FN"}</span>
      </button>
    );
  };
  const m = CELL_META[sel];
  return (
    <ChartFrame
      title="Confusion matrix"
      meta={`n = ${fmtInt(c.tn + c.fp + c.fn + c.tp)} · τ = 0.50`}
      actions={placeholder ? <DemoBadge label="Placeholder" /> : undefined}
      table={{ columns: ["", "Predicted benign", "Predicted cancerous"], rows: [["Actual benign", c.tn, c.fp], ["Actual cancerous", c.fn, c.tp]] }}
    >
      <div className="grid gap-4 p-2 md:grid-cols-[minmax(0,560px)_minmax(220px,360px)]">
        <div className="grid grid-cols-[88px_1fr_1fr] gap-[2px]">
          <span />
          <span className="t-label pb-1 text-center !text-[9px]">Predicted benign</span>
          <span className="t-label pb-1 text-center !text-[9px]">Predicted cancerous</span>
          <span className="t-label flex items-center !text-[9px]">Actual benign</span>
          {cell("tn")}
          {cell("fp")}
          <span className="t-label flex items-center !text-[9px]">Actual cancerous</span>
          {cell("fn")}
          {cell("tp")}
        </div>
        <div className="flex flex-col gap-2 border-l border-line pl-4">
          <TLabel>Interpretation</TLabel>
          <div className="t-mono text-[13px] text-foreground">{m.name}</div>
          <div className="t-mono text-[10px] text-dim">
            {m.row} × {m.col}
          </div>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">{m.note(c)}</p>
          <p className="mt-auto text-[10.5px] leading-snug text-faint">Counts are tile-level. Moving τ trades FN for FP along the ROC curve.</p>
        </div>
      </div>
    </ChartFrame>
  );
}

/* ---------------------------------------------------------------- page */

export function PerformanceDashboard() {
  const { metrics, info, fallback } = useModelData();
  const mode = useBackend((s) => s.mode);
  if (!metrics || !info) {
    return <div className="t-mono p-6 text-[11px] text-dim">Loading metrics…</div>;
  }
  const m = metricsFromConfusion(metrics.confusion);
  const ph = metrics.isPlaceholder;
  const prevalence = (metrics.confusion.tp + metrics.confusion.fn) / m.total;

  return (
    <div className="flex flex-col gap-3 p-3">
      {ph && (
        <div className="hatch flex items-start gap-3 border border-warn/40 px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <div>
            <div className="t-mono text-[11px] font-semibold tracking-[0.14em] text-warn">DEMO / PLACEHOLDER METRICS</div>
            <p className="mt-0.5 max-w-4xl text-[12px] leading-relaxed text-muted-foreground">
              These values are illustrative and internally consistent (all headline metrics derive from one confusion matrix) but they are <strong className="font-medium text-foreground">not measured</strong> on{" "}
              <span className="t-mono">{info.file}</span>. Serve real evaluation results from <span className="t-mono">GET /api/metrics</span> to replace them. They do not describe clinical performance.
            </p>
            {fallback && <p className="t-mono mt-1 text-[10.5px] text-dim">{fallback}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Accuracy" value={fmtPct(m.accuracy)} sub={`${fmtInt(metrics.confusion.tp + metrics.confusion.tn)} / ${fmtInt(m.total)}`} placeholder={ph} />
        <StatTile label="Precision" value={fmtPct(m.precision)} sub="PPV" placeholder={ph} />
        <StatTile label="Recall" value={fmtPct(m.recall)} sub="Sensitivity" placeholder={ph} />
        <StatTile label="F1 score" value={fmtPct(m.f1)} sub="Harmonic mean P/R" placeholder={ph} />
        <StatTile label="Validation loss" value={metrics.valLoss.toFixed(3)} sub="Binary cross-entropy" placeholder={ph} />
        <StatTile label="ROC AUC" value={metrics.auc.toFixed(3)} sub={`Specificity ${fmtPct(m.specificity)}`} placeholder={ph} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <ChartFrame
          title="Training vs validation accuracy"
          meta={`${metrics.history.length} epochs`}
          legend={<Legend items={[{ label: "Training", color: SERIES[0] }, { label: "Validation", color: SERIES[1] }]} />}
          table={{ columns: ["Epoch", "Train acc", "Val acc"], rows: metrics.history.map((h) => [h.epoch, h.trainAcc, h.valAcc]) }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={metrics.history} margin={{ top: 8, right: 48, left: -8, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="epoch" {...AXIS} />
              <YAxis {...AXIS} domain={[0.7, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={44} />
              <Tooltip content={<ChartTooltip labelFmt={(l) => `Epoch ${l}`} valueFmt={(v) => fmtPct(Number(v))} />} cursor={{ stroke: "var(--line-strong)" }} />
              <Line dataKey="trainAcc" name="Training" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} label={endLabel(metrics.history.length, fmtPct)} />
              <Line dataKey="valAcc" name="Validation" stroke={SERIES[1]} strokeWidth={2} dot={false} isAnimationActive={false} label={endLabel(metrics.history.length, fmtPct)} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
        <ChartFrame
          title="Training vs validation loss"
          meta="binary cross-entropy"
          legend={<Legend items={[{ label: "Training", color: SERIES[0] }, { label: "Validation", color: SERIES[1] }]} />}
          table={{ columns: ["Epoch", "Train loss", "Val loss"], rows: metrics.history.map((h) => [h.epoch, h.trainLoss, h.valLoss]) }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={metrics.history} margin={{ top: 8, right: 48, left: -8, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="epoch" {...AXIS} />
              <YAxis {...AXIS} domain={[0, "auto"]} tickFormatter={(v) => v.toFixed(2)} width={44} />
              <Tooltip content={<ChartTooltip labelFmt={(l) => `Epoch ${l}`} valueFmt={(v) => Number(v).toFixed(4)} />} cursor={{ stroke: "var(--line-strong)" }} />
              <Line dataKey="trainLoss" name="Training" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} label={endLabel(metrics.history.length, (v) => v.toFixed(3))} />
              <Line dataKey="valLoss" name="Validation" stroke={SERIES[1]} strokeWidth={2} dot={false} isAnimationActive={false} label={endLabel(metrics.history.length, (v) => v.toFixed(3))} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <ConfusionMatrix c={metrics.confusion} placeholder={ph} />

      <div className="grid gap-3 xl:grid-cols-3">
        <ChartFrame title="ROC curve" meta={`AUC ${metrics.auc.toFixed(3)}`} table={{ columns: ["FPR", "TPR"], rows: metrics.roc.map((p) => [p.x, p.y]) }}>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={metrics.roc} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid {...GRID} vertical />
              <XAxis dataKey="x" type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} {...AXIS} />
              <YAxis {...AXIS} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} width={40} />
              <Tooltip content={<ChartTooltip labelFmt={(l) => `FPR ${Number(l).toFixed(3)}`} valueFmt={(v) => Number(v).toFixed(3)} />} cursor={{ stroke: "var(--line-strong)" }} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--line-strong)" label={{ value: "chance", fill: "var(--dim)", fontSize: 9, position: "insideBottomRight" }} />
              <Area dataKey="y" name="TPR" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.1} isAnimationActive={false} type="monotone" />
              <ReferenceLine x={metrics.confusion.fp / (metrics.confusion.fp + metrics.confusion.tn)} stroke="var(--muted-foreground)" strokeOpacity={0.5} label={{ value: "τ=0.5", fill: "var(--muted-foreground)", fontSize: 9, position: "top" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
        <ChartFrame title="Precision–recall curve" meta={`prevalence ${fmtPct(prevalence)}`} table={{ columns: ["Recall", "Precision"], rows: metrics.pr.map((p) => [p.x, p.y]) }}>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={metrics.pr} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid {...GRID} vertical />
              <XAxis dataKey="x" type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} {...AXIS} />
              <YAxis {...AXIS} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} width={40} />
              <Tooltip content={<ChartTooltip labelFmt={(l) => `Recall ${Number(l).toFixed(3)}`} valueFmt={(v) => Number(v).toFixed(3)} />} cursor={{ stroke: "var(--line-strong)" }} />
              <ReferenceLine y={prevalence} stroke="var(--line-strong)" label={{ value: "no-skill", fill: "var(--dim)", fontSize: 9, position: "insideBottomLeft" }} />
              <Area dataKey="y" name="Precision" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.1} isAnimationActive={false} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
        <ChartFrame
          title="Reliability diagram"
          meta={`ECE ${metrics.ece.toFixed(3)}`}
          table={{ columns: ["Mean predicted", "Observed frequency", "Count"], rows: metrics.reliability.map((b) => [b.predicted, b.observed, b.count]) }}
        >
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid {...GRID} vertical />
              <XAxis dataKey="predicted" type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} {...AXIS} name="predicted" />
              <YAxis dataKey="observed" type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} {...AXIS} width={40} name="observed" />
              <ZAxis dataKey="count" range={[40, 260]} name="tiles" />
              <Tooltip content={<ChartTooltip valueFmt={(v, n) => (n === "tiles" ? String(v) : Number(v).toFixed(3))} />} cursor={{ stroke: "var(--line-strong)" }} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--line-strong)" label={{ value: "perfect calibration", fill: "var(--dim)", fontSize: 9, position: "insideBottomRight" }} />
              <Scatter data={metrics.reliability} fill={SERIES[0]} stroke="#0e1012" strokeWidth={2} line={{ stroke: SERIES[0], strokeWidth: 1.5 }} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="t-mono px-2 pb-1 text-[9.5px] text-faint">Marker area ∝ tiles per bin. Points below the diagonal indicate over-confidence.</p>
        </ChartFrame>
      </div>

      <ModelCard info={info} live={mode === "connected"} />
    </div>
  );
}

function endLabel(n: number, fmt: (v: number) => string) {
  // Direct label at the series end only (selective labelling).
  function Label(props: { x?: number; y?: number; index?: number; value?: number }) {
    if (props.index !== n - 1 || props.value == null) return null;
    return (
      <text x={(props.x ?? 0) + 6} y={(props.y ?? 0) + 3} fontSize={10} fill="var(--muted-foreground)" className="t-mono">
        {fmt(props.value)}
      </text>
    );
  }
  return <Label />;
}

function ModelCard({ info, live }: { info: ModelInfo; live: boolean }) {
  const arch = [
    { k: "Input", v: `${info.inputShape.join(" × ")} · RGB tile`, d: "" },
    { k: "Backbone", v: "MobileNetV2 (ImageNet)", d: `${fmtInt(info.parameters.frozen)} params · frozen` },
    { k: "Feature map", v: "out_relu · 3 × 3 × 1280", d: "Grad-CAM target" },
    ...info.head.map((h) => ({ k: "Head", v: h, d: "" })),
  ];
  return (
    <Panel>
      <PanelHeader index="MC" title="Model card" meta={info.file} actions={<Tag tone="teal">Read from weights file</Tag>} />
      <div className="grid gap-px bg-line lg:grid-cols-3">
        <div className="bg-panel p-3">
          <TLabel>Architecture</TLabel>
          <ol className="mt-2 flex flex-col">
            {arch.map((a, i) => (
              <li key={i} className="flex items-stretch gap-2">
                <div className="flex w-3 flex-col items-center">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal" />
                  {i < arch.length - 1 && <span className="w-px flex-1 bg-line-strong" />}
                </div>
                <div className="pb-2">
                  <div className="t-label !text-[9px]">{a.k}</div>
                  <div className="t-mono text-[11.5px] text-foreground">{a.v}</div>
                  {a.d && <div className="t-mono text-[10px] text-dim">{a.d}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="bg-panel p-3">
          <TLabel>Configuration</TLabel>
          <dl className="mt-2">
            <KV k="Framework" v={info.framework} />
            <KV k="Parameters" v={fmtInt(info.parameters.total)} />
            <KV k="Trainable" v={fmtInt(info.parameters.trainable)} />
            <KV k="Optimizer" v={info.optimizer} />
            <KV k="Loss" v={info.loss} />
            <KV k="Output" v="σ(z) → P(cancerous)" />
            <KV k="Threshold" v={info.threshold.toFixed(2)} />
            <KV k="Version" v={info.version} />
            <KV k="Source" v={live ? "GET /api/model-info" : "Bundled (h5 inspection)"} />
          </dl>
          <TLabel className="mt-3 block">Preprocessing assumptions</TLabel>
          <dl className="mt-1">
            <KV k="Channels" v={info.preprocessing.inputChannels} vClassName="text-warn" />
            <KV k="Scaling" v={info.preprocessing.normalization} vClassName="text-warn" />
            <KV k="Tiling" v={info.preprocessing.tiling} vClassName="text-muted-foreground" />
          </dl>
        </div>
        <div className="flex flex-col gap-3 bg-panel p-3">
          <div>
            <TLabel>Intended use</TLabel>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Research and teaching: exploring multi-band colour features and saliency on H&amp;E breast histopathology tiles.</p>
          </div>
          <div>
            <TLabel>Out of scope</TLabel>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Clinical diagnosis, triage, or any decision about patient care. Other tissue types, stains, scanners, or magnifications without re-validation.</p>
          </div>
          <div>
            <TLabel>Known limitations</TLabel>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-[11.5px] leading-relaxed text-muted-foreground">
              <li>Model sees 3 channels at 96 px; the nine-band analysis is descriptive, not a model input.</li>
              <li>Frozen ImageNet backbone; only the 164k-parameter head was trained.</li>
              <li>Sigmoid outputs are uncalibrated; confidence ≠ probability of disease.</li>
              <li>Grad-CAM at out_relu is 3×3 per tile — coarse localisation.</li>
            </ul>
          </div>
        </div>
      </div>
    </Panel>
  );
}
