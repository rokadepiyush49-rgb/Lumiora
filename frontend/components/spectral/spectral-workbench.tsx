"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Layers, Maximize2, Minimize2, Play } from "lucide-react";
import type { BandId, BandSet, ColorSpace } from "@/lib/types";
import { BANDS, BAND_IDS, bandById, cn, fmtNum } from "@/lib/utils";
import { bandCorrelation } from "@/lib/imaging/bands";
import { loadDemo, runAnalysis, setView, useSession } from "@/lib/state/session";
import { useSessionViewerData } from "@/lib/state/use-viewer-data";
import { TissueViewer } from "@/components/medical/tissue-viewer";
import { ActionButton, EmptyState, KV, Panel, PanelHeader, Segmented, Tag, TLabel } from "@/components/ui/workstation";
import { AXIS, ChartFrame, ChartTooltip, GRID, Legend, MUTED_MARK, SERIES } from "@/components/charts/chart-kit";
import { BandThumb, MiniHistogram } from "./band-parts";

const SPACES: ColorSpace[] = ["RGB", "HSV", "LAB"];
const slotOf = (id: BandId) => BANDS.filter((b) => b.space === bandById(id).space).findIndex((b) => b.id === id);
const colorOf = (id: BandId) => SERIES[slotOf(id)];
const glyph = (id: BandId) => bandById(id).glyph;

/* --------------------------------------------------------------- grid */

function BandGrid({ bands, onExpand, active }: { bands: BandSet; onExpand: (id: BandId) => void; active: BandId | null }) {
  return (
    <div className="grid gap-px bg-line p-px sm:grid-cols-3">
      {SPACES.map((space) =>
        BANDS.filter((b) => b.space === space).map((b) => {
          const st = bands[b.id].stats;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onExpand(b.id)}
              aria-label={`Expand ${b.name} band`}
              className={cn("group flex min-w-0 flex-col bg-panel text-left transition-colors hover:bg-panel-2", active === b.id && "shadow-[inset_0_0_0_1px_var(--teal)]")}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-viewport">
                <BandThumb ch={bands[b.id]} />
                <span className="t-mono absolute top-1.5 left-1.5 bg-viewport/85 px-1.5 py-0.5 text-[11px] font-semibold text-foreground">{b.glyph}</span>
                <span className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Maximize2 className="size-3.5 text-foreground drop-shadow" />
                </span>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-line px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-medium tracking-[0.04em] text-foreground uppercase">{b.name}</span>
                  <span className="t-mono text-[10px] text-dim">
                    {b.glyph} / {b.space}
                  </span>
                </div>
                <MiniHistogram hist={st.histogram} height={30} bins={64} mean={st.mean} stroke="var(--teal)" />
                <div className="grid grid-cols-2 gap-x-3">
                  <KV k="Mean" v={fmtNum(st.mean)} />
                  <KV k="Variance" v={fmtNum(st.variance)} />
                </div>
              </div>
            </button>
          );
        }),
      )}
    </div>
  );
}

/* ------------------------------------------------------------- detail */

