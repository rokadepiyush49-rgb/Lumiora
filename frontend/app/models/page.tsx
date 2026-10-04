import type { Metadata } from "next";
import { PerformanceDashboard } from "@/components/models/performance";

export const metadata: Metadata = { title: "Model Performance" };

export default function ModelsPage() {
  return <PerformanceDashboard />;
}
