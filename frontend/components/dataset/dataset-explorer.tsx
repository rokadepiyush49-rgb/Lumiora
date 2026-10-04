"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Search } from "lucide-react";
import type { DatasetName, DatasetSpecimen, TissueClass } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DATASET_SPECIMENS, DATASET_STATS } from "@/lib/mock-data";
import { datasetThumbnail } from "@/lib/specimens";
import { loadDataset } from "@/lib/state/session";
import { EmptyState, Panel, PanelHeader, Segmented, Tag, TLabel } from "@/components/ui/workstation";

/* Thumbnails are rendered procedurally; queue them so the grid never janks. */
const queue: (() => void)[] = [];
let pumping = false;
function schedule(job: () => void) {
  queue.push(job);
  if (pumping) return;
  pumping = true;
  const pump = () => {
    const next = queue.shift();
    if (!next) {
      pumping = false;
      return;
    }
    next();
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) ric(pump);
    else setTimeout(pump, 16);
  };
  setTimeout(pump, 0);
}

function Thumb({ s }: { s: DatasetSpecimen }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          schedule(() => !cancelled && setSrc(datasetThumbnail(s)));
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [s]);
  return (
    <div ref={ref} className="relative aspect-square overflow-hidden bg-viewport">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" style={{ imageRendering: s.dataset === "IDC" ? "pixelated" : "auto" }} /> : <div className="absolute inset-0 animate-pulse bg-panel-2" />}
    </div>
  );
}

type ResBucket = "all" | "patch" | "field" | "large";
const resBucket = (s: DatasetSpecimen): ResBucket => (s.width <= 128 ? "patch" : s.width <= 1024 ? "field" : "large");

