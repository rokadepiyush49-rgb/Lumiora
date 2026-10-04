"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, FileJson, FileText, ImageDown, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionButton, DemoBadge, TLabel } from "@/components/ui/workstation";
import { sessionStore, useSession } from "@/lib/state/session";
import { exportAnalysis, type ExportKind } from "@/lib/export";

const OPTIONS: { id: ExportKind; label: string; ext: string; icon: React.ReactNode; desc: string }[] = [
  { id: "pdf", label: "PDF report", ext: ".pdf", icon: <FileText />, desc: "Case summary, images, band table, timings, disclaimer" },
  { id: "json", label: "JSON results", ext: ".json", icon: <FileJson />, desc: "Machine-readable prediction, tiles, Grad-CAM grid, histograms" },
  { id: "png", label: "PNG heatmap", ext: ".png", icon: <ImageDown />, desc: "Grad-CAM overlay at display resolution (≤2048 px)" },
  { id: "bands", label: "Band analysis", ext: ".csv", icon: <Table2 />, desc: "Per-band statistics + 256-bin histograms" },
];

const CONTENTS = ["Case ID", "Image metadata", "Prediction", "Confidence", "Model", "Spectral bands", "Grad-CAM visualisation", "Performance metadata", "Research disclaimer"];

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const result = useSession((s) => s.result);
  const [sel, setSel] = useState<Set<ExportKind>>(new Set(["pdf", "json"]));
  const [busy, setBusy] = useState(false);
  const toggle = (k: ExportKind) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const run = async () => {
    setBusy(true);
    try {
      const files: string[] = [];
      for (const k of OPTIONS.map((o) => o.id).filter((k) => sel.has(k))) {
        files.push(await exportAnalysis(k, sessionStore.get()));
      }
      toast.success(`Exported ${files.length} file${files.length > 1 ? "s" : ""}`, { description: files.join(" · ") });
      onOpenChange(false);
    } catch (e) {
      toast.error("Export failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-[4px] border border-line-strong bg-panel p-0 sm:max-w-[620px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle className="t-label flex items-center gap-2 !text-[11px] !text-foreground">
            Export analysis report {result?.source === "demo" && <DemoBadge label="Simulated" />}
          </DialogTitle>
          <DialogDescription className="text-[11.5px]">
            {result ? (
              <>
                Case <span className="t-mono text-foreground">{result.caseId}</span> · generated locally in the browser.
                {result.source === "demo" && " Files are marked SIMULATED in name and content."}
              </>
            ) : (
              "Run an analysis to enable export."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_180px]">
          <div className="flex flex-col gap-1.5" role="group" aria-label="Export formats">
            {OPTIONS.map((o) => {
              const on = sel.has(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(o.id)}
                  className={cn("flex items-center gap-3 border px-3 py-2.5 text-left transition-colors", on ? "border-teal/50 bg-teal/5" : "border-line bg-panel-2/40 hover:border-line-strong")}
                >
                  <span className={cn("flex size-4 shrink-0 items-center justify-center border", on ? "border-teal bg-teal text-black" : "border-line-strong")}>{on && <Check className="size-3" strokeWidth={3} />}</span>
                  <span className="text-dim [&_svg]:size-4">{o.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[12.5px] text-foreground">{o.label}</span>
                      <span className="t-mono text-[10px] text-faint">{o.ext}</span>
                    </span>
                    <span className="block truncate text-[11px] text-dim">{o.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border border-line bg-viewport/60 p-3">
            <TLabel>Report contains</TLabel>
            <ul className="mt-2 flex flex-col gap-1">
              {CONTENTS.map((c) => (
                <li key={c} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Check className="size-3 text-teal" /> {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <span className="t-mono text-[10.5px] text-faint">{sel.size} format{sel.size === 1 ? "" : "s"} selected</span>
          <div className="flex gap-2">
            <ActionButton variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </ActionButton>
            <ActionButton onClick={run} disabled={!result || sel.size === 0 || busy}>
              {busy ? "Generating…" : "Export"}
            </ActionButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
