"use client";

import { useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { motion } from "motion/react";
import { FileImage, FlaskConical, TriangleAlert, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadDemo, loadFile, useSession } from "@/lib/state/session";
import { DEMO_SPECIMENS } from "@/lib/mock-data";
import { MAX_BYTES } from "@/lib/imaging/load";
import { ActionButton, TLabel } from "@/components/ui/workstation";

export function UploadZone({ compact = false, className }: { compact?: boolean; className?: string }) {
  const phase = useSession((s) => s.phase);
  const error = useSession((s) => s.error);
  const [reject, setReject] = useState<string | null>(null);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"] },
    maxFiles: 1,
    maxSize: MAX_BYTES,
    noClick: true,
    onDrop: (files: File[], rejections: FileRejection[]) => {
      if (rejections.length) {
        const r = rejections[0];
        setReject(`${r.file.name}: ${r.errors.map((e) => (e.code === "file-invalid-type" ? "unsupported format — PNG, JPG or JPEG only" : e.code === "file-too-large" ? `exceeds ${MAX_BYTES / 1048576} MB` : e.message)).join("; ")}`);
        return;
      }
      setReject(null);
      if (files[0]) void loadFile(files[0]);
    },
  });
  const invalid = reject ?? (phase === "error" && error?.code === "INVALID_IMAGE" ? error.message : null);
  const loading = phase === "loading";

  return (
    <div className={cn("flex w-full max-w-[460px] flex-col gap-4 p-5", compact && "max-w-none p-3", className)}>
      {!compact && (
        <div className="flex items-baseline justify-between">
          <h3 className="t-label !text-[11px] !text-foreground">Load tissue specimen</h3>
          <span className="t-mono text-[10px] text-faint">PNG · JPG · JPEG · ≤50 MB</span>
        </div>
      )}
      <div
        {...getRootProps()}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 border border-dashed border-line-strong bg-panel/60 px-6 py-8 text-center transition-colors",
          isDragActive && "border-teal bg-teal/5",
          invalid && "border-malignant/60",
          compact && "py-5",
        )}
      >
        <input {...getInputProps()} aria-label="Specimen image file" />
        {isDragActive && <motion.div layoutId="drop-glow" className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_var(--teal)]" />}
        <div className={cn("flex size-10 items-center justify-center border border-line-strong bg-viewport text-dim", isDragActive && "border-teal text-teal")}>
          {loading ? <span className="size-4 animate-spin rounded-full border border-teal border-t-transparent" /> : <Upload className="size-4" />}
        </div>
        <div>
          <p className="text-[13px] text-foreground">{loading ? "Decoding specimen…" : isDragActive ? "Release to load specimen" : "Drag microscopy image here"}</p>
          <p className="mt-0.5 text-[11.5px] text-dim">or</p>
        </div>
        <ActionButton variant="secondary" onClick={open} disabled={loading}>
          <FileImage /> Browse files
        </ActionButton>
        {invalid && (
          <p role="alert" className="t-mono flex items-start gap-1.5 text-left text-[11px] text-malignant">
            <TriangleAlert className="mt-px size-3.5 shrink-0" /> INVALID IMAGE — {invalid}
          </p>
        )}
      </div>
      <div>
        <TLabel>Use sample specimen</TLabel>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {DEMO_SPECIMENS.map((d) => (
            <button
              key={d.id}
              type="button"
              disabled={loading}
              onClick={() => void loadDemo(d.id)}
              className="group flex flex-col items-start gap-0.5 border border-line bg-panel-2/60 px-2 py-1.5 text-left transition-colors hover:border-teal/50 hover:bg-elevated disabled:opacity-40"
            >
              <span className="t-mono flex items-center gap-1 text-[10.5px] text-foreground">
                <FlaskConical className="size-3 text-dim group-hover:text-teal" />
                {d.id.replace("SPECIMEN-", "S-")}
              </span>
              <span className="truncate text-[10px] text-dim">{d.kind === "idc" ? "IDC pattern" : d.kind === "benign" ? "Benign" : "Mixed"}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10.5px] leading-snug text-faint">Samples are procedurally generated synthetic H&amp;E images — no patient data.</p>
      </div>
    </div>
  );
}
