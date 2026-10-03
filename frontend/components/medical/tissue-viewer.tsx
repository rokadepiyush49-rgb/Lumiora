"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Columns2, Crosshair as CrosshairIcon, Expand, Grid3x3, Maximize2, Minimize2, RotateCcw, ScanLine, SquareDashed, ZoomIn, ZoomOut } from "lucide-react";
import type { BandChannel, BandId, BandSet, GradCamResult, TileGrid } from "@/lib/types";
import type { OverlayMode, ViewSettings } from "@/lib/state/session";
import { createStore } from "@/lib/state/store";
import { BANDS, cn } from "@/lib/utils";
import { COLORMAPS, type ColormapName } from "@/lib/imaging/colormap";
import { Segmented, Tag, ToolButton, TLabel } from "@/components/ui/workstation";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useViewport, type Transform } from "./viewer/use-viewport";
import { BoundaryLayer, RasterLayer, TileLayer, bandCanvas, useHeatCanvas } from "./viewer/layers";
import { Colorbar, Crosshair, Graticule, Minimap, Readout, ScaleBar, SwipeDivider, useCursorTracking, type Cursor } from "./viewer/overlays";

export interface ViewerData {
  key: string;
  src: string;
  width: number;
  height: number;
  sourceScale: number;
  mpp: number;
  magnification: number;
  specimenId: string;
  work?: ImageData | null;
  workScale?: number;
  bands?: BandSet | null;
  edges?: BandChannel | null;
  gradcam?: GradCamResult | null;
  tiles?: TileGrid | null;
  threshold?: number;
  boundary?: string | null;
  synthetic?: boolean;
  simulated?: boolean;
  colorSpace?: string;
}

export interface TissueViewerProps {
  data: ViewerData | null;
  view: ViewSettings;
  onView: (p: Partial<ViewSettings>) => void;
  variant?: "workstation" | "hero" | "panel";
  primary?: boolean;
  lockOverlay?: OverlayMode;
  transform?: Transform | null;
  onTransform?: (t: Transform) => void;
  toolbar?: boolean;
  adjustments?: boolean;
  label?: string;
  busy?: string | null;
  empty?: React.ReactNode;
  statusText?: string;
  className?: string;
  viewportClassName?: string;
}

const OVERLAY_OPTS: { value: OverlayMode; label: string; key: string }[] = [
  { value: "original", label: "Original", key: "1" },
  { value: "gradcam", label: "Grad-CAM", key: "2" },
  { value: "combined", label: "Combined", key: "3" },
  { value: "edges", label: "Edge map", key: "4" },
];

const CHANNEL_ITEMS = [{ value: "RGB", label: "RGB · composite" }, ...BANDS.map((b) => ({ value: b.id, label: `${b.glyph} · ${b.name} (${b.space})` }))];

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || !!t.closest("[role=dialog]"));
}

