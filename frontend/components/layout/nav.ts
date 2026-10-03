import { Activity, Crosshair, Database, History, Layers, NotebookText, ScanEye, ScanSearch, ServerCog, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  code: string;
  shortcut?: string;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workstation",
    items: [
      { href: "/", label: "Overview", icon: Crosshair, code: "OVR", shortcut: "G O" },
      { href: "/analysis", label: "Analysis", icon: ScanSearch, code: "ANL", shortcut: "G A" },
      { href: "/spectral", label: "Spectral Bands", icon: Layers, code: "SPC", shortcut: "G S" },
      { href: "/explainability", label: "Explainability", icon: ScanEye, code: "XAI", shortcut: "G X" },
    ],
  },
  {
    label: "Research",
    items: [
      { href: "/models", label: "Model Performance", icon: Activity, code: "MDL", shortcut: "G M" },
      { href: "/dataset", label: "Dataset Explorer", icon: Database, code: "DAT", shortcut: "G D" },
      { href: "/cases", label: "Case History", icon: History, code: "CAS", shortcut: "G C" },
      { href: "/methodology", label: "Research Notes", icon: NotebookText, code: "DOC", shortcut: "G N" },
    ],
  },
  {
    label: "Infrastructure",
    items: [{ href: "/system", label: "System", icon: ServerCog, code: "SYS", shortcut: "G Y" }],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
