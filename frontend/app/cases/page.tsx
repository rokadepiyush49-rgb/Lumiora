import type { Metadata } from "next";
import { CaseTable } from "@/components/analysis/case-table";
import { Panel, PanelHeader } from "@/components/ui/workstation";

export const metadata: Metadata = { title: "Case History" };

export default function CasesPage() {
  return (
    <div className="p-3">
      <Panel>
        <PanelHeader index="CH" title="Recent analyses" meta="Server records merged with this browser's session history (metadata only)" />
        <CaseTable controls />
      </Panel>
    </div>
  );
}
