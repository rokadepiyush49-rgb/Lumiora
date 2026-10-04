"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Play, ScanEye } from "lucide-react";
import type { TissueClass } from "@/lib/types";
import { cn, fmtPct } from "@/lib/utils";
import { loadDemo, regenerateGradcam, runAnalysis, setView, useSession } from "@/lib/state/session";
import { GRADCAM_LAYERS, type GradCamLayer } from "@/lib/imaging/saliency";
import { COLORMAPS, colormapCss, type ColormapName } from "@/lib/imaging/colormap";
import { SyncedTriptych, XAI_CAVEAT } from "@/components/analysis/explainability";
import { SliderField } from "@/components/medical/tissue-viewer";
import { ActionButton, DemoBadge, EmptyState, KV, Panel, PanelHeader, Segmented, Tag, TLabel } from "@/components/ui/workstation";
import { AXIS, ChartFrame, ChartTooltip, GRID, SERIES } from "@/components/charts/chart-kit";

function TopTiles() {
  const result = useSession((s) => s.result);
  const image = useSession((s) => s.image);
  const scale = useSession((s) => s.image?.displayScale ?? 1);
  const top = useMemo(() => {
    if (!result?.tiles) return [];
    const t = result.tiles;
    return t.probabilities
      .map((p, i) => ({ p, c: i % t.cols, r: Math.floor(i / t.cols) }))
      .filter((x) => !Number.isNaN(x.p))
      .sort((a, b) => b.p - a.p)
      .slice(0, 8)
      .map((x) => ({ ...x, x: x.c * t.stride, y: x.r * t.stride, s: t.tileSize }));
  }, [result]);
  return (
    <Panel>
      <PanelHeader title="Highest-probability tiles" meta="96 × 96 px model inputs" />
      <div className="grid grid-cols-4 gap-1.5 p-2">
        {top.map((t, i) => (
          <TileCrop key={i} src={image?.display ?? null} x={t.x} y={t.y} s={t.s} p={t.p} label={`(${Math.round(t.x / scale)}, ${Math.round(t.y / scale)})`} />
        ))}
        {!top.length && <p className="col-span-4 py-6 text-center text-[11px] text-faint">No tile output</p>}
      </div>
      <p className="border-t border-line px-3 py-2 text-[10.5px] leading-snug text-dim">Tiles are ranked by P(cancerous). Coordinates are source-pixel offsets of each tile&apos;s top-left corner.</p>
    </Panel>
  );
}

function TileCrop({ src, x, y, s, p, label }: { src: HTMLCanvasElement | null; x: number; y: number; s: number; p: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !src) return;
    c.width = 96;
    c.height = 96;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 96, 96);
    ctx.drawImage(src, x, y, Math.min(s, src.width - x), Math.min(s, src.height - y), 0, 0, (96 * Math.min(s, src.width - x)) / s, (96 * Math.min(s, src.height - y)) / s);
  }, [src, x, y, s]);
  return (
    <figure className="flex flex-col gap-1">
      <div className={cn("relative border", p >= 0.5 ? "border-malignant/60" : "border-line")}>
        <canvas ref={ref} className="block aspect-square w-full" style={{ imageRendering: "pixelated" }} aria-label={`Tile at ${label}, probability ${p.toFixed(2)}`} />
      </div>
      <figcaption className="t-mono flex flex-col text-[9.5px] leading-tight">
        <span className={p >= 0.5 ? "text-malignant" : "text-muted-foreground"}>P {p.toFixed(3)}</span>
        <span className="text-faint">{label}</span>
      </figcaption>
    </figure>
  );
}

