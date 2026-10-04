import type { Metadata } from "next";
import { SpectralWorkbench } from "@/components/spectral/spectral-workbench";

export const metadata: Metadata = { title: "Spectral Bands" };

export default function SpectralPage() {
  return <SpectralWorkbench />;
}
