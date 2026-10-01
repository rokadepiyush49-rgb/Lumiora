"use client";

import type { ColormapName } from "../imaging/colormap";
import { DEFAULT_API_URL } from "../api";
import { safeStorage } from "../utils";
import { createStore, useStore } from "./store";

export interface Settings {
  apiUrl: string;
  forceDemo: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  defaultColormap: ColormapName;
  sidebarCollapsed: boolean;
  researcher: string;
}

const KEY = "nexus-path:settings:v1";

export const settingsStore = createStore<Settings>({
  apiUrl: DEFAULT_API_URL,
  forceDemo: false,
  highContrast: false,
  reducedMotion: false,
  defaultColormap: "inferno",
  sidebarCollapsed: false,
  researcher: "Research User",
});

let hydrated = false;
export function hydrateSettings() {
  if (hydrated) return;
  hydrated = true;
  const ls = safeStorage();
  if (ls) {
    try {
      const raw = ls.getItem(KEY);
      if (raw) settingsStore.set(JSON.parse(raw));
    } catch {
      /* ignore malformed */
    }
  }
  settingsStore.subscribe(() => {
    try {
      safeStorage()?.setItem(KEY, JSON.stringify(settingsStore.get()));
    } catch {
      /* storage unavailable */
    }
  });
}

export const useSettings = <U,>(sel: (s: Settings) => U) => useStore(settingsStore, sel);
export const updateSettings = (p: Partial<Settings>) => settingsStore.set(p);
