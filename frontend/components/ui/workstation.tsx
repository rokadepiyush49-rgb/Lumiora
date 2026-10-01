"use client";

/**
 * Workstation primitives: dense panels, technical labels, key–value rows,
 * status indicators and tool buttons. Shared by every screen.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Panel({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("relative flex min-w-0 flex-col border border-line bg-panel", className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  index,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  index?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex h-9 shrink-0 items-center gap-2 border-b border-line px-3", className)}>
      {index && <span className="t-mono text-[10px] text-faint">{index}</span>}
      <h2 className="t-label truncate !text-muted-foreground">{title}</h2>
      {meta && <div className="t-mono ml-1 truncate text-[10px] text-dim">{meta}</div>}
      {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
    </header>
  );
}

export function TLabel({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("t-label", className)} {...props} />;
}

export function KV({
  k,
  v,
  mono = true,
  className,
  vClassName,
}: {
  k: React.ReactNode;
  v: React.ReactNode;
  mono?: boolean;
  className?: string;
  vClassName?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-[3px]", className)}>
      <dt className="t-label shrink-0">{k}</dt>
      <dd className={cn("min-w-0 truncate text-right text-[12px] text-foreground", mono && "t-mono", vClassName)}>{v}</dd>
    </div>
  );
}

type DotTone = "ok" | "warn" | "error" | "idle" | "teal" | "busy";
const DOT: Record<DotTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  error: "bg-malignant",
  idle: "bg-faint",
  teal: "bg-teal",
  busy: "bg-teal animate-pulse-dot",
};

export function StatusDot({ tone, className }: { tone: DotTone; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", DOT[tone], className)} />;
}

export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "teal" | "warn" | "malignant" | "benign";
  className?: string;
}) {
  const tones = {
    neutral: "border-line-strong text-muted-foreground",
    teal: "border-teal/40 text-teal bg-teal/5",
    warn: "border-warn/40 text-warn bg-warn/5",
    malignant: "border-malignant/45 text-malignant bg-malignant/8",
    benign: "border-benign/40 text-benign bg-benign/6",
  };
  return (
    <span className={cn("t-mono inline-flex h-[18px] shrink-0 items-center gap-1 whitespace-nowrap rounded-[2px] border px-1.5 text-[10px] font-medium uppercase tracking-[0.08em]", tones[tone], className)}>
      {children}
    </span>
  );
}

export const ToolButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { label: string; shortcut?: string; active?: boolean; side?: "top" | "bottom" | "left" | "right" }
>(function ToolButton({ label, shortcut, active, side = "bottom", className, children, ...props }, ref) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            ref={ref}
            type="button"
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-[3px] border border-transparent text-muted-foreground transition-colors hover:border-line hover:bg-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[15px]",
              active && "border-teal/40 bg-teal/10 text-teal hover:border-teal/50 hover:bg-teal/15 hover:text-teal",
              className,
            )}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className="rounded-[3px] border border-line-strong bg-elevated px-2 py-1 text-[11px] text-foreground [&>svg]:hidden">
        {label}
        {shortcut && <Kbd className="ml-1.5">{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
});

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn("t-mono inline-flex h-4 min-w-4 items-center justify-center rounded-[2px] border border-line-strong bg-panel-2 px-1 text-[10px] text-muted-foreground", className)}
      {...props}
    />
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string; disabled?: boolean }[];
  size?: "xs" | "sm";
  className?: string;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-[3px] border border-line bg-viewport/60 p-0.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "t-mono rounded-[2px] px-2 uppercase tracking-[0.06em] text-dim transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
              size === "xs" ? "h-5 text-[9.5px]" : "h-6 text-[10.5px]",
              on && "bg-elevated text-foreground shadow-[inset_0_0_0_1px_var(--line-strong)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ActionButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  const v = {
    primary: "bg-teal text-[oklch(0.16_0.02_220)] hover:bg-teal/90 border-teal",
    secondary: "border-line-strong bg-panel-2 text-foreground hover:bg-elevated hover:border-faint",
    ghost: "border-transparent text-muted-foreground hover:bg-elevated hover:text-foreground",
    danger: "border-malignant/40 text-malignant hover:bg-malignant/10",
  }[variant];
  const s = { sm: "h-7 px-2.5 text-[11px]", md: "h-8 px-3 text-[12px]", lg: "h-10 px-4 text-[12.5px]" }[size];
  return (
    <button
      type="button"
      className={cn(
        "t-mono inline-flex items-center justify-center gap-2 rounded-[3px] border font-medium uppercase tracking-[0.08em] transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5",
        v,
        s,
        className,
      )}
      {...props}
    />
  );
}

export function Meter({ value, className, tone = "teal", marks }: { value: number; className?: string; tone?: "teal" | "warn" | "malignant" | "benign"; marks?: number[] }) {
  const color = { teal: "bg-teal", warn: "bg-warn", malignant: "bg-malignant", benign: "bg-benign" }[tone];
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden bg-elevated", className)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className={cn("absolute inset-y-0 left-0 transition-[width] duration-700 ease-out", color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      {marks?.map((m) => (
        <span key={m} className="absolute inset-y-0 w-px bg-background/80" style={{ left: `${m * 100}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, action, className }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      {icon && <div className="mb-1 text-faint [&_svg]:size-6">{icon}</div>}
      <p className="t-label !text-muted-foreground">{title}</p>
      {children && <p className="max-w-sm text-[12px] leading-relaxed text-dim">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function DemoBadge({ className, label = "Demo data" }: { className?: string; label?: string }) {
  return (
    <span className={cn("t-mono hatch inline-flex h-[18px] items-center gap-1.5 rounded-[2px] border border-warn/45 px-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-warn", className)}>
      <span className="size-1 rounded-full bg-warn" aria-hidden />
      {label}
    </span>
  );
}
