"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Transform {
  k: number;
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

const MAX_K = 48;

/**
 * Pan/zoom state for an image of size (iw, ih) inside a container.
 * screen = image · k + (x, y). Optionally controlled for synchronised viewers.
 */
export function useViewport(iw: number, ih: number, opts: { controlled?: Transform | null; onChange?: (t: Transform) => void; padding?: number; key?: string } = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [local, setLocal] = useState<Transform>({ k: 1, x: 0, y: 0 });
  const t = opts.controlled ?? local;
  const tRef = useRef(t);
  tRef.current = t;
  const onChangeRef = useRef(opts.onChange);
  onChangeRef.current = opts.onChange;
  const padding = opts.padding ?? 0.94;

  const commit = useCallback(
    (next: Transform) => {
      if (opts.controlled !== undefined && onChangeRef.current) onChangeRef.current(next);
      else setLocal(next);
      tRef.current = next;
    },
    [opts.controlled],
  );

  // Stay fitted across container resizes until the user pans or zooms.
  const autoFit = useRef(true);

  const fitK = size.w && size.h && iw && ih ? Math.min(size.w / iw, size.h / ih) * padding : 1;
  const minK = fitK * 0.5;

  const fit = useCallback(() => {
    if (!size.w || !iw) return;
    const k = Math.min(size.w / iw, size.h / ih) * padding;
    autoFit.current = true;
    commit({ k, x: (size.w - iw * k) / 2, y: (size.h - ih * k) / 2 });
  }, [size.w, size.h, iw, ih, padding, commit]);

  const zoomAt = useCallback(
    (factor: number, sx?: number, sy?: number) => {
      const cur = tRef.current;
      autoFit.current = false;
      const k = Math.min(MAX_K, Math.max(minK, cur.k * factor));
      const cx = sx ?? size.w / 2;
      const cy = sy ?? size.h / 2;
      commit({ k, x: cx - ((cx - cur.x) * k) / cur.k, y: cy - ((cy - cur.y) * k) / cur.k });
    },
    [minK, size.w, size.h, commit],
  );

  const panBy = useCallback((dx: number, dy: number) => {
    const cur = tRef.current;
    autoFit.current = false;
    commit({ ...cur, x: cur.x + dx, y: cur.y + dy });
  }, [commit]);

  const centerOn = useCallback(
    (ix: number, iy: number) => {
      const cur = tRef.current;
      autoFit.current = false;
      commit({ ...cur, x: size.w / 2 - ix * cur.k, y: size.h / 2 - iy * cur.k });
    },
    [size.w, size.h, commit],
  );

  // Track container size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit when the image identity or container first becomes measurable.
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!size.w || !iw) return;
    if (opts.controlled) {
      // Controlled viewers signal "needs fit" with k = 0.
      if (opts.controlled.k === 0) fit();
      return;
    }
    const id = `${opts.key ?? ""}:${iw}x${ih}`;
    if (fittedFor.current !== id || autoFit.current) {
      fittedFor.current = id;
      fit();
    }
  }, [size.w, iw, ih, fit, opts.key, opts.controlled]);

  // Wheel zoom (non-passive so the page does not scroll).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * 0.0016), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Pointer pan + two-finger pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("[data-viewer-ui]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      const el = containerRef.current!;
      const r = el.getBoundingClientRect();
      if (pointers.current.size === 2) {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.current.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2 - r.left;
        const cy = (a.y + b.y) / 2 - r.top;
        if (pinch.current) {
          zoomAt(d / pinch.current.d, cx, cy);
          panBy(cx - pinch.current.cx, cy - pinch.current.cy);
        }
        pinch.current = { d, cx, cy };
        return;
      }
      panBy(e.clientX - prev.x, e.clientY - prev.y);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    },
    [panBy, zoomAt],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  }, []);

  return {
    containerRef,
    size,
    t,
    fitK,
    minK,
    maxK: MAX_K,
    fit,
    zoomAt,
    panBy,
    centerOn,
    setTransform: commit,
    dragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}

/** Round to 1/2/5 × 10^n. */
export function niceStep(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
