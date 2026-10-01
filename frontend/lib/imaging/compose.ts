"use client";

import { renderField } from "./saliency";

/** Static composite used for thumbnails and exports. */
export function composeXai(mode: "original" | "heatmap" | "overlay", img: HTMLCanvasElement | HTMLImageElement, heat: { values: Float32Array; width: number; height: number } | null, cmap: Parameters<typeof renderField>[3], opacity: number, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  if (mode !== "heatmap") ctx.drawImage(img, 0, 0, w, h);
  if (heat && mode !== "original") {
    const hc = renderField(heat.values, heat.width, heat.height, cmap, mode === "heatmap" ? "opaque" : "alpha");
    ctx.globalAlpha = mode === "heatmap" ? 1 : opacity;
    ctx.drawImage(hc, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  return c;
}
