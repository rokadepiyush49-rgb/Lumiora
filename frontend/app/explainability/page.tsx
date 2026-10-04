import type { Metadata } from "next";
import { XaiWorkbench } from "@/components/explainability/xai-workbench";

export const metadata: Metadata = { title: "Explainability" };

export default function ExplainabilityPage() {
  return <XaiWorkbench />;
}
