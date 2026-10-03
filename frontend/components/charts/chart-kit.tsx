"use client";

/**
 * Shared chart chrome for Recharts.
 *
 * Palette validated with the dataviz validator against the panel surface
 * (#0e1012, dark): all-pairs CVD ΔE ≥ 9.9, normal-vision ΔE ≥ 18.3, contrast ≥ 3:1.
 * Max three categorical series per plot — nine-band comparisons are faceted
 * by colour space (RGB / HSV / LAB) instead of cycling hues.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader, Segmented } from "@/components/ui/workstation";

export const SERIES = ["#00a6b5", "#cb8230", "#8673d9"] as const;
export const MUTED_MARK = "oklch(0.42 0.009 250)";

export const AXIS = {
  stroke: "var(--line-strong)",
  tick: { fill: "var(--dim)", fontSize: 10, fontFamily: "var(--font-plex-mono)" },
  tickLine: false,
} as const;

export const GRID = { stroke: "var(--line)", strokeDasharray: "0", vertical: false } as const;

interface TipRow {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  stroke?: string;
  fill?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelFmt,
  valueFmt = (v) => (typeof v === "number" ? v.toFixed(3) : String(v)),
}: {
  active?: boolean;
  payload?: TipRow[];
  label?: string | number;
  labelFmt?: (l: string | number | undefined) => string;
  valueFmt?: (v: number | string, name?: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="t-mono min-w-[120px] rounded-[2px] border border-line-strong bg-popover px-2.5 py-2 text-[10.5px] shadow-xl">
      {label != null && <div className="mb-1 text-[9.5px] tracking-[0.1em] text-dim uppercase">{labelFmt ? labelFmt(label) : label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-px">
          <span className="h-[2px] w-2.5 shrink-0" style={{ background: p.color ?? p.stroke ?? p.fill }} aria-hidden />
          <span className="font-medium text-foreground">{Array.isArray(p.value) ? p.value.map((v) => valueFmt(v, p.name)).join(" – ") : p.value != null ? valueFmt(p.value, p.name) : "—"}</span>
          <span className="ml-auto pl-3 text-dim">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items, className }: { items: { label: string; color: string; kind?: "line" | "rect" }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {items.map((it) => (
        <li key={it.label} className="t-mono flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span aria-hidden className={it.kind === "rect" ? "size-2 rounded-[1px]" : "h-[2px] w-3"} style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export interface TableSpec {
  columns: string[];
  rows: (string | number)[][];
}

/** Panel with a Chart / Table switch — every chart has a table-view twin. */
export function ChartFrame({
  title,
  index,
  meta,
  legend,
  table,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  index?: string;
  meta?: React.ReactNode;
  legend?: React.ReactNode;
  table?: TableSpec;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  return (
    <Panel className={className}>
      <PanelHeader
        index={index}
        title={title}
        meta={meta}
        actions={
          <>
            {actions}
            {table && (
              <Segmented<"chart" | "table">
                label={`${title} view`}
                size="xs"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "chart", label: "Chart" },
                  { value: "table", label: "Table" },
                ]}
              />
            )}
          </>
        }
      />
      {legend && mode === "chart" && <div className="px-3 pt-2">{legend}</div>}
      {mode === "chart" || !table ? (
        <div className={cn("px-2 pt-2 pb-1", bodyClassName)}>{children}</div>
      ) : (
        <div className="max-h-[320px] overflow-auto">
          <table className="t-mono w-full text-left text-[10.5px]">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line">
                {table.columns.map((c) => (
                  <th key={c} className="px-3 py-1.5 font-medium tracking-[0.08em] text-dim uppercase">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-b border-line/50">
                  {r.map((v, j) => (
                    <td key={j} className={cn("px-3 py-1", j === 0 ? "text-foreground" : "text-muted-foreground")}>
                      {typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(4)) : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
