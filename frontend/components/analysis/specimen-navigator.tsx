"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Play, Plus, Square, Upload } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { cn, fmtBytes, fmtPct, fmtTime } from "@/lib/utils";
import { cancelRun, loadDemo, loadFile, runAnalysis, useSession } from "@/lib/state/session";
import { DEMO_SPECIMENS } from "@/lib/mock-data";
import { demoThumbnail } from "@/lib/specimens";
import { ActionButton, KV, Panel, PanelHeader, StatusDot, Tag, ToolButton } from "@/components/ui/workstation";

function Thumb({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const d = DEMO_SPECIMENS.find((x) => x.id === id);
    if (!d) return;
    const h = window.setTimeout(() => setSrc(demoThumbnail(d, 96, 72)), 30);
    return () => window.clearTimeout(h);
  }, [id]);
  return (
    <div className="h-9 w-12 shrink-0 overflow-hidden border border-line bg-viewport">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
    </div>
  );
}

export function SpecimenNavigator({ className }: { className?: string }) {
  const specimen = useSession((s) => s.specimen);
  const caseId = useSession((s) => s.caseId);
  const phase = useSession((s) => s.phase);
  const history = useSession((s) => s.history);
  const stages = useSession((s) => s.stages);
  const running = stages.find((s) => s.status === "running");
  const { getInputProps, open } = useDropzone({
    accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"] },
    maxFiles: 1,
    noDrag: true,
    onDrop: (f) => f[0] && void loadFile(f[0]),
  });

  const recentRuns = history.slice(0, 4);

  return (
    <Panel className={cn("min-h-0", className)}>
      <PanelHeader
        index="01"
        title="Cases"
        actions={
          <>
            <input {...getInputProps()} aria-label="Upload specimen" />
            <ToolButton label="Load specimen from disk" onClick={open}>
              <Upload />
            </ToolButton>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="px-2 pt-2">
          <div className="t-label px-1 pb-1 !text-[9.5px]">Demo specimens</div>
          <ul className="flex flex-col gap-px">
            {DEMO_SPECIMENS.map((d) => {
              const active = specimen?.id === d.id;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => void loadDemo(d.id)}
                    aria-current={active}
                    className={cn(
                      "group flex w-full items-center gap-2.5 border border-transparent px-1.5 py-1.5 text-left transition-colors hover:bg-elevated/70",
                      active && "border-line-strong bg-elevated",
                    )}
                  >
                    <Thumb id={d.id} />
                    <span className="min-w-0 flex-1">
                      <span className="t-mono flex items-center gap-1.5 text-[11.5px] text-foreground">
                        {d.caseId}
                        {active && <StatusDot tone={phase === "running" ? "busy" : phase === "complete" ? "ok" : "teal"} />}
                      </span>
                      <span className="block truncate text-[10.5px] text-dim">{d.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {recentRuns.length > 0 && (
          <div className="px-2 pt-3">
            <div className="t-label px-1 pb-1 !text-[9.5px]">This session</div>
            <ul className="flex flex-col">
              {recentRuns.map((r) => (
                <li key={r.caseId} className="t-mono flex items-center gap-2 border-b border-line/50 px-1.5 py-1 text-[10.5px] last:border-0">
                  <span className={cn("size-1.5 rounded-full", r.prediction === "cancerous" ? "bg-malignant" : "bg-benign")} />
                  <span className="text-foreground">{r.caseId}</span>
                  <span className="ml-auto text-dim">{fmtPct(r.confidence)}</span>
                  <span className="text-faint">{fmtTime(r.timestamp).slice(0, 5)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto border-t border-line px-3 py-2.5">
          <div className="t-label mb-1 flex items-center justify-between !text-[9.5px]">
            Specimen
            {specimen?.synthetic && <Tag className="!h-4 !text-[9px]">Synthetic</Tag>}
          </div>
          {specimen ? (
            <dl>
              <KV k="File" v={specimen.name} />
              <KV k="Case" v={caseId} />
              <KV k="Dimensions" v={`${specimen.width} × ${specimen.height}`} />
              <KV k="Size" v={fmtBytes(specimen.sizeBytes)} />
              <KV k="Color" v={specimen.colorProfile.split(" · ")[0]} />
              <KV k="Bit depth" v={`${specimen.bitDepth}-bit`} />
              <KV
                k="Status"
                v={
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone={phase === "running" ? "busy" : phase === "complete" ? "ok" : phase === "error" ? "error" : "teal"} />
                    {phase === "running" ? running?.label ?? "Running" : phase === "complete" ? "Analyzed" : phase === "error" ? "Error" : "Ready"}
                  </span>
                }
              />
            </dl>
          ) : (
            <p className="py-1 text-[11px] text-dim">No specimen selected.</p>
          )}
          <div className="mt-2.5 flex gap-1.5">
            {phase === "running" ? (
              <ActionButton variant="secondary" className="flex-1" onClick={cancelRun}>
                <Square /> Cancel run
              </ActionButton>
            ) : (
              <ActionButton className="flex-1" disabled={!specimen || phase === "loading"} onClick={() => void runAnalysis()}>
                <Play /> {phase === "complete" ? "Re-analyze" : "Analyze specimen"}
              </ActionButton>
            )}
            <ToolButton label="New analysis — load specimen" onClick={open} className="size-8 border-line">
              {specimen ? <Plus /> : <FlaskConical />}
            </ToolButton>
          </div>
        </div>
      </div>
    </Panel>
  );
}
