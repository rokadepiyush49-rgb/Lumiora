"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { GradCamResult, TileGrid } from "@/lib/types";
import type { Store } from "@/lib/state/store";
import { useStore } from "@/lib/state/store";
import { rgbToHsv8, rgbToLab8 } from "@/lib/imaging/bands";
import { colormapCss, type ColormapName } from "@/lib/imaging/colormap";
import { niceStep, type Size, type Transform } from "./use-viewport";
import { cn } from "@/lib/utils";

export interface Cursor {
  sx: number;
  sy: number;
  inside: boolean;
}

/* ---------------------------------------------------- rulers + graticule */

export const Graticule = memo(function Graticule({ t, size, iw, ih, sourceScale, grid, rulers }: { t: Transform; size: Size; iw: number; ih: number; sourceScale: number; grid: boolean; rulers: boolean }) {
  if (!size.w || !t.k) return null;
  const stepImg = niceStep(110 / t.k / sourceScale) * sourceScale; // display px per step, labelled in source px
  const xs: number[] = [];
  const ys: number[] = [];
  const x0 = Math.max(0, Math.floor(-t.x / t.k / stepImg) * stepImg);
  const y0 = Math.max(0, Math.floor(-t.y / t.k / stepImg) * stepImg);
  for (let v = x0; v <= iw && v * t.k + t.x <= size.w; v += stepImg) if (v * t.k + t.x >= 0) xs.push(v);
  for (let v = y0; v <= ih && v * t.k + t.y <= size.h; v += stepImg) if (v * t.k + t.y >= 0) ys.push(v);
  const label = (v: number) => {
    const s = Math.round(v / sourceScale);
    return s >= 10000 ? `${(s / 1000).toFixed(0)}k` : String(s);
  };
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
      {grid && (
        <g stroke="oklch(1 0 0 / 0.09)" strokeWidth={1}>
          {xs.map((v) => (
            <line key={`x${v}`} x1={Math.round(v * t.k + t.x) + 0.5} x2={Math.round(v * t.k + t.x) + 0.5} y1={Math.max(0, t.y)} y2={Math.min(size.h, ih * t.k + t.y)} />
          ))}
          {ys.map((v) => (
            <line key={`y${v}`} y1={Math.round(v * t.k + t.y) + 0.5} y2={Math.round(v * t.k + t.y) + 0.5} x1={Math.max(0, t.x)} x2={Math.min(size.w, iw * t.k + t.x)} />
          ))}
        </g>
      )}
      {rulers && (
        <g className="t-mono" fontSize={9} fill="var(--dim)">
          <rect x={0} y={0} width={size.w} height={15} fill="oklch(0.105 0.003 250 / 0.82)" />
          <rect x={0} y={0} width={15} height={size.h} fill="oklch(0.105 0.003 250 / 0.82)" />
          <line x1={0} x2={size.w} y1={15.5} y2={15.5} stroke="var(--line)" />
          <line y1={0} y2={size.h} x1={15.5} x2={15.5} stroke="var(--line)" />
          {xs.map((v) => {
            const sx = Math.round(v * t.k + t.x) + 0.5;
            return (
              <g key={`rx${v}`}>
                <line x1={sx} x2={sx} y1={9} y2={15} stroke="var(--faint)" />
                {sx > 30 && <text x={sx + 3} y={9}>{label(v)}</text>}
              </g>
            );
          })}
          {ys.map((v) => {
            const sy = Math.round(v * t.k + t.y) + 0.5;
            return (
              <g key={`ry${v}`}>
                <line y1={sy} y2={sy} x1={9} x2={15} stroke="var(--faint)" />
                {sy > 30 && (
                  <text x={9} y={sy + 3} transform={`rotate(-90 9 ${sy + 3})`} textAnchor="end">
                    {label(v)}
                  </text>
                )}
              </g>
            );
          })}
          <rect x={0} y={0} width={15} height={15} fill="var(--viewport)" />
        </g>
      )}
    </svg>
  );
});

/* ------------------------------------------------------------ crosshair */