function TileDistribution() {
  const result = useSession((s) => s.result);
  const rows = useMemo(() => {
    const bins = Array.from({ length: 20 }, (_, i) => ({ x: (i + 0.5) / 20, n: 0 }));
    result?.tiles?.probabilities.forEach((p) => {
      if (!Number.isNaN(p)) bins[Math.min(19, Math.floor(p * 20))].n++;
    });
    return bins;
  }, [result]);
  const valid = result?.tiles?.probabilities.filter((p) => !Number.isNaN(p)) ?? [];
  const pos = valid.filter((p) => p >= (result?.threshold ?? 0.5)).length;
  return (
    <ChartFrame title="Tile probabilities" meta={`${valid.length} tissue tiles`} table={{ columns: ["P bin centre", "Tiles"], rows: rows.map((r) => [Number(r.x.toFixed(3)), r.n]) }}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows} margin={{ top: 10, right: 10, left: -18, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="x" type="number" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} {...AXIS} />
          <YAxis {...AXIS} allowDecimals={false} width={36} />
          <Tooltip cursor={{ fill: "oklch(1 0 0 / 0.04)" }} content={<ChartTooltip labelFmt={(l) => `P ≈ ${Number(l).toFixed(3)}`} valueFmt={(v) => `${v} tiles`} />} />
          <Bar dataKey="n" name="tiles" fill={SERIES[0]} radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <ReferenceLine x={result?.threshold ?? 0.5} stroke="var(--foreground)" strokeOpacity={0.55} label={{ value: "τ", fill: "var(--muted-foreground)", fontSize: 10, position: "insideTopLeft" }} />
        </BarChart>
      </ResponsiveContainer>
      <dl className="grid grid-cols-3 gap-x-4 px-2 pb-2">
        <KV k="≥ τ" v={`${pos}`} vClassName={pos ? "text-malignant" : undefined} />
        <KV k="Fraction" v={valid.length ? fmtPct(pos / valid.length, 0) : "—"} />
        <KV k="Image P" v={result?.probabilityMalignant.toFixed(3) ?? "—"} />
      </dl>
    </ChartFrame>
  );
}

function MethodPanel() {
  const result = useSession((s) => s.result);
  const g = result?.gradcam;
  const layer = GRADCAM_LAYERS.find((l) => l.id === g?.layer);
  const cells = layer ? layer.shape[0] : 3;
  return (
    <Panel>
      <PanelHeader title="Method" meta="Selvaraju et al., 2017" />
      <div className="flex flex-col gap-3 px-3 py-3">
        <div className="t-mono border border-line bg-viewport px-3 py-2.5 text-[12px] leading-7 text-foreground">
          <div>
            α<sub>k</sub> = <span className="text-dim">1/Z</span> Σ<sub>i,j</sub> ∂z / ∂A<sup>k</sup>
            <sub>ij</sub>
          </div>
          <div>
            L<sub>Grad-CAM</sub> = ReLU( Σ<sub>k</sub> α<sub>k</sub> A<sup>k</sup> )
          </div>
        </div>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          With a single sigmoid output, <span className="t-mono">z</span> is the pre-activation logit. The benign target uses <span className="t-mono">−z</span>. Channel weights <span className="t-mono">α</span> are the
          spatially-averaged gradients over the chosen layer&apos;s activations <span className="t-mono">A</span>.
        </p>
        <div className="border-l-2 border-warn/60 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <span className="t-mono font-semibold text-warn">RESOLUTION · </span>
          At a 96 px input, <span className="t-mono">{g?.layer ?? "out_relu"}</span> is {cells}×{cells}; each activation cell summarises a {Math.round(96 / cells)}×{Math.round(96 / cells)} px block of its tile. Overlays are bilinearly upsampled, so boundaries are
          interpolated, not observed.
        </div>
        <p className="text-[11px] leading-relaxed text-dim">{XAI_CAVEAT}</p>
      </div>
    </Panel>
  );
}

