"use client";

import { createHttpApi, probeBackend, type NexusApi } from "../api";
import { createDemoApi } from "../mock-api";
import type { ConnectionMode, HealthStatus } from "../types";
import { createStore, useStore } from "./store";
import { settingsStore } from "./settings";

interface BackendState {
  mode: ConnectionMode;
  api: NexusApi;
  health: HealthStatus | null;
  lastChecked: number | null;
  reason: string | null;
}

const demoApi = createDemoApi();

export const backendStore = createStore<BackendState>({
  mode: "checking",
  api: demoApi,
  health: null,
  lastChecked: null,
  reason: null,
});

let inflight: Promise<void> | null = null;
/** Consecutive failed probes while connected; a busy backend may miss one. */
let misses = 0;
const MISSES_BEFORE_DEMO = 2;

export function checkBackend(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { apiUrl, forceDemo } = settingsStore.get();
    if (forceDemo) {
      misses = 0;
      backendStore.set({ mode: "demo", api: demoApi, health: null, lastChecked: Date.now(), reason: "Demo mode forced in settings" });
      return;
    }
    const current = backendStore.get();
    const wasConnected = current.mode === "connected" && current.api.baseUrl === apiUrl;
    const health = await probeBackend(apiUrl, wasConnected ? 5000 : 1800);
    if (health) {
      misses = 0;
      const api = wasConnected ? current.api : createHttpApi(apiUrl);
      backendStore.set({ mode: "connected", api, health, lastChecked: Date.now(), reason: health.modelLoaded ? null : "Backend reachable but model not loaded" });
    } else if (wasConnected && ++misses < MISSES_BEFORE_DEMO) {
      backendStore.set({ lastChecked: Date.now(), reason: `Health probe missed (${misses}/${MISSES_BEFORE_DEMO}) — backend may be busy` });
    } else {
      misses = 0;
      backendStore.set({ mode: "demo", api: demoApi, health: null, lastChecked: Date.now(), reason: `No response from ${apiUrl}/api/health` });
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export const useBackend = <U,>(sel: (s: BackendState) => U) => useStore(backendStore, sel);
export const getApi = () => backendStore.get().api;
