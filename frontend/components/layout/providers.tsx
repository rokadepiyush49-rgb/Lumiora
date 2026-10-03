"use client";

import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { hydrateSettings, useSettings } from "@/lib/state/settings";
import { backendStore, checkBackend, useBackend } from "@/lib/state/backend";
import { hydrateSession, log } from "@/lib/state/session";
import { GlobalOverlays } from "./overlays";

function useBackendLifecycle() {
  const apiUrl = useSettings((s) => s.apiUrl);
  const forceDemo = useSettings((s) => s.forceDemo);
  const mode = useBackend((s) => s.mode);

  useEffect(() => {
    void checkBackend().then(() => {
      const b = backendStore.get();
      log(b.mode === "connected" ? "ok" : "warn", "backend", b.mode === "connected" ? `Connected to ${apiUrl} · ${b.health?.device}` : `Demo mode · ${b.reason}`);
    });
  }, [apiUrl, forceDemo]);

  // Poll: keep health fresh when connected; auto-connect when a backend appears.
  useEffect(() => {
    if (forceDemo) return;
    const id = window.setInterval(() => void checkBackend(), mode === "connected" ? 20_000 : 15_000);
    return () => window.clearInterval(id);
  }, [mode, forceDemo]);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    hydrateSettings();
    hydrateSession();
  }, []);
  useBackendLifecycle();

  const highContrast = useSettings((s) => s.highContrast);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  useEffect(() => {
    const html = document.documentElement;
    if (highContrast) html.setAttribute("data-contrast", "high");
    else html.removeAttribute("data-contrast");
    if (reducedMotion) html.setAttribute("data-motion", "reduced");
    else html.removeAttribute("data-motion");
  }, [highContrast, reducedMotion]);

  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"} transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}>
      <TooltipProvider delay={350}>
        {children}
        <GlobalOverlays />
        <Toaster position="bottom-right" toastOptions={{ className: "!rounded-[3px] !text-[12px]" }} />
      </TooltipProvider>
    </MotionConfig>
  );
}
