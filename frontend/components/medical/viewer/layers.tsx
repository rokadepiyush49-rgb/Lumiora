"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import type { BandChannel, GradCamResult, TileGrid } from "@/lib/types";
import { bandToCanvas } from "@/lib/imaging/bands";
import { renderField } from "@/lib/imaging/saliency";
import { colorAt, type ColormapName } from "@/lib/imaging/colormap";

const bandCanvasCache = new WeakMap<BandChannel, HTMLCanvasElement>();
export function bandCanvas(ch: BandChannel) {
  let c = bandCanvasCache.get(ch);
  if (!c) {
    c = bandToCanvas(ch);
    bandCanvasCache.set(ch, c);
  }
  return c;
}

/** Draws an off-DOM canvas into a DOM canvas stretched to image size. */
export const RasterLayer = memo(function RasterLayer({
  source,
  width,
  height,
  className,
  style,
  pixelated,
}: {
  source: HTMLCanvasElement | null;
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
  pixelated?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !source) return;
    c.width = source.width;
    c.height = source.height;
    c.getContext("2d")!.drawImage(source, 0, 0);
  }, [source]);
  if (!source) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      className={className}
      style={{ position: "absolute", left: 0, top: 0, width, height, imageRendering: pixelated ? "pixelated" : "auto", ...style }}
    />
  );
});

export function useHeatCanvas(g: GradCamResult | null | undefined, cmap: ColormapName, mode: "alpha" | "opaque") {
  return useMemo(() => (g ? renderField(g.values, g.width, g.height, cmap, mode) : null), [g, cmap, mode]);
}

export const TileLayer = memo(function TileLayer({
  tiles,
  width,
  height,
  threshold,
  cmap,
}: {
  tiles: TileGrid;
  width: number;
  height: number;
  threshold: number;
  cmap: ColormapName;
}) {
  const rects = useMemo(() => {
    const out: { x: number; y: number; s: number; p: number }[] = [];
    for (let r = 0; r < tiles.rows; r++) {
      for (let c = 0; c < tiles.cols; c++) {
        const p = tiles.probabilities[r * tiles.cols + c];
        if (Number.isNaN(p)) continue;
        out.push({ x: c * tiles.stride, y: r * tiles.stride, s: tiles.stride, p });
      }
    }
    return out;
  }, [tiles]);
  return (
    <svg aria-hidden className="pointer-events-none absolute left-0 top-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {rects.map((t, i) => (
        <rect
          key={i}
          x={t.x + 0.5}
          y={t.y + 0.5}
          width={Math.min(t.s, width - t.x) - 1}
          height={Math.min(t.s, height - t.y) - 1}
          fill={colorAt(cmap, t.p)}
          fillOpacity={t.p >= threshold ? 0.34 : 0.1}
          stroke={t.p >= threshold ? "var(--malignant)" : "oklch(1 0 0 / 0.18)"}
          strokeWidth={t.p >= threshold ? 1.25 : 0.75}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
});

export const BoundaryLayer = memo(function BoundaryLayer({ path, width, height }: { path: string; width: number; height: number }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute left-0 top-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" stroke="var(--teal)" strokeOpacity={0.9} strokeWidth={1.25} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});
