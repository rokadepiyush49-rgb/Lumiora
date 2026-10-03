"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Command as CommandIcon, Cpu, Menu, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";
import { SidebarNav, ModelStatusBlock } from "./sidebar";
import { Wordmark } from "./logo";
import { Kbd, StatusDot, ToolButton } from "@/components/ui/workstation";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useBackend } from "@/lib/state/backend";
import { useSession } from "@/lib/state/session";
import { useSettings } from "@/lib/state/settings";
import { openCommandPalette, openSettings, openShortcuts } from "./overlays";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-center border-l border-line px-3 first:border-l-0", className)}>
      <span className="t-label !text-[9px] leading-3 !text-faint">{label}</span>
      <span className="t-mono truncate text-[11.5px] leading-4 text-foreground">{children}</span>
    </div>
  );
}

export function ConnectionBadge({ compact = false }: { compact?: boolean }) {
  const mode = useBackend((s) => s.mode);
  const health = useBackend((s) => s.health);
  const reason = useBackend((s) => s.reason);
  const label = mode === "connected" ? "Connected" : mode === "checking" ? "Probing" : "Demo mode";
  return (
    <button
      type="button"
      onClick={openSettings}
      title={reason ?? (health ? `Backend ${health.version ?? ""} · ${health.latencyMs?.toFixed(0)} ms` : "")}
      className={cn(
        "t-mono inline-flex h-6 items-center gap-1.5 rounded-[2px] border px-2 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors",
        mode === "connected" && "border-ok/40 text-ok hover:bg-ok/8",
        mode === "demo" && "hatch border-warn/45 text-warn hover:bg-warn/8",
        mode === "checking" && "border-teal/40 text-teal",
      )}
    >
      <StatusDot tone={mode === "connected" ? "ok" : mode === "checking" ? "busy" : "warn"} />
      {compact ? (mode === "demo" ? "Demo" : label) : label}
    </button>
  );
}

export function Topbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = NAV_ITEMS.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));
  const caseId = useSession((s) => s.caseId);
  const phase = useSession((s) => s.phase);
  const stages = useSession((s) => s.stages);
  const dataset = useSession((s) => s.specimen?.dataset);
  const health = useBackend((s) => s.health);
  const mode = useBackend((s) => s.mode);
  const researcher = useSettings((s) => s.researcher);
  const running = stages.find((s) => s.status === "running");

  const statusText =
    phase === "running" ? running?.label ?? "Processing" : phase === "complete" ? "Complete" : phase === "loaded" ? "Specimen loaded" : phase === "loading" ? "Loading" : phase === "error" ? "Error" : "Idle";
  const statusTone = phase === "running" || phase === "loading" ? "busy" : phase === "complete" ? "ok" : phase === "error" ? "error" : phase === "loaded" ? "teal" : "idle";

  const compute = mode === "connected" ? `${health?.device ?? "—"}${health?.deviceName ? ` · ${health.deviceName}` : ""}` : "CPU · browser";

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-stretch border-b border-line bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-r border-line px-2 md:hidden">
        <ToolButton label="Open navigation" onClick={() => setMenuOpen(true)}>
          <Menu />
        </ToolButton>
      </div>
      <div className="flex min-w-0 items-center gap-2 px-3 md:px-4">
        <span className="t-mono hidden text-[10px] tracking-[0.12em] text-faint sm:inline">{current?.code ?? "—"}</span>
        <h1 className="truncate text-[13px] font-medium text-foreground">{current?.label ?? "NEXUS PATH"}</h1>
      </div>

      <div className="ml-auto hidden min-w-0 items-stretch py-1.5 lg:flex">
        <Field label="Analysis ID">{caseId ?? "—"}</Field>
        <Field label="Dataset" className="max-w-[180px]">{dataset ?? "IDC · v1"}</Field>
        <Field label="Model">MobileNetV2</Field>
        <Field label="Status" className="min-w-[132px]">
          <span className="inline-flex items-center gap-1.5">
            <StatusDot tone={statusTone} />
            {statusText}
          </span>
        </Field>
        <Field label="Compute" className="hidden max-w-[170px] xl:flex">
          <span className="inline-flex items-center gap-1.5">
            <Cpu className="size-3 text-dim" />
            {compute}
          </span>
        </Field>
      </div>

      <div className="ml-auto flex items-center gap-1.5 border-l border-line px-2 lg:ml-0">
        <ConnectionBadge />
        <button
          type="button"
          onClick={openCommandPalette}
          className="hidden h-7 items-center gap-2 rounded-[3px] border border-line px-2 text-[11px] text-dim transition-colors hover:border-line-strong hover:text-foreground sm:inline-flex"
          aria-label="Open command palette"
        >
          <CommandIcon className="size-3" />
          <span>Commands</span>
          <Kbd>⌘K</Kbd>
        </button>
        <ToolButton label="Settings" onClick={openSettings}>
          <Settings2 />
        </ToolButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Researcher profile"
                className="t-mono ml-0.5 inline-flex size-7 items-center justify-center rounded-full border border-line-strong bg-panel-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
              />
            }
          >
            {researcher
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="text-[12px] text-foreground">{researcher}</div>
                <div className="t-mono text-[10px] text-dim">Local session · no PHI stored</div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={openSettings}>Workstation settings</DropdownMenuItem>
            <DropdownMenuItem onClick={openShortcuts}>Keyboard shortcuts</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[260px] border-line bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-12 items-center border-b border-line px-3.5">
            <Wordmark />
          </div>
          <div className="py-4">
            <SidebarNav onNavigate={() => setMenuOpen(false)} />
          </div>
          <div className="border-t border-line py-3">
            <ModelStatusBlock />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
