"use client";

import { useMemo } from "react";
import type { ViewerData } from "@/components/medical/tissue-viewer";
import { useSession } from "./session";

/** Assemble viewer input from the current analysis session. */
export function useSessionViewerData(): ViewerData | null {
  const image = useSession((s) => s.image);
  const imageUrl = useSession((s) => s.imageUrl);
  const specimen = useSession((s) => s.specimen);
  const bands = useSession((s) => s.bands);
  const edges = useSession((s) => s.edges);
  const tissue = useSession((s) => s.tissue);
  const result = useSession((s) => s.result);
  const mpp = useSession((s) => s.mpp);
  return useMemo(() => {
    if (!image || !imageUrl || !specimen) return null;
    return {
      key: `${specimen.id}:${imageUrl}`,
      src: imageUrl,
      width: image.width,
      height: image.height,
      sourceScale: image.displayScale,
      mpp,
      magnification: specimen.magnification,
      specimenId: specimen.id,
      work: image.work,
      workScale: image.workScale,
      bands,
      edges,
      gradcam: result?.gradcam ?? null,
      tiles: result?.tiles ?? null,
      threshold: result?.threshold ?? 0.5,
      boundary: tissue?.path ?? null,
      synthetic: specimen.synthetic,
      simulated: result?.source === "demo",
      colorSpace: "RGB",
    };
  }, [image, imageUrl, specimen, bands, edges, tissue, result, mpp]);
}