export function XaiWorkbench() {
  const result = useSession((s) => s.result);
  const specimen = useSession((s) => s.specimen);
  const phase = useSession((s) => s.phase);
  const view = useSession((s) => s.view);
  const [busy, setBusy] = useState(false);
  const g = result?.gradcam;

  if (!result || !g) {
    return (
      <div className="p-3">
        <Panel>
          <PanelHeader title="Explainability / Grad-CAM" />
          <EmptyState
            icon={<ScanEye />}
            title={phase === "running" ? "Generating Grad-CAM…" : "No explanation available"}
            action={
              specimen ? (
                <ActionButton onClick={() => void runAnalysis()} disabled={phase === "running"}>
                  <Play /> Run pipeline
                </ActionButton>
              ) : (
                <div className="flex gap-2">
                  <ActionButton
                    onClick={async () => {
                      await loadDemo("SPECIMEN-001");
                      await runAnalysis();
                    }}
                  >
                    <Play /> Analyse sample specimen
                  </ActionButton>
                  <Link href="/analysis" className="t-mono inline-flex h-8 items-center rounded-[3px] border border-line-strong px-3 text-[12px] tracking-[0.08em] text-foreground uppercase hover:bg-elevated">
                    Open workspace
                  </Link>
                </div>
              )
            }
          >
            Saliency maps are generated after classification (pipeline stage 07).
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const recompute = async (layer: string, target: TissueClass) => {
    setBusy(true);
    try {
      await regenerateGradcam(layer, target);
    } catch (e) {
      toast.error("Grad-CAM failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <Panel>
        <PanelHeader
          index="X1"
          title="Explainability / Grad-CAM"
          meta={`${result.caseId} · ${result.prediction} · P=${result.probabilityMalignant.toFixed(3)}`}
          actions={result.source === "demo" ? <DemoBadge label="Simulated saliency" /> : <Tag tone="teal">Model gradients</Tag>}
        />
        <div className="grid gap-x-6 gap-y-2 border-b border-line px-3 py-2.5 md:grid-cols-2 xl:grid-cols-[auto_auto_auto_minmax(220px,1fr)]">
          <div className="flex items-center gap-2">
            <TLabel>Visualization</TLabel>
            <span className="t-mono text-[11.5px] text-foreground">Grad-CAM</span>
          </div>
          <div className="flex items-center gap-2">
            <TLabel>Target</TLabel>
            <Segmented<TissueClass>
              label="Target class"
              value={g.target}
              onChange={(t) => void recompute(g.layer, t)}
              options={[
                { value: "cancerous", label: "Cancerous", disabled: busy },
                { value: "benign", label: "Benign", disabled: busy },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <TLabel>Layer</TLabel>
            <Segmented<GradCamLayer>
              label="Target layer"
              value={g.layer as GradCamLayer}
              onChange={(l) => void recompute(l, g.target)}
              options={GRADCAM_LAYERS.map((l) => ({ value: l.id, label: `${l.shape[0]}×${l.shape[1]}`, title: `${l.id} — ${l.note}`, disabled: busy }))}
            />
            <span className="t-mono hidden text-[10.5px] text-dim 2xl:inline">{g.layer}</span>
          </div>
          <div className="flex items-center gap-3">
            <SliderField label="Heatmap α" className="flex-1" value={view.heatOpacity} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setView({ heatOpacity: v })} />
            <Segmented<ColormapName> label="Colormap" size="xs" value={view.colormap} onChange={(c) => setView({ colormap: c })} options={COLORMAPS.map((c) => ({ value: c.id, label: c.label.slice(0, 3), title: c.note }))} />
          </div>
        </div>
        <div className={cn("relative transition-opacity", busy && "opacity-50")}>
          <SyncedTriptych height="h-[440px]" />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="t-mono text-[10px] text-dim">0</span>
            <div className="h-1.5 w-40" style={{ background: colormapCss(view.colormap) }} />
            <span className="t-mono text-[10px] text-dim">1</span>
            <span className="t-mono text-[10px] text-faint">normalised activation</span>
          </div>
          <p className="ml-auto max-w-3xl text-[11px] text-dim">{XAI_CAVEAT}</p>
        </div>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-3">
        <MethodPanel />
        <TileDistribution />
        <TopTiles />
      </div>
    </div>
  );
}
