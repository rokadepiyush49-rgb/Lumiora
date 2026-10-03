"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileDown, FlaskConical, Keyboard, Play, RefreshCw, ScanEye, Settings2, Trash2 } from "lucide-react";
import { createStore, useStore } from "@/lib/state/store";
import { NAV_ITEMS } from "./nav";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ActionButton, Kbd, Segmented, StatusDot, TLabel } from "@/components/ui/workstation";
import { settingsStore, updateSettings, useSettings } from "@/lib/state/settings";
import { backendStore, checkBackend, useBackend } from "@/lib/state/backend";
import { clearSession, loadDemo, runAnalysis, setView, useSession } from "@/lib/state/session";
import { DEMO_SPECIMENS } from "@/lib/mock-data";
import { COLORMAPS, type ColormapName } from "@/lib/imaging/colormap";
import { probeBackend } from "@/lib/api";
import { ExportDialog } from "@/components/analysis/export-dialog";

const overlayStore = createStore({ palette: false, settings: false, shortcuts: false, export: false });
export const openCommandPalette = () => overlayStore.set({ palette: true });
export const openSettings = () => overlayStore.set({ settings: true });
export const openShortcuts = () => overlayStore.set({ shortcuts: true });
export const openExport = () => overlayStore.set({ export: true });

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/** Global keyboard map: ⌘K palette, ? help, [ sidebar, g-prefixed navigation, ⌘↵ run. */
function useGlobalKeys() {
  const router = useRouter();
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const goto: Record<string, string> = Object.fromEntries(NAV_ITEMS.map((n) => [n.shortcut!.split(" ")[1].toLowerCase(), n.href]));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        overlayStore.set({ palette: !overlayStore.get().palette });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void runAnalysis();
        return;
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (pending.current) {
        window.clearTimeout(pending.current);
        pending.current = null;
        const href = goto[e.key.toLowerCase()];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }
      if (e.key === "g") {
        pending.current = window.setTimeout(() => (pending.current = null), 900);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        openShortcuts();
      } else if (e.key === "[") {
        updateSettings({ sidebarCollapsed: !getSettingsSnapshot().sidebarCollapsed });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

const getSettingsSnapshot = () => settingsStore.get();

function Palette() {
  const open = useStore(overlayStore, (s) => s.palette);
  const router = useRouter();
  const phase = useSession((s) => s.phase);
  const mode = useBackend((s) => s.mode);
  const forceDemo = useSettings((s) => s.forceDemo);
  const close = () => overlayStore.set({ palette: false });
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <CommandDialog open={open} onOpenChange={(o) => overlayStore.set({ palette: o })} className="border border-line-strong bg-popover sm:max-w-lg">
      <CommandInput placeholder="Search commands, specimens, pages…" />
      <CommandList className="max-h-[380px]">
        <CommandEmpty>No matching command.</CommandEmpty>
        <CommandGroup heading="Specimens">
          {DEMO_SPECIMENS.map((d) => (
            <CommandItem
              key={d.id}
              value={`load ${d.id} ${d.caseId} ${d.label}`}
              onSelect={run(() => {
                router.push("/analysis");
                void loadDemo(d.id);
              })}
            >
              <FlaskConical />
              <span className="t-mono text-[12px]">{d.id}</span>
              <span className="truncate text-dim">{d.label}</span>
              <CommandShortcut className="t-mono">{d.caseId}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Analysis">
          <CommandItem disabled={phase !== "loaded" && phase !== "complete" && phase !== "error"} onSelect={run(() => void runAnalysis())}>
            <Play />
            Run analysis
            <CommandShortcut>⌘↵</CommandShortcut>
          </CommandItem>
          <CommandItem disabled={phase !== "complete"} onSelect={run(openExport)}>
            <FileDown />
            Export analysis report
          </CommandItem>
          <CommandItem disabled={phase !== "complete"} onSelect={run(() => setView({ overlay: "combined" }))}>
            <ScanEye />
            Show Grad-CAM overlay
          </CommandItem>
          <CommandItem onSelect={run(clearSession)}>
            <Trash2 />
            Clear session
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((n) => (
            <CommandItem key={n.href} value={`go ${n.label}`} onSelect={run(() => router.push(n.href))}>
              <n.icon />
              {n.label}
              <CommandShortcut className="t-mono">{n.shortcut}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="System">
          <CommandItem onSelect={run(() => void checkBackend().then(() => toast(`Backend: ${getBackendLabel()}`)))}>
            <RefreshCw />
            Re-check backend connection
          </CommandItem>
          <CommandItem
            onSelect={run(() => {
              updateSettings({ forceDemo: !forceDemo });
              void checkBackend();
            })}
          >
            <StatusDot tone={mode === "demo" ? "warn" : "ok"} className="mx-[5px]" />
            {forceDemo ? "Disable forced demo mode" : "Force demo mode"}
          </CommandItem>
          <CommandItem onSelect={run(openSettings)}>
            <Settings2 />
            Settings
          </CommandItem>
          <CommandItem onSelect={run(openShortcuts)}>
            <Keyboard />
            Keyboard shortcuts
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

const getBackendLabel = () => (backendStore.get().mode === "connected" ? "connected" : "demo mode");

function SettingsDialog() {
  const open = useStore(overlayStore, (s) => s.settings);
  const s = useSettings((x) => x);
  const mode = useBackend((b) => b.mode);
  const reason = useBackend((b) => b.reason);
  const health = useBackend((b) => b.health);
  const [url, setUrl] = useState(s.apiUrl);
  const [testing, setTesting] = useState<"idle" | "busy" | "ok" | "fail">("idle");
  useEffect(() => {
    if (open) {
      setUrl(s.apiUrl);
      setTesting("idle");
    }
  }, [open, s.apiUrl]);

  const test = async () => {
    setTesting("busy");
    const h = await probeBackend(url.trim(), 3000);
    setTesting(h ? "ok" : "fail");
    if (h) {
      updateSettings({ apiUrl: url.trim(), forceDemo: false });
      await checkBackend();
      toast.success(`Connected · ${h.device}${h.modelLoaded ? " · model loaded" : " · model NOT loaded"}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => overlayStore.set({ settings: o })}>
      <DialogContent className="gap-0 rounded-[4px] border border-line-strong bg-panel p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle className="t-label !text-[11px] !text-foreground">Workstation settings</DialogTitle>
          <DialogDescription className="text-[11.5px]">Stored locally in this browser. No specimen data leaves the machine except to the configured backend.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 px-4 py-4">
          <section className="flex flex-col gap-2">
            <TLabel>Inference backend</TLabel>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-label="API base URL"
                spellCheck={false}
                className="t-mono h-8 min-w-0 flex-1 rounded-[3px] border border-line-strong bg-viewport px-2 text-[12px] text-foreground outline-none focus:border-teal"
              />
              <ActionButton variant="secondary" onClick={test} disabled={testing === "busy"}>
                {testing === "busy" ? "Probing…" : "Test & apply"}
              </ActionButton>
            </div>
            <div className="t-mono flex items-center gap-2 text-[11px] text-dim">
              <StatusDot tone={mode === "connected" ? "ok" : mode === "checking" ? "busy" : "warn"} />
              {mode === "connected" ? `Connected · ${health?.latencyMs?.toFixed(0)} ms · ${health?.modelLoaded ? "model loaded" : "model not loaded"}` : reason ?? "Checking…"}
              {testing === "fail" && <span className="text-malignant">· no response at {url}</span>}
            </div>
            <label className="mt-1 flex items-center justify-between gap-4 border border-line bg-panel-2/50 px-3 py-2">
              <span>
                <span className="block text-[12.5px] text-foreground">Force demo mode</span>
                <span className="block text-[11px] text-dim">Use the in-browser simulation even if a backend is reachable.</span>
              </span>
              <Switch
                checked={s.forceDemo}
                onCheckedChange={(v) => {
                  updateSettings({ forceDemo: v });
                  void checkBackend();
                }}
              />
            </label>
          </section>
          <section className="flex flex-col gap-2">
            <TLabel>Display & accessibility</TLabel>
            <label className="flex items-center justify-between gap-4 border border-line bg-panel-2/50 px-3 py-2">
              <span>
                <span className="block text-[12.5px] text-foreground">High contrast</span>
                <span className="block text-[11px] text-dim">Stronger borders and text; pure black surfaces.</span>
              </span>
              <Switch checked={s.highContrast} onCheckedChange={(v) => updateSettings({ highContrast: v })} />
            </label>
            <label className="flex items-center justify-between gap-4 border border-line bg-panel-2/50 px-3 py-2">
              <span>
                <span className="block text-[12.5px] text-foreground">Reduce motion</span>
                <span className="block text-[11px] text-dim">Disable transitions and pipeline pacing. Follows OS setting by default.</span>
              </span>
              <Switch checked={s.reducedMotion} onCheckedChange={(v) => updateSettings({ reducedMotion: v })} />
            </label>
            <div className="flex items-center justify-between gap-4 border border-line bg-panel-2/50 px-3 py-2">
              <span>
                <span className="block text-[12.5px] text-foreground">Default saliency colormap</span>
                <span className="block text-[11px] text-dim">{COLORMAPS.find((c) => c.id === s.defaultColormap)?.note}</span>
              </span>
              <Segmented<ColormapName>
                label="Default colormap"
                value={s.defaultColormap}
                onChange={(v) => {
                  updateSettings({ defaultColormap: v });
                  setView({ colormap: v });
                }}
                options={COLORMAPS.map((c) => ({ value: c.id, label: c.label }))}
                size="xs"
              />
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <TLabel>Researcher</TLabel>
            <input
              value={s.researcher}
              onChange={(e) => updateSettings({ researcher: e.target.value })}
              aria-label="Researcher display name"
              className="h-8 rounded-[3px] border border-line-strong bg-viewport px-2 text-[12.5px] text-foreground outline-none focus:border-teal"
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  { group: "Global", items: [["⌘ K", "Command palette"], ["⌘ ↵", "Run analysis"], ["?", "This sheet"], ["[", "Toggle sidebar"], ["G then O/A/S/X", "Overview · Analysis · Spectral · XAI"], ["G then M/D/C/N/Y", "Models · Dataset · Cases · Notes · System"]] },
  { group: "Viewer", items: [["+ / −", "Zoom in / out"], ["0", "Fit to screen"], ["R", "Reset view & adjustments"], ["F", "Fullscreen"], ["← ↑ → ↓", "Pan"], ["1 2 3 4", "Original · Grad-CAM · Combined · Edges"], ["T", "Tile probabilities"], ["S", "Swipe compare"], ["C", "Crosshair"], ["L", "Coordinate grid"], ["B", "Tissue boundary"]] },
];

function ShortcutsDialog() {
  const open = useStore(overlayStore, (s) => s.shortcuts);
  return (
    <Dialog open={open} onOpenChange={(o) => overlayStore.set({ shortcuts: o })}>
      <DialogContent className="gap-0 rounded-[4px] border border-line-strong bg-panel p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle className="t-label !text-[11px] !text-foreground">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-[11.5px]">Viewer keys apply when the Analysis or Explainability viewer is on screen.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 px-4 py-4 sm:grid-cols-2">
          {SHORTCUTS.map((g) => (
            <div key={g.group}>
              <TLabel>{g.group}</TLabel>
              <dl className="mt-2 flex flex-col">
                {g.items.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5 text-[12px] last:border-0">
                    <dt className="text-muted-foreground">{v}</dt>
                    <dd className="flex gap-1">
                      {k.split(" ").map((p, i) => (p === "then" ? <span key={i} className="text-[10px] text-faint">then</span> : <Kbd key={i}>{p}</Kbd>))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExportHost() {
  const open = useStore(overlayStore, (s) => s.export);
  return <ExportDialog open={open} onOpenChange={(o) => overlayStore.set({ export: o })} />;
}

export function GlobalOverlays() {
  useGlobalKeys();
  return (
    <>
      <Palette />
      <SettingsDialog />
      <ShortcutsDialog />
      <ExportHost />
    </>
  );
}
