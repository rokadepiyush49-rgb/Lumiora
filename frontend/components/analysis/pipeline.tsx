"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, X } from "lucide-react";
import type { LogEntry, PipelineStage } from "@/lib/types";
import { cn, fmtClock, fmtMs } from "@/lib/utils";
import { useSession } from "@/lib/state/session";
import { useBackend } from "@/lib/state/backend";
import { Panel, PanelHeader, Tag, ToolButton } from "@/components/ui/workstation";

function StageNode({ s, i, compact }: { s: PipelineStage; i: number; compact?: boolean }) {
  const running = s.status === "running";
  const done = s.status === "done";
  const err = s.status === "error";
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 flex-col gap-1 overflow-hidden border bg-panel-2/50 px-2.5 py-2 transition-colors",
        s.status === "waiting" && "border-line text-faint",
        running && "border-teal/60 bg-teal/[0.04]",
        done && "border-line-strong",
        err && "border-malignant/60 bg-malignant/5",
        s.simulated && done && "hatch",
      )}
      aria-label={`${s.label}: ${s.status}`}
    >
      {running && (
        <motion.div
          className="absolute inset-x-0 bottom-0 h-px bg-teal"
          initial={{ scaleX: 0, originX: 0 }}
          animate={{ scaleX: [0, 1, 0], originX: [0, 0, 1] }}
          transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
        />
      )}
      <div className="flex items-center gap-1.5">
        <span className="t-mono text-[9.5px] text-faint">{String(i + 1).padStart(2, "0")}</span>
        <span className={cn("flex size-3.5 items-center justify-center rounded-full border", done ? "border-ok/60 text-ok" : running ? "border-teal text-teal" : err ? "border-malignant text-malignant" : "border-line-strong")}>
          {done ? <Check className="size-2.5" strokeWidth={3} /> : err ? <X className="size-2.5" strokeWidth={3} /> : running ? <span className="animate-pulse-dot size-1.5 rounded-full bg-teal" /> : null}
        </span>
        {s.simulated && <span className="t-mono ml-auto text-[8.5px] tracking-[0.12em] text-warn">SIM</span>}
      </div>
      <div className={cn("t-mono truncate text-[10.5px] font-medium uppercase tracking-[0.06em]", s.status === "waiting" ? "text-dim" : "text-foreground")}>{s.label}</div>
      {!compact && <div className="truncate text-[10px] text-dim">{s.detail}</div>}
      <div className="t-mono mt-auto flex items-baseline justify-between gap-2 pt-1 text-[10px]">
        <span className={cn("truncate", done ? "text-muted-foreground" : "text-faint")}>{done ? s.output : running ? "processing…" : err ? s.output : "waiting"}</span>
        <span className={cn("shrink-0", done ? "text-teal" : "text-faint")}>{done ? fmtMs(s.ms) : "—"}</span>
      </div>
    </div>
  );
}

function Connector({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div className="relative hidden w-4 shrink-0 items-center lg:flex" aria-hidden>
      <div className={cn("h-px w-full", done ? "bg-line-strong" : "bg-line")} />
      <div className={cn("absolute right-0 h-0 w-0 border-y-[3px] border-l-[4px] border-y-transparent", done ? "border-l-line-strong" : "border-l-line")} />
      {active && (
        <motion.span className="absolute size-1 rounded-full bg-teal" initial={{ left: 0 }} animate={{ left: "100%" }} transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }} />
      )}
    </div>
  );
}

export function PipelineGraph({ compact = false }: { compact?: boolean }) {
  const stages = useSession((s) => s.stages);
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:flex lg:items-stretch lg:gap-0">
      {stages.map((s, i) => (
        <Fragment key={s.id}>
          <StageNode s={s} i={i} compact={compact} />
          {i < stages.length - 1 && <Connector done={s.status === "done"} active={s.status === "done" && stages[i + 1].status === "running"} />}
        </Fragment>
      ))}
    </div>
  );
}

const LEVEL: Record<LogEntry["level"], string> = {
  info: "text-muted-foreground",
  ok: "text-ok",
  warn: "text-warn",
  error: "text-malignant",
  debug: "text-faint",
};

export function TechLog({ className, maxHeight = 176 }: { className?: string; maxHeight?: number }) {
  const logs = useSession((s) => s.logs);
  const origin = useSession((s) => s.sessionStartedAt);
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);
  const copy = async () => {
    const text = logs.map((l) => `${fmtClock(l.t, origin)} ${l.level.toUpperCase().padEnd(5)} [${l.scope}] ${l.message}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className={cn("flex min-h-0 flex-col border border-line bg-viewport", className)}>
      <div className="flex h-7 items-center gap-2 border-b border-line px-2">
        <span className="t-label !text-[9.5px]">Technical log</span>
        <span className="t-mono text-[9.5px] text-faint">{logs.length} events</span>
        <ToolButton label={copied ? "Copied" : "Copy log"} className="ml-auto size-6" onClick={copy}>
          {copied ? <Check /> : <Copy />}
        </ToolButton>
      </div>
      <div ref={ref} className="t-mono min-h-0 overflow-y-auto px-2 py-1.5 text-[10.5px] leading-[17px]" style={{ maxHeight }} role="log" aria-live="polite">
        {logs.length === 0 && <div className="text-faint">— awaiting events —</div>}
        {logs.map((l, i) => (
          <div key={i} className="flex gap-2 whitespace-nowrap">
            <span className="text-faint">{fmtClock(l.t, origin)}</span>
            <span className={cn("w-9 shrink-0 uppercase", LEVEL[l.level])}>{l.level}</span>
            <span className="text-dim">[{l.scope}]</span>
            <span className="truncate text-muted-foreground" title={l.message}>
              {l.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PipelinePanel({ className }: { className?: string }) {
  const stages = useSession((s) => s.stages);
  const phase = useSession((s) => s.phase);
  const mode = useBackend((s) => s.mode);
  const total = stages.reduce((a, s) => a + (s.status === "done" ? s.ms ?? 0 : 0), 0);
  const done = stages.filter((s) => s.status === "done").length;
  return (
    <Panel className={className}>
      <PanelHeader
        index="05"
        title="Analysis pipeline"
        meta={`${done}/${stages.length} stages · Σ ${fmtMs(total)}`}
        actions={
          <>
            <Tag tone={mode === "connected" ? "teal" : "warn"}>{mode === "connected" ? "Engine · backend" : "Engine · demo"}</Tag>
            <Tag tone={phase === "complete" ? "benign" : phase === "running" ? "teal" : phase === "error" ? "malignant" : "neutral"}>{phase}</Tag>
          </>
        }
      />
      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-2">
          <PipelineGraph />
          <p className="t-mono text-[10px] text-faint">
            Stages 01–04 and 08 execute in-browser with measured latency. Stages 05–07 execute on the inference backend
            {mode === "demo" ? " — currently simulated (SIM) because no backend is connected." : "."}
          </p>
        </div>
        <TechLog />
      </div>
    </Panel>
  );
}
