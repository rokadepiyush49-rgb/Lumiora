"use client";

import { motion } from "motion/react";
import { CircleAlert, Play, RefreshCw, ServerCrash, TriangleAlert } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import { cn, confidenceBand, CONFIDENCE_LABEL, fmtMs, fmtPct } from "@/lib/utils";
import { retryInDemoMode, runAnalysis, useSession } from "@/lib/state/session";
import { useBackend } from "@/lib/state/backend";
import { ActionButton, KV, Panel, PanelHeader, StatusDot, Tag } from "@/components/ui/workstation";
import { MODEL_INFO } from "@/lib/mock-data";

export function ConfidenceRing({ value, tone, size = 132, label = "Confidence", pending = false }: { value: number | null; tone: "malignant" | "benign" | "warn" | "idle"; size?: number; label?: string; pending?: boolean }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const color = { malignant: "var(--malignant)", benign: "var(--benign)", warn: "var(--warn)", idle: "var(--faint)" }[tone];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--elevated)" strokeWidth={5} />
        {Array.from({ length: 40 }, (_, i) => {
          const a = (i / 40) * Math.PI * 2;
          const r1 = r + 5.5;
          const r2 = r + (i % 5 === 0 ? 8.5 : 7);
          return (
            <line
              key={i}
              x1={(size / 2 + Math.cos(a) * r1).toFixed(2)}
              y1={(size / 2 + Math.sin(a) * r1).toFixed(2)}
              x2={(size / 2 + Math.cos(a) * r2).toFixed(2)}
              y2={(size / 2 + Math.sin(a) * r2).toFixed(2)}
              stroke={i % 5 === 0 ? "var(--line-strong)" : "var(--line)"}
              strokeWidth={1}
            />
          );
        })}
        {pending ? (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--teal)"
            strokeWidth={5}
            strokeDasharray={`${c * 0.18} ${c}`}
            animate={{ rotate: 360 }}
            style={{ originX: "50%", originY: "50%" }}
            transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
          />
        ) : (
          value != null && (
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={5}
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              animate={{ strokeDashoffset: c * (1 - value) }}
              transition={{ duration: 0.9, ease: [0.2, 0, 0, 1] }}
            />
          )
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="t-mono text-[26px] leading-none font-medium tracking-tight text-foreground" aria-live="polite">
          {pending ? "···" : value == null ? "—" : `${(value * 100).toFixed(1)}`}
          {!pending && value != null && <span className="text-[14px] text-muted-foreground">%</span>}
        </span>
        <span className="t-label mt-1.5 !text-[9px]">{label}</span>
      </div>
    </div>
  );
}

/** P(cancerous) on [0,1] with threshold and indeterminate band marked. */
export function ProbabilityMeter({ p, threshold, margin }: { p: number; threshold: number; margin: number }) {
  return (
    <div>
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-2 h-1.5 bg-gradient-to-r from-benign/35 via-elevated to-malignant/40" />
        <div className="hatch absolute top-1 h-3.5 border-x border-warn/50" style={{ left: `${(threshold - margin) * 100}%`, width: `${margin * 200}%` }} title="Indeterminate zone" />
        <div className="absolute top-0 h-5 w-px bg-foreground/60" style={{ left: `${threshold * 100}%` }} />
        <motion.div
          className="absolute top-0 -ml-[5px] h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-foreground"
          initial={{ left: "50%" }}
          animate={{ left: `${p * 100}%` }}
          transition={{ duration: 0.9, ease: [0.2, 0, 0, 1] }}
        />
      </div>
      <div className="t-mono mt-1 flex justify-between text-[9.5px] text-faint">
        <span>0.0 BENIGN</span>
        <span>τ={threshold.toFixed(2)}</span>
        <span>CANCEROUS 1.0</span>
      </div>
    </div>
  );
}

function ResultView({ r }: { r: AnalysisResult }) {
  const band = confidenceBand(r);
  const malignant = r.prediction === "cancerous";
  const tone = band === "indeterminate" ? "warn" : malignant ? "malignant" : "benign";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col">
      {r.source === "demo" && (
        <div className="hatch flex items-start gap-2 border-b border-warn/30 px-3 py-2">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-warn" />
          <p className="text-[10.5px] leading-snug text-warn/90">
            <span className="t-mono font-semibold tracking-[0.1em]">SIMULATED OUTPUT · </span>
            {r.simulationNote}
          </p>
        </div>
      )}
      <div className="flex flex-col items-center gap-3 px-4 pt-4 pb-3">
        <div className="text-center">
          <div className="t-label">Classification</div>
          <div className={cn("t-mono mt-1 text-[20px] font-semibold tracking-[0.16em]", malignant ? "text-malignant" : "text-benign", band === "indeterminate" && "text-warn")}>
            {r.prediction.toUpperCase()}
          </div>
        </div>
        <ConfidenceRing value={r.confidence} tone={tone} />
      </div>
      <div className="border-t border-line px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="t-label">Confidence interpretation</span>
          <Tag tone={band === "high" ? (malignant ? "malignant" : "benign") : band === "indeterminate" ? "warn" : "neutral"}>{CONFIDENCE_LABEL[band]}</Tag>
        </div>
        <ProbabilityMeter p={r.probabilityMalignant} threshold={r.threshold} margin={r.indeterminateMargin} />
      </div>
      <dl className="border-t border-line px-3 py-2">
        <KV k="Prediction" v={malignant ? "Cancerous tissue" : "Benign tissue"} mono={false} />
        <KV k="Confidence" v={fmtPct(r.confidence)} />
        <KV k="P(cancerous)" v={r.probabilityMalignant.toFixed(4)} />
        <KV k="Model" v={`${r.model} · ${r.modelVersion}`} />
        <KV k="Inference" v={fmtMs(r.inferenceMs)} />
        <KV k="Aggregation" v={r.aggregation.replace("Mean of ", "")} vClassName="text-muted-foreground" />
      </dl>
      <p className="border-t border-line px-3 py-2 text-[10.5px] leading-snug text-dim">
        <CircleAlert className="mr-1 inline size-3 -translate-y-px text-faint" />
        Model confidence is not equivalent to clinical diagnosis. Sigmoid outputs are uncalibrated; see reliability analysis under Model Performance.
      </p>
    </motion.div>
  );
}