export function Crosshair({ cursor, size }: { cursor: Store<Cursor>; size: Size }) {
  const c = useStore(cursor, (s) => s);
  if (!c.inside) return null;
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
      <g stroke="var(--teal)" strokeOpacity={0.55} strokeWidth={1}>
        <line x1={0} x2={c.sx - 10} y1={c.sy + 0.5} y2={c.sy + 0.5} />
        <line x1={c.sx + 10} x2={size.w} y1={c.sy + 0.5} y2={c.sy + 0.5} />
        <line y1={0} y2={c.sy - 10} x1={c.sx + 0.5} x2={c.sx + 0.5} />
        <line y1={c.sy + 10} y2={size.h} x1={c.sx + 0.5} x2={c.sx + 0.5} />
      </g>
      <circle cx={c.sx + 0.5} cy={c.sy + 0.5} r={6} fill="none" stroke="var(--teal)" strokeWidth={1} />
    </svg>
  );
}

/* -------------------------------------------------------- pixel readout */

export function Readout({
  cursor,
  t,
  iw,
  ih,
  sourceScale,
  work,
  workScale,
  gradcam,
  tiles,
  className,
}: {
  cursor: Store<Cursor>;
  t: Transform;
  iw: number;
  ih: number;
  sourceScale: number;
  work?: ImageData | null;
  workScale?: number;
  gradcam?: GradCamResult | null;
  tiles?: TileGrid | null;
  className?: string;
}) {
  const c = useStore(cursor, (s) => s);
  const ix = (c.sx - t.x) / t.k;
  const iy = (c.sy - t.y) / t.k;
  const inside = c.inside && ix >= 0 && iy >= 0 && ix < iw && iy < ih;
  let rgb: [number, number, number] | null = null;
  if (inside && work && workScale) {
    const wx = Math.min(work.width - 1, Math.floor(ix * workScale));
    const wy = Math.min(work.height - 1, Math.floor(iy * workScale));
    const p = (wy * work.width + wx) * 4;
    rgb = [work.data[p], work.data[p + 1], work.data[p + 2]];
  }
  const hsv = rgb ? rgbToHsv8(...rgb) : null;
  const lab = rgb ? rgbToLab8(...rgb) : null;
  let sal: number | null = null;
  if (inside && gradcam) {
    const gx = Math.min(gradcam.width - 1, Math.floor((ix / iw) * gradcam.width));
    const gy = Math.min(gradcam.height - 1, Math.floor((iy / ih) * gradcam.height));
    sal = gradcam.values[gy * gradcam.width + gx];
  }
  let tp: number | null = null;
  if (inside && tiles) {
    const col = Math.floor(ix / tiles.stride);
    const row = Math.floor(iy / tiles.stride);
    const v = tiles.probabilities[row * tiles.cols + col];
    tp = v == null || Number.isNaN(v) ? null : v;
  }
  const f = (n: number | undefined) => (n == null ? "···" : String(Math.round(n)).padStart(3, " "));
  return (
    <div className={cn("t-mono pointer-events-none rounded-[2px] border border-line bg-viewport/85 px-2 py-1.5 text-[10px] leading-[15px] text-muted-foreground backdrop-blur-[2px]", className)}>
      <div className="flex gap-3 text-foreground">
        <span>X {inside ? String(Math.round(ix / sourceScale)).padStart(5, " ") : "  ···"}</span>
        <span>Y {inside ? String(Math.round(iy / sourceScale)).padStart(5, " ") : "  ···"}</span>
        <span className="text-teal">ZOOM {(t.k * sourceScale).toFixed(t.k * sourceScale < 10 ? 2 : 1)}×</span>
      </div>
      <div className="whitespace-pre">
        <span className="text-faint">RGB </span>
        {f(rgb?.[0])} {f(rgb?.[1])} {f(rgb?.[2])}
        <span className="text-faint">  HSV </span>
        {f(hsv?.[0])} {f(hsv?.[1])} {f(hsv?.[2])}
      </div>
      <div className="whitespace-pre">
        <span className="text-faint">LAB </span>
        {f(lab?.[0])} {f(lab?.[1])} {f(lab?.[2])}
        {gradcam && (
          <>
            <span className="text-faint">  CAM </span>
            {sal == null ? "····" : sal.toFixed(2)}
          </>
        )}
        {tiles && (
          <>
            <span className="text-faint">  P </span>
            <span className={tp != null && tp >= 0.5 ? "text-malignant" : undefined}>{tp == null ? "····" : tp.toFixed(2)}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ scale bar */

export function ScaleBar({ k, mpp, sourceScale, className }: { k: number; mpp: number; sourceScale: number; className?: string }) {
  if (!k || !mpp) return null;
  // display px → µm: mpp is per *source* pixel
  const umPerScreenPx = mpp / (k * sourceScale);
  const um = niceStep(110 * umPerScreenPx);
  const px = um / umPerScreenPx;
  return (
    <div className={cn("pointer-events-none flex flex-col gap-1", className)} aria-label={`Scale bar ${um} micrometres`}>
      <span className="t-mono text-[10px] text-foreground/90 [text-shadow:0_1px_2px_black]">{um >= 1000 ? `${um / 1000} mm` : `${um} µm`}</span>
      <div className="relative h-[5px] border-x border-b border-foreground/90" style={{ width: px }}>
        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground/90" />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- minimap */

export function Minimap({ src, iw, ih, t, size, onNavigate, className }: { src: string; iw: number; ih: number; t: Transform; size: Size; onNavigate: (ix: number, iy: number) => void; className?: string }) {
  const W = 132;
  const H = Math.round((W * ih) / iw);
  const s = W / iw;
  const vx = (-t.x / t.k) * s;
  const vy = (-t.y / t.k) * s;
  const vw = (size.w / t.k) * s;
  const vh = (size.h / t.k) * s;
  const drag = useRef(false);
  const go = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onNavigate(((e.clientX - r.left) / W) * iw, ((e.clientY - r.top) / H) * ih);
  };
  const full = vw >= W && vh >= H;
  return (
    <div
      data-viewer-ui
      role="img"
      aria-label="Overview navigator — click to recentre"
      className={cn("relative cursor-crosshair overflow-hidden border border-line-strong bg-viewport shadow-lg", className)}
      style={{ width: W, height: H }}
      onPointerDown={(e) => {
        drag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        go(e);
      }}
      onPointerMove={(e) => drag.current && go(e)}
      onPointerUp={() => (drag.current = false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="absolute inset-0 h-full w-full opacity-80" draggable={false} />
      {!full && (
        <div
          className="absolute border border-teal bg-teal/10"
          style={{ left: Math.max(0, vx), top: Math.max(0, vy), width: Math.min(W, vw + Math.min(0, vx)), height: Math.min(H, vh + Math.min(0, vy)) }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------ swipe divider */

export function SwipeDivider({ pos, onChange, size }: { pos: number; onChange: (p: number) => void; size: Size }) {
  const [drag, setDrag] = useState(false);
  const x = pos * size.w;
  return (
    <div
      data-viewer-ui
      className="absolute inset-y-0 z-10 w-4 -translate-x-1/2 cursor-ew-resize"
      style={{ left: x }}
      role="slider"
      aria-label="Swipe comparison divider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos * 100)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onChange(Math.max(0, pos - 0.02));
        if (e.key === "ArrowRight") onChange(Math.min(1, pos + 0.02));
      }}
      onPointerDown={(e) => {
        setDrag(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        onChange(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      }}
      onPointerUp={() => setDrag(false)}
    >
      <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" />
      <div className="t-mono absolute top-1/2 left-1/2 flex h-6 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-[2px] border border-foreground/70 bg-viewport px-1 text-[9px] text-foreground">
        ◂▸
      </div>
      <span className="t-mono absolute top-5 right-3 whitespace-nowrap text-[9px] tracking-[0.12em] text-foreground/80 [text-shadow:0_1px_2px_black]">ORIGINAL</span>
      <span className="t-mono absolute top-5 left-3 whitespace-nowrap text-[9px] tracking-[0.12em] text-foreground/80 [text-shadow:0_1px_2px_black]">PROCESSED</span>
    </div>
  );
}

/* --------------------------------------------------------- colour bar */

export function Colorbar({ cmap, label = "Grad-CAM activation", className }: { cmap: ColormapName; label?: string; className?: string }) {
  const bg = useMemo(() => colormapCss(cmap), [cmap]);
  return (
    <div className={cn("pointer-events-none flex flex-col gap-1", className)}>
      <span className="t-label !text-[9px] !text-foreground/75">{label}</span>
      <div className="h-1.5 w-36 border border-foreground/30" style={{ background: bg }} />
      <div className="t-mono flex w-36 justify-between text-[9px] text-foreground/70">
        <span>0.0</span>
        <span>0.5</span>
        <span>1.0</span>
      </div>
    </div>
  );
}

/** Track pointer position in container space without re-rendering the viewer. */
export function useCursorTracking(el: React.RefObject<HTMLDivElement | null>, cursor: Store<Cursor>) {
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => cursor.set({ sx, sy, inside: true }));
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      cursor.set({ inside: false });
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerleave", leave);
    return () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [el, cursor]);
}