function BandDetail({ id, bands, onClose }: { id: BandId; bands: BandSet; onClose: () => void }) {
  const data = useSessionViewerData();
  const view = useSession((s) => s.view);
  const b = bandById(id);
  const st = bands[id].stats;
  const hist = useMemo(() => st.histogram.map((c, i) => ({ v: i, c })), [st]);
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <Panel>
        <PanelHeader
          title={`Channel detail · ${b.name}`}
          meta={`${b.glyph} / ${b.space}`}
          actions={
            <ActionButton size="sm" variant="ghost" onClick={onClose}>
              <Minimize2 /> Collapse
            </ActionButton>
          }
        />
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <TissueViewer
            data={data}
            view={{ ...view, channel: id, overlay: "original", compare: false, showTiles: false }}
            onView={(p) => {
              // The detail viewer pins its channel; forward everything else.
              const rest = { ...p };
              delete rest.channel;
              setView(rest);
            }}
            toolbar={false}
            adjustments={false}
            className="h-[420px] border-b border-line lg:border-r lg:border-b-0"
          />
          <div className="flex flex-col">
            <div className="border-b border-line px-3 py-2.5">
              <TLabel>Channel profile</TLabel>
              <dl className="mt-1.5">
                <KV k="Band" v={b.name} mono={false} />
                <KV k="Space" v={b.space} />
                <KV k="Identifier" v={`${b.glyph} / ${b.space}`} />
                <KV k="Mean intensity" v={fmtNum(st.mean)} />
                <KV k="Standard deviation" v={fmtNum(st.std)} />
                <KV k="Variance" v={fmtNum(st.variance)} />
                <KV k="Median" v={st.median} />
                <KV k="Dynamic range" v={`${b.range[0]}–${b.range[1]}`} />
                <KV k="Observed range" v={`${st.min}–${st.max}`} />
                <KV k="Entropy" v={`${st.entropy.toFixed(3)} bits`} />
              </dl>
            </div>
            <div className="px-2 pt-2">
              <div className="px-1 pb-1">
                <TLabel>Histogram · 256 bins</TLabel>
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={hist} margin={{ top: 4, right: 6, left: -18, bottom: 0 }} barCategoryGap={0}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="v" {...AXIS} ticks={[0, 64, 128, 192, 255]} interval={0} type="number" domain={[0, 255]} />
                  <YAxis {...AXIS} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} width={40} />
                  <Tooltip cursor={{ fill: "oklch(1 0 0 / 0.04)" }} content={<ChartTooltip labelFmt={(l) => `Intensity ${l}`} valueFmt={(v) => `${v} px`} />} />
                  <Bar dataKey="c" name="pixels" fill={SERIES[0]} isAnimationActive={false} />
                  <ReferenceLine x={Math.round(st.mean)} stroke="var(--foreground)" strokeOpacity={0.5} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-auto border-t border-line px-3 py-2 text-[11px] leading-relaxed text-dim">{b.description}</p>
          </div>
        </div>
      </Panel>
    </motion.div>
  );
}

/* --------------------------------------------------------- comparison */

function useComparison(bands: BandSet) {
  return useMemo(() => {
    const binned = (h: number[], bins = 64) => {
      const per = 256 / bins;
      const total = h.reduce((a, b) => a + b, 0);
      return Array.from({ length: bins }, (_, i) => {
        let s = 0;
        for (let j = i * per; j < (i + 1) * per; j++) s += h[j];
        return s / total;
      });
    };
    const dens = Object.fromEntries(BAND_IDS.map((id) => [id, binned(bands[id].stats.histogram)])) as Record<BandId, number[]>;
    const n = bands.R.data.length;
    const step = Math.max(1, Math.floor(n / 1400));
    const idx: number[] = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    const corr: number[][] = BAND_IDS.map((a) => BAND_IDS.map((b) => (a === b ? 1 : bandCorrelation(bands[a].data, bands[b].data, 4))));
    return { dens, idx, corr };
  }, [bands]);
}

