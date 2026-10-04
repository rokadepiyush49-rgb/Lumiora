"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpDown, Eye, FileDown, RotateCcw, Search } from "lucide-react";
import type { CaseRecord, CaseStatus } from "@/lib/types";
import { cn, download, fmtDate, fmtPct, fmtTime } from "@/lib/utils";
import { useBackend } from "@/lib/state/backend";
import { loadDataset, loadDemo, runAnalysis, sessionStore, useSession } from "@/lib/state/session";
import { DATASET_SPECIMENS, DEMO_SPECIMENS } from "@/lib/mock-data";
import { DemoBadge, Segmented, StatusDot, Tag, ToolButton } from "@/components/ui/workstation";
import { openExport } from "@/components/layout/overlays";
import { DISCLAIMER } from "@/lib/export";

export function useCases() {
  const api = useBackend((s) => s.api);
  const local = useSession((s) => s.history);
  const [remote, setRemote] = useState<CaseRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .cases()
      .then((c) => alive && (setRemote(c), setError(null)))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [api]);
  return useMemo(() => {
    const seen = new Set(local.map((c) => c.caseId));
    return { cases: [...local, ...remote.filter((c) => !seen.has(c.caseId))].sort((a, b) => b.timestamp.localeCompare(a.timestamp)), error, mode: api.mode };
  }, [local, remote, error, api.mode]);
}

const STATUS_TONE: Record<CaseStatus, "ok" | "warn" | "error" | "busy"> = { complete: "ok", review: "warn", failed: "error", running: "busy" };

function canReload(c: CaseRecord) {
  return !!DEMO_SPECIMENS.find((d) => d.id === c.specimenId) || !!DATASET_SPECIMENS.find((d) => d.id === c.specimenId);
}

async function reload(c: CaseRecord) {
  const demo = DEMO_SPECIMENS.find((d) => d.id === c.specimenId);
  if (demo) return loadDemo(demo.id);
  const ds = DATASET_SPECIMENS.find((d) => d.id === c.specimenId);
  if (ds) return loadDataset(ds);
}

export function CaseTable({ limit, controls = false, className }: { limit?: number; controls?: boolean; className?: string }) {
  const { cases, mode } = useCases();
  const router = useRouter();
  const currentCase = useSession((s) => s.result?.caseId);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | CaseStatus>("all");
  const [sortDesc, setSortDesc] = useState(true);

  const rows = useMemo(() => {
    let r = cases.filter((c) => (status === "all" || c.status === status) && (!q || `${c.caseId} ${c.specimenId} ${c.dataset} ${c.prediction ?? ""}`.toLowerCase().includes(q.toLowerCase())));
    if (!sortDesc) r = [...r].reverse();
    return limit ? r.slice(0, limit) : r;
  }, [cases, q, status, sortDesc, limit]);

  const view = async (c: CaseRecord, rerun = false) => {
    if (!canReload(c)) {
      toast("Specimen image not retained", { description: "Only metadata is stored for uploaded specimens. Re-upload the file to re-analyse." });
      return;
    }
    router.push("/analysis");
    await reload(c);
    if (rerun) await runAnalysis();
  };

  const exportRow = (c: CaseRecord) => {
    if (c.caseId === currentCase && sessionStore.get().phase === "complete") return openExport();
    download(new Blob([JSON.stringify({ disclaimer: DISCLAIMER, simulated: c.source === "demo", ...c }, null, 2)], { type: "application/json" }), `${c.caseId}_record.json`);
  };

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {controls && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2 size-3.5 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search case, specimen, dataset…"
              aria-label="Search cases"
              className="t-mono h-7 w-64 rounded-[3px] border border-line bg-viewport pr-2 pl-7 text-[11.5px] text-foreground outline-none placeholder:text-faint focus:border-teal"
            />
          </label>
          <Segmented<"all" | CaseStatus>
            label="Status filter"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "complete", label: "Complete" },
              { value: "review", label: "Review" },
              { value: "failed", label: "Failed" },
            ]}
          />
          <span className="t-mono ml-auto text-[10.5px] text-faint">{rows.length} records</span>
          {mode === "demo" && <DemoBadge />}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              {[
                ["Case ID", "w-[130px]"],
                ["Timestamp", "w-[150px]"],
                ["Classification", ""],
                ["Confidence", "w-[150px]"],
                ["Model", "w-[120px]"],
                ["Status", "w-[110px]"],
                ["", "w-[96px]"],
              ].map(([h, w], i) => (
                <th key={i} className={cn("t-label px-3 py-2 !text-[9.5px] font-medium", w)}>
                  {h === "Timestamp" ? (
                    <button type="button" onClick={() => setSortDesc((v) => !v)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {h} <ArrowUpDown className="size-3" />
                    </button>
                  ) : (
                    h
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.caseId} className="group border-b border-line/60 transition-colors hover:bg-panel-2/70">
                <td className="t-mono px-3 py-2 text-[11.5px] text-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    {c.caseId}
                    {c.caseId === currentCase && <span className="size-1 rounded-full bg-teal" title="Current session" />}
                  </span>
                </td>
                <td className="t-mono px-3 py-2 text-[11px] text-muted-foreground">
                  {fmtDate(c.timestamp)} <span className="text-faint">{fmtTime(c.timestamp).slice(0, 5)}</span>
                </td>
                <td className="px-3 py-2 text-[12px]">
                  {c.prediction ? (
                    <span className={cn("inline-flex items-center gap-1.5", c.prediction === "cancerous" ? "text-malignant" : "text-benign")}>
                      <span className={cn("size-1.5 rounded-full", c.prediction === "cancerous" ? "bg-malignant" : "bg-benign")} />
                      {c.prediction === "cancerous" ? "Cancerous" : "Benign"}
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                  {c.note && <span className="ml-2 text-[10.5px] text-dim">{c.note}</span>}
                </td>
                <td className="px-3 py-2">
                  {c.confidence != null ? (
                    <div className="flex items-center gap-2">
                      <span className="t-mono w-11 text-[11.5px] text-foreground">{fmtPct(c.confidence)}</span>
                      <div className="h-1 w-16 bg-elevated">
                        <div className={cn("h-full", c.confidence >= 0.9 ? "bg-teal" : c.confidence >= 0.75 ? "bg-teal/60" : "bg-warn")} style={{ width: `${c.confidence * 100}%` }} />
                      </div>
                    </div>
                  ) : (
                    <span className="t-mono text-[11px] text-faint">—</span>
                  )}
                </td>
                <td className="t-mono px-3 py-2 text-[11px] text-muted-foreground">{c.model}</td>
                <td className="px-3 py-2">
                  <span className="t-mono inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                    <StatusDot tone={STATUS_TONE[c.status]} />
                    {c.status}
                  </span>
                  {c.source === "demo" && <Tag className="ml-1.5 !h-4 !px-1 !text-[8.5px]">demo</Tag>}
                </td>
                <td className="px-2 py-1">
                  <div className="flex justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                    <ToolButton label="View" onClick={() => void view(c)} className="size-6">
                      <Eye />
                    </ToolButton>
                    <ToolButton label="Re-analyze" onClick={() => void view(c, true)} className="size-6">
                      <RotateCcw />
                    </ToolButton>
                    <ToolButton label="Export record" onClick={() => exportRow(c)} className="size-6">
                      <FileDown />
                    </ToolButton>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="t-mono px-3 py-8 text-center text-[11px] text-faint">
                  No matching records
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
