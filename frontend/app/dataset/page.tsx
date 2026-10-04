import type { Metadata } from "next";
import { DatasetExplorer } from "@/components/dataset/dataset-explorer";

export const metadata: Metadata = { title: "Dataset Explorer" };

export default function DatasetPage() {
  return <DatasetExplorer />;
}
