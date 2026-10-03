import { cn } from "@/lib/utils";

/** Reticle-over-cell mark: an objective's field stop around a nucleus. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <circle cx="16" cy="16" r="13.5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M16 1.5v5M16 25.5v5M1.5 16h5M25.5 16h5" stroke="currentColor" strokeWidth="1.25" />
      <ellipse cx="16.6" cy="15.4" rx="3.6" ry="2.8" transform="rotate(-24 16.6 15.4)" fill="currentColor" />
      <circle cx="15.4" cy="15.9" r="0.9" fill="var(--background)" />
    </svg>
  );
}

export function Wordmark({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="shrink-0 text-teal" />
      {!collapsed && (
        <div className="min-w-0 leading-none">
          <div className="t-mono text-[13px] font-semibold tracking-[0.2em] text-foreground">NEXUS PATH</div>
          <div className="mt-1 truncate text-[10.5px] tracking-[0.02em] text-dim">Computational Histopathology</div>
        </div>
      )}
    </div>
  );
}
