"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, ScanEye } from "lucide-react";
import { cn } from "@/lib/utils";
import { setView, useSession } from "@/lib/state/session";
import { useSessionViewerData } from "@/lib/state/use-viewer-data";
import { composeXai } from "@/lib/imaging/compose";
import { TissueViewer, SliderField } from "@/components/medical/tissue-viewer";
import type { Transform } from "@/components/medical/viewer/use-viewport";
import { ActionButton, EmptyState, KV, Panel, PanelHeader, Tag } from "@/components/ui/workstation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const XAI_CAVEAT =
  "Highlighted regions represent image features that contributed to the model prediction. They should not be interpreted as definitive tumor boundaries.";

function XaiThumb({ mode, label }: { mode: "original" | "heatmap" | "overlay"; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const image = useSession((s) => s.image);
  const result = useSession((s) => s.result);
  const cmap = useSession((s) => s.view.colormap);
  const opacity = useSession((s) => s.view.heatOpacity);
  useEffect(() => {
    const el = ref.current;
    if (!el || !image) return;
    const w = 240;
    const h = Math.round((w * image.height) / image.width);
    const src = composeXai(mode, image.display, result?.gradcam ?? null, cmap, opacity, w, h);
    el.width = w;
    el.height = h;
    el.getContext("2d")!.drawImage(src, 0, 0);
  }, [image, result, cmap, opacity, mode]);
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <div className="relative overflow-hidden border border-line bg-viewport">
        <canvas ref={ref} className="block aspect-[4/3] w-full object-cover" aria-label={`${label} thumbnail`} />
      </div>
      <figcaption className="t-label !text-[9px]">{label}</figcaption>
    </figure>
  );
}

export function SyncedTriptych({ className, height = "min-h-[320px]" }: { className?: string; height?: string }) {
  const data = useSessionViewerData();
  const view = useSession((s) => s.view);
  const [t, setT] = useState<Transform>({ k: 0, x: 0, y: 0 });
  const key = data?.key;
  useEffect(() => setT({ k: 0, x: 0, y: 0 }), [key]);
  const panes = [
    { mode: "original" as const, label: "ORIGINAL" },
    { mode: "gradcam" as const, label: "HEATMAP" },
    { mode: "combined" as const, label: "OVERLAY" },
  ];
  return (
    <div className={cn("grid gap-px bg-line p-px md:grid-cols-3", className)}>
      {panes.map((p) => (
        <TissueViewer
          key={p.mode}
          data={data}
          view={{ ...view, channel: "RGB", showTiles: false, compare: false, showGrid: false }}
          onView={setView}
          variant="panel"
          lockOverlay={p.mode}
          transform={t}
          onTransform={setT}
          label={p.label}
          className={height}
          empty={<EmptyState title="No explanation" />}
        />
      ))}
    </div>
  );
}

export function ExplainabilityPanel({ className }: { className?: string }) {
  const result = useSession((s) => s.result);
  const opacity = useSession((s) => s.view.heatOpacity);
  const [open, setOpen] = useState(false);
  const g = result?.gradcam;
  return (
    <Panel className={className}>
      <PanelHeader index="04" title="Explainability" meta="Grad-CAM" actions={result?.source === "demo" && <Tag tone="warn">Simulated</Tag>} />
      {g ? (
        <div className="flex flex-col gap-2.5 p-3">
          <div className="grid grid-cols-3 gap-1.5">
            <XaiThumb mode="original" label="Original" />
            <XaiThumb mode="heatmap" label="Heatmap" />
            <XaiThumb mode="overlay" label="Overlay" />
          </div>
          <SliderField label="Opacity" value={opacity} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setView({ heatOpacity: v })} />
          <dl>
            <KV k="Method" v={result?.source === "demo" ? "Grad-CAM (surrogate)" : "Grad-CAM"} />
            <KV k="Target" v={g.target === "cancerous" ? "Cancerous" : "Benign"} />
            <KV k="Layer" v={`${g.layer} · ${g.featureMap.join("×")}`} />
          </dl>
          <p className="text-[10.5px] leading-snug text-dim">{XAI_CAVEAT}</p>
          <ActionButton variant="secondary" onClick={() => setOpen(true)}>
            <Maximize2 /> View explanation
          </ActionButton>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="gap-0 rounded-[4px] border border-line-strong bg-panel p-0 sm:max-w-[min(1320px,96vw)]">
              <DialogHeader className="border-b border-line px-4 py-3">
                <DialogTitle className="t-label !text-[11px] !text-foreground">Explainability · Grad-CAM · {result?.caseId}</DialogTitle>
                <DialogDescription className="text-[11.5px]">Pan and zoom are synchronised across panels. {result?.source === "demo" && "Saliency is simulated in demo mode."}</DialogDescription>
              </DialogHeader>
              <SyncedTriptych height="h-[62vh]" />
              <p className="border-t border-line px-4 py-2.5 text-[11px] text-dim">{XAI_CAVEAT}</p>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <EmptyState icon={<ScanEye />} title="No explanation yet" className="py-8">
          Grad-CAM saliency is produced in stage 07 once a prediction is available.
        </EmptyState>
      )}
    </Panel>
  );
}
