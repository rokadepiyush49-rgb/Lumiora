"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav";
import { Wordmark } from "./logo";
import { StatusDot, ToolButton } from "@/components/ui/workstation";
import { useBackend } from "@/lib/state/backend";
import { updateSettings, useSettings } from "@/lib/state/settings";
import { MODEL_INFO } from "@/lib/mock-data";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-5 px-2">
      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          {!collapsed && <div className="t-label mb-1.5 px-2 !text-[9.5px] !text-faint">{g.label}</div>}
          <ul className="flex flex-col gap-px">
            {g.items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-8 items-center gap-2.5 rounded-[3px] px-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-elevated/70 hover:text-foreground",
                    active && "bg-elevated text-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  {active && <span className="absolute inset-y-1.5 left-0 w-[2px] bg-teal" aria-hidden />}
                  <Icon className={cn("size-[15px] shrink-0", active ? "text-teal" : "text-dim group-hover:text-muted-foreground")} />
                  {!collapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      <span className="t-mono ml-auto text-[9px] tracking-[0.1em] text-faint opacity-0 transition-opacity group-hover:opacity-100">{item.code}</span>
                    </>
                  )}
                </Link>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger render={<div />}>{link}</TooltipTrigger>
                      <TooltipContent side="right" className="rounded-[3px] border border-line-strong bg-elevated px-2 py-1 text-[11px] text-foreground [&>svg]:hidden">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function ModelStatusBlock({ collapsed }: { collapsed?: boolean }) {
  const mode = useBackend((s) => s.mode);
  const health = useBackend((s) => s.health);
  const ready = mode === "connected" && health?.modelLoaded;
  const tone = mode === "checking" ? "busy" : ready ? "ok" : "warn";
  const status = mode === "checking" ? "Probing" : ready ? "Ready" : mode === "connected" ? "Not loaded" : "Demo engine";
  if (collapsed) {
    return (
      <div className="flex justify-center py-2" title={`MobileNetV2 · ${status}`}>
        <StatusDot tone={tone} className="size-2" />
      </div>
    );
  }
  return (
    <div className="mx-2 border border-line bg-panel/60 px-2.5 py-2">
      <dl className="grid grid-cols-2 gap-y-1.5">
        <dt className="t-label !text-[9.5px]">Model</dt>
        <dd className="t-mono text-right text-[11px] text-foreground">MobileNetV2</dd>
        <dt className="t-label !text-[9.5px]">Status</dt>
        <dd className="flex items-center justify-end gap-1.5 text-[11px]">
          <StatusDot tone={tone} />
          <span className={cn("t-mono", ready ? "text-ok" : mode === "checking" ? "text-teal" : "text-warn")}>{status}</span>
        </dd>
        <dt className="t-label !text-[9.5px]">Input</dt>
        <dd className="t-mono text-right text-[11px] text-muted-foreground">{MODEL_INFO.inputShape.join("×")}</dd>
      </dl>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useSettings((s) => s.sidebarCollapsed);
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-200 md:flex",
        collapsed ? "w-[56px]" : "w-[232px]",
      )}
    >
      <div className={cn("flex h-12 items-center border-b border-line", collapsed ? "justify-center px-0" : "px-3.5")}>
        <Link href="/" aria-label="NEXUS PATH home" className="rounded-[3px]">
          <Wordmark collapsed={collapsed} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className="flex flex-col gap-2 border-t border-line py-3">
        <ModelStatusBlock collapsed={collapsed} />
        <div className={cn("flex items-center px-3", collapsed ? "justify-center px-0" : "justify-between")}>
          {!collapsed && <span className="t-mono text-[10px] text-faint">v0.1 · Research</span>}
          <ToolButton
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            shortcut="["
            side="right"
            onClick={() => updateSettings({ sidebarCollapsed: !collapsed })}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </ToolButton>
        </div>
      </div>
    </aside>
  );
}