export function TissueViewer({
  data,
  view,
  onView,
  variant = "workstation",
  primary = false,
  lockOverlay,
  transform,
  onTransform,
  toolbar = variant === "workstation",
  adjustments = variant === "workstation",
  label,
  busy,
  empty,
  statusText,
  className,
  viewportClassName,
}: TissueViewerProps) {
  const iw = data?.width ?? 0;
  const ih = data?.height ?? 0;
  const vp = useViewport(iw, ih, { controlled: transform, onChange: onTransform, key: data?.key, padding: variant === "hero" ? 1.02 : 0.94 });
  const { t, size } = vp;
  const cursor = useMemo(() => createStore<Cursor>({ sx: 0, sy: 0, inside: false }), []);
  useCursorTracking(vp.containerRef, cursor);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [swipe, setSwipe] = useState(0.5);

  const overlay = lockOverlay ?? view.overlay;
  const hasCam = !!data?.gradcam;
  const heatAlpha = useHeatCanvas(data?.gradcam, view.colormap, "alpha");
  const heatOpaque = useHeatCanvas(data?.gradcam, view.colormap, "opaque");
  const showHeat = hasCam && (overlay === "gradcam" || overlay === "combined");
  const heat = overlay === "gradcam" ? heatOpaque : heatAlpha;
  const heatOpacity = overlay === "gradcam" ? 1 : view.heatOpacity;

  const channelSrc = view.channel !== "RGB" && data?.bands ? bandCanvas(data.bands[view.channel as BandId]) : null;
  const edgeSrc = overlay === "edges" && data?.edges ? bandCanvas(data.edges) : null;
  const processed = edgeSrc ?? channelSrc;
  const compare = view.compare && !lockOverlay && (showHeat || !!processed);
  const clipX = compare ? Math.max(0, (swipe * size.w - t.x) / t.k) : 0;
  const clip = compare ? `inset(0 0 0 ${clipX}px)` : undefined;
  const pixelated = t.k * (data?.sourceScale ?? 1) >= 3;
  const filter = view.brightness !== 1 || view.contrast !== 1 ? `brightness(${view.brightness}) contrast(${view.contrast})` : undefined;

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen?.();
  };
  const reset = () => {
    vp.fit();
    onView({ brightness: 1, contrast: 1, heatOpacity: 0.55 });
  };

  // Viewer keyboard map (only for the primary viewer on screen).
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (!data || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const step = 60;
    const map: Record<string, () => void> = {
      "+": () => vp.zoomAt(1.25),
      "=": () => vp.zoomAt(1.25),
      "-": () => vp.zoomAt(0.8),
      "0": () => vp.fit(),
      r: reset,
      f: toggleFullscreen,
      ArrowLeft: () => vp.panBy(step, 0),
      ArrowRight: () => vp.panBy(-step, 0),
      ArrowUp: () => vp.panBy(0, step),
      ArrowDown: () => vp.panBy(0, -step),
      "1": () => onView({ overlay: "original" }),
      "2": () => hasCam && onView({ overlay: "gradcam" }),
      "3": () => hasCam && onView({ overlay: "combined" }),
      "4": () => data.edges && onView({ overlay: "edges" }),
      t: () => data.tiles && onView({ showTiles: !view.showTiles }),
      s: () => onView({ compare: !view.compare }),
      c: () => onView({ showCrosshair: !view.showCrosshair }),
      l: () => onView({ showGrid: !view.showGrid }),
      b: () => data.boundary && onView({ showBoundary: !view.showBoundary }),
    };
    const fn = map[k] ?? map[k.toLowerCase()];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };
  useEffect(() => {
    if (!primary) return;
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [primary]);

  const hero = variant === "hero";
  const panel = variant === "panel";
  const rulers = !panel && view.showGrid;
  const inset = rulers ? 24 : 10;

  return (
    <div ref={wrapRef} className={cn("flex min-h-0 min-w-0 flex-col bg-viewport", fullscreen && "h-screen w-screen", className)}>
      {toolbar && (
        <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-panel px-2 py-1">
          <div className="flex items-center gap-0.5" role="group" aria-label="Zoom">
            <ToolButton label="Zoom out" shortcut="−" onClick={() => vp.zoomAt(0.8)} disabled={!data}>
              <ZoomOut />
            </ToolButton>
            <ToolButton label="Zoom in" shortcut="+" onClick={() => vp.zoomAt(1.25)} disabled={!data}>
              <ZoomIn />
            </ToolButton>
            <ToolButton label="Fit to screen" shortcut="0" onClick={vp.fit} disabled={!data}>
              <Expand />
            </ToolButton>
            <ToolButton label="Reset view & adjustments" shortcut="R" onClick={reset} disabled={!data}>
              <RotateCcw />
            </ToolButton>
            <ToolButton label={fullscreen ? "Exit fullscreen" : "Fullscreen"} shortcut="F" onClick={toggleFullscreen} disabled={!data}>
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
            </ToolButton>
          </div>
          <span className="h-5 w-px bg-line" aria-hidden />
          <Segmented<OverlayMode>
            label="Overlay mode"
            value={overlay}
            onChange={(v) => onView({ overlay: v })}
            options={OVERLAY_OPTS.map((o) => ({
              value: o.value,
              label: o.label,
              title: `${o.label} (${o.key})`,
              disabled: !data || ((o.value === "gradcam" || o.value === "combined") && !hasCam) || (o.value === "edges" && !data?.edges),
            }))}
          />
          <Select items={CHANNEL_ITEMS} value={view.channel} onValueChange={(v) => v && onView({ channel: v as ViewSettings["channel"] })} disabled={!data?.bands}>
            <SelectTrigger size="sm" aria-label="Display channel" className="t-mono h-7 min-w-[150px] rounded-[3px] border-line text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-[3px] border border-line-strong bg-popover">
              {CHANNEL_ITEMS.map((c) => (
                <SelectItem key={c.value} value={c.value} className="t-mono text-[11px]">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="h-5 w-px bg-line" aria-hidden />
          <div className="flex items-center gap-0.5" role="group" aria-label="Overlays">
            <ToolButton label="Tile probabilities (96 px)" shortcut="T" active={view.showTiles} onClick={() => onView({ showTiles: !view.showTiles })} disabled={!data?.tiles}>
              <Grid3x3 />
            </ToolButton>
            <ToolButton label="Swipe compare" shortcut="S" active={view.compare} onClick={() => onView({ compare: !view.compare })} disabled={!data}>
              <Columns2 />
            </ToolButton>
            <ToolButton label="Crosshair" shortcut="C" active={view.showCrosshair} onClick={() => onView({ showCrosshair: !view.showCrosshair })} disabled={!data}>
              <CrosshairIcon />
            </ToolButton>
            <ToolButton label="Rulers & graticule" shortcut="L" active={view.showGrid} onClick={() => onView({ showGrid: !view.showGrid })} disabled={!data}>
              <ScanLine />
            </ToolButton>
            <ToolButton label="Tissue boundary" shortcut="B" active={view.showBoundary} onClick={() => onView({ showBoundary: !view.showBoundary })} disabled={!data?.boundary}>
              <SquareDashed />
            </ToolButton>
          </div>
          <div className="t-mono ml-auto hidden text-[10.5px] text-dim xl:block">
            {data ? `${Math.round(iw / data.sourceScale)}×${Math.round(ih / data.sourceScale)} · ${(t.k * data.sourceScale * 100).toFixed(0)}%` : "No specimen"}
          </div>
        </div>
      )}

      <div
        ref={vp.containerRef}
        {...(data ? vp.handlers : {})}
        className={cn(
          "relative min-h-0 flex-1 touch-none overflow-hidden bg-viewport select-none",
          data ? (vp.dragging ? "cursor-grabbing" : view.showCrosshair ? "cursor-none" : "cursor-grab") : "",
          !hero && "bg-fine-grid",
          viewportClassName,
        )}
        tabIndex={data ? 0 : -1}
        aria-label={data ? `Tissue viewer: ${data.specimenId}. Drag to pan, scroll to zoom.` : "Tissue viewer: no specimen"}
        role="application"
      >
        {data ? (
          <>
            <div
              className="absolute left-0 top-0 origin-top-left will-change-transform"
              style={{ transform: `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.k})`, width: iw, height: ih }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.src}
                alt={`Specimen ${data.specimenId}`}
                width={iw}
                height={ih}
                draggable={false}
                className="absolute left-0 top-0 max-w-none"
                style={{ width: iw, height: ih, imageRendering: pixelated ? "pixelated" : "auto", filter, opacity: overlay === "gradcam" && !compare ? 0 : 1 }}
              />
              {processed && <RasterLayer source={processed} width={iw} height={ih} pixelated={pixelated} style={{ filter, clipPath: clip }} />}
              {showHeat && heat && <RasterLayer source={heat} width={iw} height={ih} style={{ opacity: heatOpacity, clipPath: clip, mixBlendMode: overlay === "combined" ? "normal" : undefined }} />}
              {view.showTiles && data.tiles && <TileLayer tiles={data.tiles} width={iw} height={ih} threshold={data.threshold ?? 0.5} cmap={view.colormap} />}
              {view.showBoundary && data.boundary && <BoundaryLayer path={data.boundary} width={iw} height={ih} />}
            </div>

            <div className="scanlines pointer-events-none absolute inset-0 opacity-60" aria-hidden />
            <Graticule t={t} size={size} iw={iw} ih={ih} sourceScale={data.sourceScale} grid={view.showGrid && !hero} rulers={rulers && !hero} />
            {hero && view.showGrid && <div className="bg-coarse-grid pointer-events-none absolute inset-0" aria-hidden />}
            {view.showCrosshair && <Crosshair cursor={cursor} size={size} />}
            {compare && <SwipeDivider pos={swipe} onChange={setSwipe} size={size} />}

            {/* HUD */}
            <div className="pointer-events-none absolute flex flex-col gap-1" style={{ left: inset, top: inset }}>
              {label && <span className="t-mono text-[10px] font-semibold tracking-[0.16em] text-foreground [text-shadow:0_1px_2px_black]">{label}</span>}
              {!panel && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="t-mono rounded-[2px] bg-viewport/80 px-1.5 py-0.5 text-[10px] text-foreground">{data.specimenId}</span>
                  {data.synthetic && <Tag className="bg-viewport/80">Synthetic</Tag>}
                  {data.simulated && hasCam && <Tag tone="warn" className="hatch bg-viewport/80">Simulated XAI</Tag>}
                </div>
              )}
            </div>
            {!hero && !panel && (
              <div className="t-mono pointer-events-none absolute right-2.5 flex flex-col items-end gap-0.5 text-[10px] text-foreground/85 [text-shadow:0_1px_2px_black]" style={{ top: inset }}>
                <span>
                  MAG {data.magnification}× <span className="text-faint">nominal</span>
                </span>
                <span className="text-teal">
                  {view.channel === "RGB" ? "RGB" : BANDS.find((b) => b.id === view.channel)?.glyph} · {overlay.toUpperCase()}
                </span>
              </div>
            )}
            <div className="absolute flex flex-col gap-2.5" style={{ left: inset, bottom: 10 }}>
              {showHeat && !panel && <Colorbar cmap={view.colormap} label={data.simulated ? "Saliency (simulated)" : "Grad-CAM activation"} />}
              <ScaleBar k={t.k} mpp={data.mpp} sourceScale={data.sourceScale} />
            </div>
            {!hero && !panel && (
              <div className="absolute right-2.5 bottom-2.5 flex items-end gap-2">
                <Readout cursor={cursor} t={t} iw={iw} ih={ih} sourceScale={data.sourceScale} work={data.work} workScale={data.workScale} gradcam={data.gradcam} tiles={data.tiles} className="hidden sm:block" />
                <Minimap src={data.src} iw={iw} ih={ih} t={t} size={size} onNavigate={vp.centerOn} className="hidden md:block" />
              </div>
            )}
            {panel && (
              <div className="absolute right-2 bottom-2">
                <span className="t-mono rounded-[2px] bg-viewport/80 px-1.5 py-0.5 text-[9.5px] text-dim">{(t.k * data.sourceScale).toFixed(2)}×</span>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex overflow-y-auto">
            <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full text-line-strong" preserveAspectRatio="none">
              <line x1="50%" x2="50%" y1="0" y2="100%" stroke="currentColor" strokeDasharray="2 6" strokeOpacity="0.5" />
              <line y1="50%" y2="50%" x1="0" x2="100%" stroke="currentColor" strokeDasharray="2 6" strokeOpacity="0.5" />
            </svg>
            {/* m-auto (not flex centering) so tall content scrolls instead of clipping */}
            <div className="brackets relative z-10 m-auto bg-viewport/90 p-1">{empty}</div>
          </div>
        )}

        <AnimatePresence>
          {busy && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 overflow-hidden" aria-live="polite">
              <div className="absolute inset-0 bg-viewport/35" />
              <div className="absolute inset-x-0 top-0 h-full">
                <div className="animate-scan h-1/3 w-full bg-gradient-to-b from-transparent via-teal/10 to-transparent" />
              </div>
              <div className="t-mono absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-teal/40 bg-viewport/90 px-3 py-1.5 text-[11px] tracking-[0.12em] text-teal uppercase">{busy}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {adjustments && (
        <div className="grid grid-cols-1 items-center gap-x-6 gap-y-1.5 border-t border-line bg-panel px-3 py-2 sm:grid-cols-2 min-[1700px]:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <SliderField label="Brightness" value={view.brightness} min={0.4} max={1.8} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onView({ brightness: v })} disabled={!data} />
          <SliderField label="Contrast" value={view.contrast} min={0.4} max={2.2} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onView({ contrast: v })} disabled={!data} />
          <SliderField label="Heatmap α" value={view.heatOpacity} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onView({ heatOpacity: v })} disabled={!hasCam} />
          <div className="flex items-center gap-2">
            <TLabel className="hidden lg:inline">Map</TLabel>
            <Segmented<ColormapName> label="Colormap" size="xs" value={view.colormap} onChange={(v) => onView({ colormap: v })} options={COLORMAPS.map((c) => ({ value: c.id, label: c.label.slice(0, 3), title: `${c.label} — ${c.note}` }))} />
          </div>
          {statusText && <div className="t-mono col-span-full -mt-0.5 truncate text-[10px] text-faint">{statusText}</div>}
        </div>
      )}
    </div>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  fmt,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", disabled && "opacity-40", className)}>
      <TLabel className="w-[76px] shrink-0 truncate" title={label}>{label}</TLabel>
      <Slider
        aria-label={label}
        className="min-w-16 flex-1 [&_[data-slot=slider-range]]:bg-teal [&_[data-slot=slider-thumb]]:size-2.5 [&_[data-slot=slider-thumb]]:border-teal [&_[data-slot=slider-track]]:h-[3px] [&_[data-slot=slider-track]]:bg-line-strong"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
      <span className="t-mono w-10 shrink-0 text-right text-[10.5px] text-muted-foreground">{fmt(value)}</span>
    </div>
  );
}
