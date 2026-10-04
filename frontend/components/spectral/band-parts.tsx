"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import type { BandChannel, BandId, ColorSpace } from "@/lib/types";
import { BANDS, cn, fmtNum } from "@/lib/utils";
import { bandCanvas } from "@/components/medical/viewer/layers";
import { setView, useSession } from "@/lib/state/session";
import { EmptyState, Panel, PanelHeader, Segmented } from "@/components/ui/workstation";
import { Layers } from "lucide-react";

export const BandThumb = memo(function BandThumb({ ch, className, pixelated }: { ch: BandChannel; className?: string; pixelated?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const src = bandCanvas(ch);
    c.width = src.width;
    c.height = src.height;
    c.getContext("2d")!.drawImage(src, 0, 0);
  }, [ch]);
  return <canvas ref={ref} aria-hidden className={cn("block h-full w-full object-cover", className)} style={{ imageRendering: pixelated ? "pixelated" : "auto" }} />;
});

/** 256-bin histogram rendered as a filled step path, optionally log-scaled. */
export const MiniHistogram = memo(function MiniHistogram({
  hist,
  bins = 64,
  height = 28,
  className,
  stroke = "var(--teal)",
  mean,
  range = 255,
}: {
  hist: number[];
  bins?: number;
  height?: number;
  className?: string;
  stroke?: string;
  mean?: number;
  range?: number;
}) {
  const path = useMemo(() => {
    const per = Math.ceil(hist.length / bins);
    const vals: number[] = [];
    for (let i = 0; i < bins; i++) {
      let s = 0;
      for (let j = i * per; j < Math.min(hist.length, (i + 1) * per); j++) s += hist[j];
      vals.push(s);
    }
    const max = Math.max(1, ...vals);
    let d = `M0 ${height}`;
    vals.forEach((v, i) => {
      const y = height - (v / max) * (height - 1);
      d += ` L${(i / bins) * 100} ${y.toFixed(2)} L${((i + 1) / bins) * 100} ${y.toFixed(2)}`;
    });
    return `${d} L100 ${height} Z`;
  }, [hist, bins, height]);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className={cn("block w-full", className)} style={{ height }} aria-hidden>
      <path d={path} fill={stroke} fillOpacity={0.16} stroke={stroke} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      {mean != null && <line x1={(mean / range) * 100} x2={(mean / range) * 100} y1={0} y2={height} stroke="var(--foreground)" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
});

const SPACES: ColorSpace[] = ["RGB", "HSV", "LAB"];

export function BandStrip({ className }: { className?: string }) {
  const bands = useSession((s) => s.bands);
  const channel = useSession((s) => s.view.channel);
  const phase = useSession((s) => s.phase);
  return (
    <Panel className={className}>
      <PanelHeader
        index="02"
        title="Multi-band analysis"
        meta={bands ? `9 optical channels · ${bands.R.width}×${bands.R.height} analysis raster` : undefined}
        actions={
          <Segmented<"RGB" | "band">
            label="Composite view"
            size="xs"
            value={channel === "RGB" ? "RGB" : "band"}
            onChange={(v) => v === "RGB" && setView({ channel: "RGB" })}
            options={[
              { value: "RGB", label: "Composite", disabled: !bands },
              { value: "band", label: channel === "RGB" ? "Band" : BANDS.find((b) => b.id === channel)!.glyph, disabled: true },
            ]}
          />
        }
      />
      {bands ? (
        <div className="grid grid-cols-3 gap-px bg-line p-px sm:grid-cols-9">
          {SPACES.map((space) =>
            BANDS.filter((b) => b.space === space).map((b, i) => {
              const ch = bands[b.id];
              const active = channel === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setView({ channel: active ? "RGB" : (b.id as BandId), overlay: "original" })}
                  aria-pressed={active}
                  aria-label={`Show ${b.name} band (${b.space}) in viewer`}
                  className={cn("group relative flex min-w-0 flex-col bg-panel text-left transition-colors hover:bg-panel-2", active && "bg-elevated shadow-[inset_0_0_0_1px_var(--teal)]")}
                >
                  <div className="relative aspect-[4/3] overflow-hidden border-b border-line bg-viewport">
                    <BandThumb ch={ch} />
                    <span className="t-mono absolute top-1 left-1 bg-viewport/80 px-1 text-[10px] font-semibold text-foreground">{b.glyph}</span>
                    {i === 0 && <span className="t-mono absolute top-1 right-1 bg-viewport/80 px-1 text-[8.5px] tracking-[0.14em] text-teal">{space}</span>}
                  </div>
                  <div className="px-1.5 pt-1 pb-1.5">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="truncate text-[10.5px] text-muted-foreground">{b.name}</span>
                    </div>
                    <MiniHistogram hist={ch.stats.histogram} height={18} bins={48} mean={ch.stats.mean} stroke={active ? "var(--teal)" : "var(--dim)"} className="mt-1" />
                    <div className="t-mono mt-1 flex justify-between text-[9.5px]">
                      <span className="text-faint">μ</span>
                      <span className="text-foreground">{fmtNum(ch.stats.mean)}</span>
                      <span className="text-faint">σ²</span>
                      <span className="text-foreground">{ch.stats.variance >= 1000 ? (ch.stats.variance / 1000).toFixed(1) + "k" : fmtNum(ch.stats.variance, 0)}</span>
                    </div>
                  </div>
                </button>
              );
            }),
          )}
        </div>
      ) : (
        <EmptyState icon={<Layers />} title={phase === "running" ? "Extracting bands…" : "No bands extracted"} className="py-6">
          RGB, HSV and LAB decompositions (9 channels) are computed during stage 03 of the pipeline.
        </EmptyState>
      )}
    </Panel>
  );
}