export function DatasetExplorer() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cls, setCls] = useState<"all" | TissueClass>("all");
  const [ds, setDs] = useState<"all" | DatasetName>("all");
  const [mag, setMag] = useState<"all" | "40" | "100" | "200" | "400">("all");
  const [res, setRes] = useState<ResBucket>("all");
  const [sort, setSort] = useState<"id" | "class" | "mag" | "res">("id");

  const rows = useMemo(() => {
    const r = DATASET_SPECIMENS.filter(
      (s) =>
        (cls === "all" || s.label === cls) &&
        (ds === "all" || s.dataset === ds) &&
        (mag === "all" || String(s.magnification) === mag) &&
        (res === "all" || resBucket(s) === res) &&
        (!q || `${s.id} ${s.patient} ${s.subtype ?? ""} ${s.dataset}`.toLowerCase().includes(q.toLowerCase())),
    );
    const key = { id: (s: DatasetSpecimen) => s.id, class: (s: DatasetSpecimen) => s.label + s.id, mag: (s: DatasetSpecimen) => String(s.magnification).padStart(3, "0") + s.id, res: (s: DatasetSpecimen) => String(s.width * s.height).padStart(9, "0") }[sort];
    return [...r].sort((a, b) => key(a).localeCompare(key(b)));
  }, [q, cls, ds, mag, res, sort]);

  const nCancer = rows.filter((r) => r.label === "cancerous").length;

  const open = async (s: DatasetSpecimen) => {
    router.push("/analysis");
    await loadDataset(s);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid gap-px border border-line bg-line md:grid-cols-3">
        {(Object.keys(DATASET_STATS) as DatasetName[]).map((k) => {
          const d = DATASET_STATS[k];
          return (
            <div key={k} className="bg-panel p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="t-mono text-[13px] font-medium text-foreground">{k}</span>
                <span className="t-mono text-[10px] text-faint">{d.source}</span>
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">{d.title}</div>
              <dl className="t-mono mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px]">
                <dt className="text-faint">Images</dt>
                <dd className="text-right text-foreground">{d.images}</dd>
                <dt className="text-faint">Source</dt>
                <dd className="text-right text-foreground">{d.patients}</dd>
                <dt className="text-faint">Classes</dt>
                <dd className="text-right text-foreground">{d.split}</dd>
                <dt className="text-faint">Resolution</dt>
                <dd className="text-right text-foreground">{d.resolution}</dd>
                <dt className="text-faint">Magnification</dt>
                <dd className="text-right text-foreground">{d.magnification}</dd>
              </dl>
            </div>
          );
        })}
      </div>

      <Panel>
        <PanelHeader
          index="DS"
          title="Specimen browser"
          meta={`${rows.length} of ${DATASET_SPECIMENS.length} · ${nCancer} cancerous / ${rows.length - nCancer} benign`}
          actions={<Tag>Synthetic previews · dataset not bundled</Tag>}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-2">
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2 size-3.5 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ID, patient, subtype…"
              aria-label="Search specimens"
              className="t-mono h-7 w-52 rounded-[3px] border border-line bg-viewport pr-2 pl-7 text-[11.5px] text-foreground outline-none placeholder:text-faint focus:border-teal"
            />
          </label>
          <div className="flex items-center gap-1.5">
            <TLabel>Class</TLabel>
            <Segmented label="Class" value={cls} onChange={setCls} options={[{ value: "all", label: "All" }, { value: "benign", label: "Benign" }, { value: "cancerous", label: "Cancerous" }]} />
          </div>
          <div className="flex items-center gap-1.5">
            <TLabel>Dataset</TLabel>
            <Segmented label="Dataset" value={ds} onChange={setDs} options={[{ value: "all", label: "All" }, { value: "IDC", label: "IDC" }, { value: "BreakHis", label: "BreakHis" }, { value: "Custom", label: "Custom" }]} />
          </div>
          <div className="flex items-center gap-1.5">
            <TLabel>Mag</TLabel>
            <Segmented label="Magnification" value={mag} onChange={setMag} options={[{ value: "all", label: "All" }, { value: "40", label: "40×" }, { value: "100", label: "100×" }, { value: "200", label: "200×" }, { value: "400", label: "400×" }]} />
          </div>
          <div className="flex items-center gap-1.5">
            <TLabel>Size</TLabel>
            <Segmented label="Image dimensions" value={res} onChange={setRes} options={[{ value: "all", label: "All" }, { value: "patch", label: "≤128" }, { value: "field", label: "≤1024" }, { value: "large", label: ">1024" }]} />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <TLabel>Sort</TLabel>
            <Segmented label="Sort" value={sort} onChange={setSort} options={[{ value: "id", label: "ID" }, { value: "class", label: "Class" }, { value: "mag", label: "Mag" }, { value: "res", label: "Res" }]} />
          </div>
        </div>
        {rows.length ? (
          <ul className="grid grid-cols-2 gap-px bg-line p-px sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
            {rows.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => void open(s)} className="group flex w-full flex-col bg-panel text-left transition-colors hover:bg-panel-2" aria-label={`Open ${s.id} in analysis workspace`}>
                  <div className="relative">
                    <Thumb s={s} />
                    <span className={cn("absolute top-1.5 left-1.5 size-1.5 rounded-full", s.label === "cancerous" ? "bg-malignant" : "bg-benign")} aria-hidden />
                    <span className="t-mono absolute right-1.5 bottom-1.5 bg-viewport/80 px-1 text-[9px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">ANALYZE →</span>
                  </div>
                  <div className="flex flex-col gap-0.5 border-t border-line px-2 py-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="t-mono text-[11px] text-foreground">{s.id}</span>
                      <span className={cn("t-mono text-[9.5px] uppercase", s.label === "cancerous" ? "text-malignant" : "text-benign")}>{s.label === "cancerous" ? "Canc." : "Benign"}</span>
                    </div>
                    <div className="t-mono flex justify-between text-[9.5px] text-dim">
                      <span>{s.magnification}×</span>
                      <span>
                        {s.width}×{s.height}
                      </span>
                    </div>
                    <div className="truncate text-[10px] text-faint">{s.subtype ?? s.patient}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Database />} title="No specimens match the filters" />
        )}
      </Panel>
    </div>
  );
}
