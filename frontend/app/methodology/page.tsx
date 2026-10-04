import type { Metadata } from "next";
import { Methodology } from "@/components/methodology/methodology";

export const metadata: Metadata = { title: "Research Notes" };

export default function MethodologyPage() {
  return <Methodology />;
}