function DistributionFacet({ space, selected, dens }: { space: ColorSpace; selected: Set<BandId>; dens: Record<BandId, number[]> }) {
  const ids = BANDS.filter((b) => b.space === space && selected.has(b.id)).map((b) => b.id);
  const rows = Array.from({ length: 64 }, (_, i) => ({ x: i * 4 + 2, ...Object.fromEntries(ids.map((id) => [id, dens[id][i]])) }));
  return (
    <ChartFrame
      title={`Intensity distribution · ${space}`}
      legend={ids.length > 1 ? <Legend items={ids.map((id) => ({ label: `${glyph(id)} ${bandById(id).name}`, color: colorOf(id) }))} /> : undefined}
      table={{ columns: ["Intensity", ...ids.map(glyph)], rows: rows.map((r) => [r.x, ...ids.map((id) => (r as Record<string, number>)[id])]) }}
    >
      {ids.length ? (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={rows} margin={{ top: 6, right: 10, left: -14, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="x" type="number" domain={[0, 255]} ticks={[0, 64, 128, 192, 255]} {...AXIS} />
            <YAxis {...AXIS} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} width={40} />
            <Tooltip content={<ChartTooltip labelFmt={(l) => `Intensity ≈ ${l}`} valueFmt={(v) => `${(Number(v) * 100).toFixed(2)}%`} />} cursor={{ stroke: "var(--line-strong)" }} />
            {ids.map((id) => (
              <Line key={id} dataKey={id} name={glyph(id)} stroke={colorOf(id)} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState title="No bands selected in this space" className="h-[180px] py-0" />
      )}
    </ChartFrame>
  );
}

function CorrelationMatrix({ corr }: { corr: number[][] }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const cell = 34;
  const pad = 26;
  const color = (r: number) => {
    // diverging: teal (−) ↔ neutral gray ↔ amber (+)
    const t = Math.min(1, Math.abs(r));
    return r >= 0 ? `color-mix(in oklch, #cb8230 ${Math.round(t * 100)}%, #2a2d31)` : `color-mix(in oklch, #00a6b5 ${Math.round(t * 100)}%, #2a2d31)`;
  };
  return (
    <ChartFrame
      title="Inter-band correlation"
      meta="Pearson r"
      table={{ columns: ["Band", ...BAND_IDS.map(glyph)], rows: corr.map((row, i) => [glyph(BAND_IDS[i]), ...row.map((v) => Number(v.toFixed(3)))]) }}
      legend={
        <div className="flex items-center gap-2">
          <span className="t-mono text-[10px] text-dim">−1</span>
          <div className="h-1.5 w-32" style={{ background: "linear-gradient(to right, #00a6b5, #2a2d31, #cb8230)" }} />
          <span className="t-mono text-[10px] text-dim">+1</span>
          <span className="t-mono ml-2 text-[10px] text-faint">labels shown where |r| ≥ 0.8</span>
        </div>
      }
    >
      <div className="relative overflow-x-auto">
        <svg width={pad + cell * 9 + 2} height={pad + cell * 9 + 2} role="img" aria-label="Band correlation matrix" className="mx-auto block">
          {BAND_IDS.map((id, i) => (
            <g key={id} className="t-mono" fontSize={10} fill="var(--dim)">
              <text x={pad + i * cell + cell / 2} y={pad - 8} textAnchor="middle">
                {glyph(id)}
              </text>
              <text x={pad - 6} y={pad + i * cell + cell / 2 + 3} textAnchor="end">
                {glyph(id)}
              </text>
            </g>
          ))}
          {corr.map((row, i) =>
            row.map((r, j) => {
              const on = hover && (hover[0] === i || hover[1] === j);
              return (
                <g key={`${i}-${j}`} onPointerEnter={() => setHover([i, j])} onPointerLeave={() => setHover(null)}>
                  <rect x={pad + j * cell + 1} y={pad + i * cell + 1} width={cell - 2} height={cell - 2} fill={color(r)} opacity={hover && !on ? 0.55 : 1} />
                  {(Math.abs(r) >= 0.8 || (hover && hover[0] === i && hover[1] === j)) && (
                    <text x={pad + j * cell + cell / 2} y={pad + i * cell + cell / 2 + 3} textAnchor="middle" fontSize={9} className="t-mono" fill={Math.abs(r) > 0.6 ? "#0e1012" : "var(--foreground)"}>
                      {r.toFixed(2)}
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </svg>
        {hover && (
          <div className="t-mono pointer-events-none absolute top-1 right-2 rounded-[2px] border border-line-strong bg-popover px-2 py-1 text-[10.5px]">
            <span className="text-foreground">{corr[hover[0]][hover[1]].toFixed(3)}</span>{" "}
            <span className="text-dim">
              r({glyph(BAND_IDS[hover[0]])}, {glyph(BAND_IDS[hover[1]])})
            </span>
          </div>
        )}
      </div>
    </ChartFrame>
  );
}

function SpectralComparison({ bands }: { bands: BandSet }) {
  const [selected, setSelected] = useState<Set<BandId>>(new Set(BAND_IDS));
  const [focus, setFocus] = useState<BandId>("S");
  const [xy, setXy] = useState<[BandId, BandId]>(["H", "S"]);
  const { dens, idx, corr } = useComparison(bands);
  const toggle = (id: BandId) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const means = BANDS.map((b) => ({ id: b.id, name: b.glyph, mean: bands[b.id].stats.mean, std: bands[b.id].stats.std, on: selected.has(b.id) }));
  const focusRows = dens[focus].map((d, i) => ({ x: i * 4 + 2, d }));
  const scatter = idx.map((i) => ({ x: bands[xy[0]].data[i], y: bands[xy[1]].data[i] }));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 border border-line bg-panel px-3 py-2">
        <TLabel className="mr-1">Channels</TLabel>
        {SPACES.map((space) => (
          <div key={space} className="flex items-center gap-1" role="group" aria-label={`${space} channels`}>
            <span className="t-mono mr-0.5 text-[9.5px] text-faint">{space}</span>
            {BANDS.filter((b) => b.space === space).map((b) => {
              const on = selected.has(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(b.id)}
                  className={cn("t-mono flex h-6 min-w-8 items-center justify-center gap-1 rounded-[2px] border px-1.5 text-[11px] transition-colors", on ? "border-line-strong bg-elevated text-foreground" : "border-line text-faint hover:text-muted-foreground")}
                >
                  <span aria-hidden className="h-[2px] w-2" style={{ background: on ? colorOf(b.id) : MUTED_MARK }} />
                  {b.glyph}
                </button>
              );
            })}
            <span className="mx-1.5 h-4 w-px bg-line" aria-hidden />
          </div>
        ))}
        <button type="button" onClick={() => setSelected(new Set(BAND_IDS))} className="t-mono text-[10.5px] text-dim hover:text-teal">
          all
        </button>
        <button type="button" onClick={() => setSelected(new Set())} className="t-mono text-[10.5px] text-dim hover:text-teal">
          none
        </button>
        <span className="t-mono ml-auto text-[10px] text-faint">{selected.size}/9 selected · analysis raster {bands.R.width}×{bands.R.height}</span>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {SPACES.map((s) => (
          <DistributionFacet key={s} space={s} selected={selected} dens={dens} />
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <ChartFrame
          title="Channel comparison"
          meta="mean ± σ · 8-bit"
          table={{ columns: ["Band", "Mean", "Std"], rows: means.map((m) => [m.name, m.mean, m.std]) }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={means} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} domain={[0, 255]} ticks={[0, 64, 128, 192, 255]} width={40} />
              <Tooltip cursor={{ fill: "oklch(1 0 0 / 0.04)" }} content={<ChartTooltip valueFmt={(v) => Number(v).toFixed(1)} />} />
              <Bar dataKey="mean" name="mean" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {means.map((m) => (
                  <Cell key={m.id} fill={m.on ? SERIES[0] : MUTED_MARK} />
                ))}
                <ErrorBar dataKey="std" width={5} stroke="var(--muted-foreground)" strokeWidth={1} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="t-mono px-2 pb-1 text-[9.5px] text-faint">H is encoded 0–179 (OpenCV); all other channels 0–255. Unselected channels shown muted.</p>
        </ChartFrame>

        <ChartFrame
          title="Histogram"
          meta={`${bandById(focus).name} · 64 bins`}
          actions={
            <Segmented<BandId> label="Histogram band" size="xs" value={focus} onChange={setFocus} options={BANDS.map((b) => ({ value: b.id, label: b.glyph }))} />
          }
          table={{ columns: ["Intensity", "Density"], rows: focusRows.map((r) => [r.x, r.d]) }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={focusRows} margin={{ top: 10, right: 10, left: -14, bottom: 0 }} barCategoryGap={1}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="x" type="number" domain={[0, 255]} ticks={[0, 64, 128, 192, 255]} {...AXIS} />
              <YAxis {...AXIS} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} width={44} />
              <Tooltip cursor={{ fill: "oklch(1 0 0 / 0.04)" }} content={<ChartTooltip labelFmt={(l) => `Intensity ≈ ${l}`} valueFmt={(v) => `${(Number(v) * 100).toFixed(2)}%`} />} />
              <Bar dataKey="d" name={glyph(focus)} fill={SERIES[0]} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <ReferenceLine x={bands[focus].stats.mean} stroke="var(--foreground)" strokeOpacity={0.5} label={{ value: `μ ${bands[focus].stats.mean.toFixed(1)}`, fill: "var(--muted-foreground)", fontSize: 10, position: "insideTopRight" }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title="Pixel distribution"
          meta={`${idx.length} sampled pixels`}
          table={{ columns: [glyph(xy[0]), glyph(xy[1])], rows: scatter.slice(0, 300).map((p) => [p.x, p.y]) }}
          className="xl:col-span-1"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pb-1">
            <span className="flex items-center gap-1.5">
              <TLabel>X</TLabel>
              <Segmented<BandId> label="X band" size="xs" value={xy[0]} onChange={(v) => setXy([v, xy[1]])} options={BANDS.map((b) => ({ value: b.id, label: b.glyph }))} />
            </span>
            <span className="flex items-center gap-1.5">
              <TLabel>Y</TLabel>
              <Segmented<BandId> label="Y band" size="xs" value={xy[1]} onChange={(v) => setXy([xy[0], v])} options={BANDS.map((b) => ({ value: b.id, label: b.glyph }))} />
            </span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 10, right: 12, left: -14, bottom: 4 }}>
              <CartesianGrid {...GRID} vertical />
              <XAxis dataKey="x" type="number" name={glyph(xy[0])} domain={[0, 255]} ticks={[0, 64, 128, 192, 255]} {...AXIS} />
              <YAxis dataKey="y" type="number" name={glyph(xy[1])} domain={[0, 255]} ticks={[0, 64, 128, 192, 255]} {...AXIS} width={40} />
              <ZAxis range={[10, 10]} />
              <Tooltip cursor={{ stroke: "var(--line-strong)" }} content={<ChartTooltip valueFmt={(v) => String(v)} />} />
              <Scatter data={scatter} fill={SERIES[0]} fillOpacity={0.35} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="t-mono px-2 pb-1 text-[9.5px] text-faint">
            Joint distribution of {bandById(xy[0]).name} ({xy[0] === "H" ? "0–179" : "0–255"}) and {bandById(xy[1]).name}. Clusters correspond to stain populations (nuclei, stroma, background).
          </p>
        </ChartFrame>

        <CorrelationMatrix corr={corr} />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- page */

export function SpectralWorkbench() {
  const bands = useSession((s) => s.bands);
  const specimen = useSession((s) => s.specimen);
  const phase = useSession((s) => s.phase);
  const channel = useSession((s) => s.view.channel);
  const [expanded, setExpanded] = useState<BandId | null>(null);

  if (!bands) {
    return (
      <div className="p-3">
        <Panel>
          <PanelHeader title="Optical band analysis" />
          <EmptyState
            icon={<Layers />}
            title={phase === "running" ? "Extraction in progress" : specimen ? "Bands not yet extracted" : "No specimen selected"}
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
            Nine optical channels are derived from the specimen in pipeline stage 03 (RGB → HSV, RGB → CIE L*a*b*, D65).
          </EmptyState>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <Panel>
        <PanelHeader
          index="S1"
          title="Optical band analysis"
          meta={`${specimen?.id} · 3 colour spaces × 3 channels`}
          actions={
            <>
              <Tag tone="teal">Computed in-browser</Tag>
              <ActionButton size="sm" variant={channel === "RGB" ? "secondary" : "ghost"} onClick={() => {
                  setView({ channel: "RGB" });
                  setExpanded(null);
                }}>
                Composite view
              </ActionButton>
            </>
          }
        />
        <BandGrid bands={bands} active={expanded} onExpand={(id) => setExpanded((e) => (e === id ? null : id))} />
      </Panel>
      <AnimatePresence>{expanded && <BandDetail key={expanded} id={expanded} bands={bands} onClose={() => setExpanded(null)} />}</AnimatePresence>
      <div className="mt-2 flex items-baseline gap-3">
        <h2 className="t-label !text-muted-foreground">Spectral comparison</h2>
        <span className="t-mono text-[10px] text-faint">filters apply to every chart below</span>
      </div>
      <SpectralComparison bands={bands} />
    </div>
  );
}