export function AssessmentPanel({ className }: { className?: string }) {
  const phase = useSession((s) => s.phase);
  const result = useSession((s) => s.result);
  const error = useSession((s) => s.error);
  const stages = useSession((s) => s.stages);
  const mode = useBackend((s) => s.mode);
  const health = useBackend((s) => s.health);
  const modelMissing = mode === "connected" && health && !health.modelLoaded;
  const modelStages = stages.filter((s) => ["features", "classify", "gradcam"].includes(s.id));

  return (
    <Panel className={cn("min-h-0", className)}>
      <PanelHeader index="03" title="AI Assessment" meta={result ? result.caseId : undefined} actions={result?.source === "demo" ? <Tag tone="warn">Demo</Tag> : result ? <Tag tone="teal">Model</Tag> : null} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {modelMissing && phase !== "complete" && (
          <div className="flex items-start gap-2 border-b border-malignant/30 bg-malignant/5 px-3 py-2">
            <ServerCrash className="mt-px size-3.5 shrink-0 text-malignant" />
            <p className="text-[11px] leading-snug text-malignant/90">
              <span className="t-mono font-semibold">MODEL UNAVAILABLE · </span>Backend is reachable but reports no loaded weights. Check <span className="t-mono">MODEL_PATH</span> on the server.
            </p>
          </div>
        )}
        {phase === "complete" && result ? (
          <ResultView r={result} />
        ) : phase === "running" ? (
          <div className="flex flex-col items-center gap-4 px-4 py-6">
            <ConfidenceRing value={null} tone="idle" pending label="Running model" />
            <ul className="t-mono w-full text-[11px]">
              {modelStages.map((s) => (
                <li key={s.id} className="flex items-center gap-2 border-b border-line/50 py-1.5 last:border-0">
                  <StatusDot tone={s.status === "done" ? "ok" : s.status === "running" ? "busy" : s.status === "error" ? "error" : "idle"} />
                  <span className={cn("uppercase tracking-[0.06em]", s.status === "waiting" ? "text-faint" : "text-foreground")}>{s.label}</span>
                  <span className="ml-auto text-dim">{s.status === "done" ? fmtMs(s.ms) : s.status === "running" ? "processing" : "waiting"}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : phase === "error" && error && error.stage !== "input" ? (
          <div className="flex flex-col gap-3 px-4 py-6">
            <div className="flex items-center gap-2 text-malignant">
              <ServerCrash className="size-4" />
              <span className="t-mono text-[11px] font-semibold tracking-[0.12em]">{error.code === "BACKEND_UNAVAILABLE" ? "BACKEND UNAVAILABLE" : error.code === "MODEL_UNAVAILABLE" ? "MODEL UNAVAILABLE" : error.code === "TIMEOUT" ? "INFERENCE TIMEOUT" : "ANALYSIS FAILED"}</span>
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">{error.message}</p>
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="secondary" onClick={() => void runAnalysis()}>
                <RefreshCw /> Retry
              </ActionButton>
              <ActionButton variant="ghost" onClick={() => void retryInDemoMode()}>
                Continue in demo mode
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 px-4 py-6">
            <ConfidenceRing value={null} tone="idle" label={phase === "loaded" ? "Awaiting run" : "No specimen"} />
            <p className="max-w-[240px] text-center text-[11.5px] leading-relaxed text-dim">
              {phase === "loaded" ? "Specimen loaded. Run the pipeline to obtain a classification and saliency map." : "Load a specimen to begin. The classifier operates on 96 × 96 px RGB tiles."}
            </p>
            {phase === "loaded" && (
              <ActionButton onClick={() => void runAnalysis()}>
                <Play /> Analyze specimen
              </ActionButton>
            )}
            <dl className="w-full border-t border-line pt-2">
              <KV k="Model" v="MobileNetV2" />
              <KV k="Input" v={MODEL_INFO.inputShape.join(" × ")} />
              <KV k="Output" v="σ → P(cancerous)" />
              <KV k="Engine" v={mode === "connected" ? "Backend" : "Demo (simulated)"} vClassName={mode === "connected" ? "text-ok" : "text-warn"} />
            </dl>
          </div>
        )}
      </div>
    </Panel>
  );
}
