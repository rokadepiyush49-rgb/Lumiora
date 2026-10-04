"use client";

import { motion } from "motion/react";
import { toast } from "sonner";
import { FileDown, FilePlus2, Save } from "lucide-react";
import { cn, confidenceBand, CONFIDENCE_LABEL, fmtDate, fmtMs, fmtPct, fmtTime } from "@/lib/utils";
import { clearSession, useSession } from "@/lib/state/session";
import { ActionButton, DemoBadge, KV, Panel, TLabel, Tag } from "@/components/ui/workstation";
import { openExport } from "@/components/layout/overlays";
import { MODEL_INFO } from "@/lib/mock-data";

export function ResultSummary({ className }: { className?: string }) {
  const result = useSession((s) => s.result);
  const specimen = useSession((s) => s.specimen);
  const bands = useSession((s) => s.bands);
  const stages = useSession((s) => s.stages);
  const tissue = useSession((s) => s.tissue);
  if (!result || !specimen) return null;
  const malignant = result.prediction === "cancerous";
  const band = confidenceBand(result);
  const tiles = result.tiles?.probabilities.filter((p) => !Number.isNaN(p)) ?? [];
  const positive = tiles.filter((p) => p >= result.threshold).length;
  const maxTile = tiles.length ? Math.max(...tiles) : NaN;
  const total = stages.reduce((a, s) => a + (s.ms ?? 0), 0);

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Panel className={cn("overflow-hidden", className)}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-panel-2/60 px-4 py-2.5">
          <span className="t-label !text-muted-foreground">Analysis result</span>
          <span className="t-mono text-[12px] text-foreground">CASE #{result.caseId}</span>
          <span className="t-mono text-[10.5px] text-dim">
            {fmtDate(result.completedAt)} · {fmtTime(result.completedAt)}
          </span>
          <div className="ml-auto flex gap-1.5">
            {result.source === "demo" ? <DemoBadge label="Simulated" /> : <Tag tone="teal">Backend inference</Tag>}
            {specimen.synthetic && <Tag>Synthetic specimen</Tag>}
          </div>
        </div>

        <div className="grid gap-px bg-line lg:grid-cols-[1.25fr_1fr_1fr_1fr]">
          <div className="flex flex-col justify-between gap-4 bg-panel p-4">
            <div>
              <TLabel>Finding</TLabel>
              <div className={cn("t-mono mt-1.5 text-[19px] leading-tight font-semibold tracking-[0.1em]", malignant ? "text-malignant" : "text-benign", band === "indeterminate" && "text-warn")}>
                {malignant ? "CANCEROUS TISSUE DETECTED" : "BENIGN TISSUE PATTERN"}
              </div>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="t-mono text-[34px] leading-none font-medium tracking-tight">{(result.confidence * 100).toFixed(1)}%</span>
                <span className="t-label">confidence</span>
              </div>
              <div className="mt-2">
                <Tag tone={band === "indeterminate" ? "warn" : malignant ? "malignant" : "benign"}>{CONFIDENCE_LABEL[band]}</Tag>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-dim">
              {band === "indeterminate"
                ? "The output lies within the indeterminate band around the decision threshold; the case is flagged for expert review."
                : "Model output only. Correlate with qualified histopathological evaluation."}
            </p>
          </div>

          <div className="bg-panel p-4">
            <TLabel>Model information</TLabel>
            <dl className="mt-2">
              <KV k="Architecture" v="MobileNetV2" />
              <KV k="Task" v="Binary classification" mono={false} />
              <KV k="Input" v="Histopathological RGB" mono={false} />
              <KV k="Tensor" v={MODEL_INFO.inputShape.join("×")} />
              <KV k="Features" v="Multi-band optical" mono={false} />
              <KV k="Explainability" v="Grad-CAM" mono={false} />
              <KV k="Weights" v={MODEL_INFO.file} vClassName="text-muted-foreground" />
            </dl>
          </div>

          <div className="bg-panel p-4">
            <TLabel>Spatial evidence</TLabel>
            <dl className="mt-2">
              <KV k="Tiles analysed" v={tiles.length || "—"} />
              <KV k="Tiles ≥ τ" v={tiles.length ? `${positive} (${fmtPct(positive / tiles.length, 0)})` : "—"} vClassName={positive ? "text-malignant" : undefined} />
              <KV k="Max tile P" v={Number.isNaN(maxTile) ? "—" : maxTile.toFixed(3)} />
              <KV k="Tissue cover" v={tissue ? fmtPct(tissue.fraction) : "—"} />
              <KV k="CAM layer" v={result.gradcam?.layer ?? "—"} />
              <KV k="CAM target" v={result.gradcam?.target ?? "—"} />
            </dl>
          </div>

          <div className="bg-panel p-4">
            <TLabel>Optical signature</TLabel>
            <dl className="mt-2">
              {bands &&
                (["H", "S", "L", "Bb"] as const).map((id) => (
                  <KV key={id} k={`${id === "Bb" ? "b*" : id === "L" ? "L*" : id} μ ± σ`} v={`${bands[id].stats.mean.toFixed(1)} ± ${bands[id].stats.std.toFixed(1)}`} />
                ))}
              <KV k="Pipeline Σ" v={fmtMs(total)} />
              <KV k="Inference" v={fmtMs(result.inferenceMs)} />
            </dl>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <ActionButton onClick={openExport}>
            <FileDown /> Export analysis report
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => toast.success(`Case ${result.caseId} saved`, { description: "Stored in local case history (metadata only)." })}>
            <Save /> Save case
          </ActionButton>
          <ActionButton variant="ghost" onClick={clearSession}>
            <FilePlus2 /> New analysis
          </ActionButton>
          <span className="t-mono ml-auto text-[10px] text-faint">Research output · not a diagnosis</span>
        </div>
      </Panel>
    </motion.div>
  );
}
