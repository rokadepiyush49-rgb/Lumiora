"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { loadDataset, loadDemo, setView, useSession } from "@/lib/state/session";
import { useSessionViewerData } from "@/lib/state/use-viewer-data";
import { DATASET_SPECIMENS } from "@/lib/mock-data";
import { TissueViewer } from "@/components/medical/tissue-viewer";
import { UploadZone } from "./upload-zone";
import { SpecimenNavigator } from "./specimen-navigator";
import { AssessmentPanel } from "./assessment-panel";
import { ExplainabilityPanel } from "./explainability";
import { PipelinePanel } from "./pipeline";
import { ResultSummary } from "./result-summary";
import { BandStrip } from "@/components/spectral/band-parts";
import { Panel, PanelHeader } from "@/components/ui/workstation";

export function SessionViewer({ primary = true, className }: { primary?: boolean; className?: string }) {
  const data = useSessionViewerData();
  const view = useSession((s) => s.view);
  const phase = useSession((s) => s.phase);
  const stages = useSession((s) => s.stages);
  const specimen = useSession((s) => s.specimen);
  const running = stages.find((s) => s.status === "running");
  const busy = phase === "loading" ? "Decoding specimen" : phase === "running" ? running?.label ?? "Processing" : null;
  const statusText = specimen
    ? `RES ${specimen.width}×${specimen.height} · ${specimen.colorProfile} · MAG ${specimen.magnification}× nominal · CH ${view.channel === "RGB" ? "RGB" : view.channel} · ${phase === "complete" ? "INFERENCE COMPLETE" : phase === "running" ? "INFERENCE RUNNING" : "AWAITING INFERENCE"}`
    : undefined;
  return (
    <TissueViewer
      data={data}
      view={view}
      onView={setView}
      primary={primary}
      busy={busy}
      statusText={statusText}
      className={className}
      empty={<UploadZone />}
    />
  );
}

export function AnalysisWorkspace() {
  const params = useSearchParams();
  const phase = useSession((s) => s.phase);
  const specimenId = useSession((s) => s.specimen?.id);

  // Deep links: /analysis?specimen=SPECIMEN-001 or ?dataset=IDC-01200
  useEffect(() => {
    const sp = params.get("specimen");
    const ds = params.get("dataset");
    if (sp && sp !== specimenId) void loadDemo(sp);
    else if (ds && ds !== specimenId) {
      const s = DATASET_SPECIMENS.find((d) => d.id === ds);
      if (s) void loadDataset(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <div className="flex flex-col gap-2 p-2 md:gap-3 md:p-3">
      <div
        className={cn(
          "grid gap-2 md:gap-3",
          "grid-cols-1",
          "md:grid-cols-2",
          "xl:grid-cols-[250px_minmax(0,1fr)_320px] xl:grid-rows-[minmax(560px,calc(100dvh-340px))_auto]",
        )}
      >
        <SpecimenNavigator className="order-2 max-h-[560px] md:order-2 xl:order-none xl:col-start-1 xl:row-start-1 xl:max-h-none" />
        <Panel className="order-1 min-h-[440px] md:col-span-2 xl:order-none xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:min-h-0">
          <PanelHeader index="00" title="Histopathology viewer" meta={specimenId ?? "no specimen"} />
          <SessionViewer className="min-h-0 flex-1" />
        </Panel>
        <AssessmentPanel className="order-3 xl:order-none xl:col-start-3 xl:row-start-1" />
        <BandStrip className="order-4 md:col-span-2 xl:order-none xl:col-span-2 xl:col-start-1 xl:row-start-2" />
        <ExplainabilityPanel className="order-5 md:col-span-2 xl:order-none xl:col-span-1 xl:col-start-3 xl:row-start-2" />
      </div>
      <PipelinePanel />
      {phase === "complete" && <ResultSummary />}
    </div>
  );
}
