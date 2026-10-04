import { Suspense } from "react";
import type { Metadata } from "next";
import { AnalysisWorkspace } from "@/components/analysis/workspace";

export const metadata: Metadata = { title: "Analysis" };

export default function AnalysisPage() {
  return (
    <Suspense>
      <AnalysisWorkspace />
    </Suspense>
  );
}
