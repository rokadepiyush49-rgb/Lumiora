"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn, fmtInt } from "@/lib/utils";
import { MODEL_INFO } from "@/lib/mock-data";
import { Panel, PanelHeader, Tag, TLabel } from "@/components/ui/workstation";

interface Section {
  n: string;
  title: string;
  summary: string;
  points: string[];
  code?: string;
  impl: string;
  nodes: string[];
}

const SECTIONS: Section[] = [
  {
    n: "01",
    title: "Data Acquisition",
    summary: "Public H&E breast histopathology corpora provide labelled tiles for training and evaluation.",
    points: [
      "IDC (Janowczyk & Madabhushi, 2016): 277,524 patches of 50 × 50 px from 162 whole-mount slides; 78,786 IDC-positive.",
      "BreakHis (Spanhol et al., 2016): 7,909 images, 82 patients, four magnifications (40×–400×).",
      "Splits must be made at patient / slide level — tile-level splits leak morphology between train and test.",
    ],
    impl: "Dataset Explorer · lib/mock-data.ts (metadata only; images not bundled)",
    nodes: ["image"],
  },
  {
    n: "02",
    title: "Preprocessing",
    summary: "Images are validated, resampled, and tiled to the model's 96 × 96 input.",
    points: [
      "Decode + validate (PNG/JPEG signature, bit depth, colour type, ICC tag).",
      "Tiling at 96 px, stride 96; background tiles (low saturation, high value) are skipped.",
      "Scaling to the network's expected range — MobileNetV2 preprocess_input maps [0,255] → [−1,1]. The exact scaling used in training is to be confirmed.",
    ],
    code: "x = tf.keras.applications.mobilenet_v2.preprocess_input(tile.astype('float32'))",
    impl: "lib/imaging/load.ts · backend/app/pipeline.py",
    nodes: ["pre"],
  },
  {
    n: "03",
    title: "Multi-Band Optical Feature Extraction",
    summary: "A pseudo-spectral decomposition replaces hyperspectral hardware: RGB is re-expressed in HSV and CIE L*a*b* to give nine optical channels.",
    points: [
      "RGB: raw reflectance-like channels; G carries the strongest eosin absorption contrast.",
      "HSV: hue separates hematoxylin (purple) from eosin (pink); saturation tracks stain concentration.",
      "L*a*b*: perceptually uniform; L* approximates optical density, b* is depressed where hematoxylin dominates.",
      "Per-band statistics: mean, σ, median, entropy, 256-bin histogram; inter-band Pearson correlation.",
    ],
    code: "hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)   # H∈[0,179]\nlab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)   # L*·255/100, a*+128, b*+128",
    impl: "lib/imaging/bands.ts (browser, OpenCV-compatible) · backend/app/pipeline.py",
    nodes: ["bands", "nine"],
  },
  {
    n: "04",
    title: "Spatial Feature Extraction",
    summary: "Morphology — nuclear shape, crowding, gland architecture — is captured by the CNN's convolutional hierarchy; explicit gradient maps support inspection.",
    points: [
      "Sobel gradient magnitude on L* highlights nuclear membranes and gland boundaries.",
      "Tissue mask + marching-squares contour delineates stained tissue from glass.",
      "Within the network, depthwise-separable convolutions learn texture and shape features at 48 → 3 px strides.",
    ],
    impl: "lib/imaging/spatial.ts",
    nodes: ["cnn"],
  },
  {
    n: "05",
    title: "Transfer Learning",
    summary: "MobileNetV2 pretrained on ImageNet is used as a frozen feature extractor with a small trainable head.",
    points: [
      `Backbone: ${fmtInt(MODEL_INFO.parameters.frozen)} frozen parameters (inverted residual blocks, linear bottlenecks).`,
      `Head: GlobalAveragePooling2D → Dense(128, ReLU) → Dropout(0.4) → Dense(1, sigmoid) — ${fmtInt(MODEL_INFO.parameters.trainable)} trainable parameters.`,
      "Optimiser Adam (lr 1e-3), binary cross-entropy — read from the saved training config.",
      "Fine-tuning upper blocks is a natural next step once patient-level validation is in place.",
    ],
    code: "base = MobileNetV2(input_shape=(96,96,3), include_top=False, weights='imagenet')\nbase.trainable = False",
    impl: "spectral_cancer_model.h5 · Model Performance → Model card",
    nodes: ["mnv2"],
  },
  {
    n: "06",
    title: "Classification",
    summary: "Each tile yields P(cancerous) = σ(z); tile outputs are aggregated to an image-level call.",
    points: [
      "Decision threshold τ = 0.5; outputs within ±0.10 of τ are reported as indeterminate and flagged for review.",
      "Image-level probability: mean of the top-15% tile probabilities (robust to small positive foci).",
      "Confidence is the probability of the predicted class — not a calibrated likelihood of disease.",
    ],
    code: "p_tile = model.predict(tiles)[:, 0]\np_image = np.mean(np.sort(p_tile)[-k:])",
    impl: "backend/app/inference.py · lib/mock-api.ts (demo surrogate)",
    nodes: ["cls"],
  },
  {
    n: "07",
    title: "Grad-CAM Explainability",
    summary: "Gradient-weighted class activation mapping localises the evidence behind each output.",
    points: [
      "Gradients of the logit z (or −z for benign) w.r.t. a convolutional activation are spatially averaged into channel weights α_k.",
      "L = ReLU(Σ α_k A^k), upsampled to tile size and stitched across tiles.",
      "At 96 px input, out_relu is 3 × 3: localisation is coarse. block_13 (6 × 6) and block_6 (12 × 12) are finer but less class-specific.",
      "Saliency shows what influenced the model — not ground-truth tumour boundaries.",
    ],
    code: "with tf.GradientTape() as tape:\n    A, z = grad_model(x)\ng = tape.gradient(z, A)\nalpha = tf.reduce_mean(g, axis=(1, 2))\ncam = tf.nn.relu(tf.reduce_sum(alpha[:, None, None] * A, -1))",
    impl: "backend/app/gradcam.py · Explainability page",
    nodes: ["cam", "xai"],
  },
  {
    n: "08",
    title: "Evaluation",
    summary: "Accuracy, precision, recall, F1 and loss — complemented by ROC/PR analysis and calibration.",
    points: [
      "Report metrics at patient level as well as tile level; tile-level figures overstate performance.",
      "ROC AUC and PR AUC across thresholds; PR is more informative under class imbalance (IDC ≈ 28% positive).",
      "Reliability diagram + expected calibration error (ECE) quantify over-confidence.",
      "Headline metrics in this build are placeholders until measured results are served by GET /api/metrics.",
    ],
    impl: "Model Performance page",
    nodes: ["cls"],
  },
];

const NODES: { id: string; label: string; sub: string; x: number; y: number; w: number; tone?: "model" | "xai" | "note" }[] = [
  { id: "image", label: "Histopathology image", sub: "H&E · RGB", x: 10, y: 20, w: 150 },
  { id: "pre", label: "Preprocessing", sub: "validate · tile 96 px", x: 10, y: 100, w: 150 },
  { id: "bands", label: "RGB / HSV / LAB", sub: "colour-space transforms", x: 210, y: 100, w: 150 },
  { id: "nine", label: "9 optical channels", sub: "stats · histograms", x: 410, y: 100, w: 150 },
  { id: "tensor", label: "96 × 96 × 3 tensor", sub: "channel selection · TBC", x: 210, y: 190, w: 150, tone: "note" },
  { id: "cnn", label: "CNN feature extraction", sub: "depthwise-separable conv", x: 210, y: 270, w: 150, tone: "model" },
  { id: "mnv2", label: "MobileNetV2", sub: "ImageNet · frozen · 1280-d", x: 410, y: 270, w: 150, tone: "model" },
  { id: "cls", label: "Cancerous / Benign", sub: "σ(z) · τ = 0.5", x: 610, y: 270, w: 150, tone: "model" },
  { id: "cam", label: "Grad-CAM", sub: "∂z/∂A · out_relu", x: 610, y: 350, w: 150, tone: "xai" },
  { id: "xai", label: "Visual explanation", sub: "saliency overlay", x: 410, y: 350, w: 150, tone: "xai" },
];
const EDGES: [string, string, string?][] = [
  ["image", "pre"],
  ["pre", "bands"],
  ["bands", "nine"],
  ["pre", "tensor"],
  ["nine", "tensor", "?"],
  ["tensor", "cnn"],
  ["cnn", "mnv2"],
  ["mnv2", "cls"],
  ["cls", "cam"],
  ["cam", "xai"],
];

function Diagram({ active, onPick }: { active: string[]; onPick: (id: string) => void }) {
  const H = 40;
  const node = (id: string) => NODES.find((n) => n.id === id)!;
  const anchor = (a: ReturnType<typeof node>, b: ReturnType<typeof node>) => {
    const ac = { x: a.x + a.w / 2, y: a.y + H / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + H / 2 };
    if (Math.abs(ac.y - bc.y) < 5) return { x1: ac.x < bc.x ? a.x + a.w : a.x, y1: ac.y, x2: ac.x < bc.x ? b.x : b.x + b.w, y2: bc.y };
    if (Math.abs(ac.x - bc.x) < 5) return { x1: ac.x, y1: ac.y < bc.y ? a.y + H : a.y, x2: bc.x, y2: ac.y < bc.y ? b.y : b.y + H };
    return { x1: ac.x, y1: a.y + H, x2: bc.x, y2: b.y };
  };
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 770 410" className="mx-auto block w-full min-w-[640px] max-w-[980px]" role="img" aria-label="System architecture diagram">
        <defs>
          <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="var(--line-strong)" />
          </marker>
        </defs>
        <rect x="195" y="245" width="580" height="90" fill="none" stroke="var(--line)" strokeDasharray="3 4" />
        <text x="203" y="258" className="t-mono" fontSize="9" fill="var(--faint)" letterSpacing="1.5">
          INFERENCE BACKEND
        </text>
        {EDGES.map(([a, b, lbl]) => {
          const p = anchor(node(a), node(b));
          const mid = { x: (p.x1 + p.x2) / 2, y: (p.y1 + p.y2) / 2 };
          const d = Math.abs(p.x1 - p.x2) > 5 && Math.abs(p.y1 - p.y2) > 5 ? `M${p.x1} ${p.y1} V${mid.y} H${p.x2} V${p.y2}` : `M${p.x1} ${p.y1} L${p.x2} ${p.y2}`;
          return (
            <g key={`${a}-${b}`}>
              <path d={d} fill="none" stroke={lbl ? "var(--warn)" : "var(--line-strong)"} strokeWidth={1} strokeDasharray={lbl ? "3 3" : undefined} markerEnd="url(#arr)" />
              {lbl && (
                <text x={mid.x + 6} y={mid.y + 14} fontSize="10" fill="var(--warn)" className="t-mono">
                  channel choice to confirm
                </text>
              )}
            </g>
          );
        })}
        {NODES.map((n) => {
          const on = active.includes(n.id);
          const stroke = n.tone === "model" ? "var(--teal)" : n.tone === "xai" ? "#cb8230" : n.tone === "note" ? "var(--warn)" : "var(--line-strong)";
          return (
            <g key={n.id} onClick={() => onPick(n.id)} className="cursor-pointer" role="button" aria-label={n.label}>
              <rect x={n.x} y={n.y} width={n.w} height={H} rx={2} fill={on ? "var(--elevated)" : "var(--panel)"} stroke={on ? "var(--foreground)" : stroke} strokeOpacity={on ? 0.9 : 0.7} strokeWidth={on ? 1.5 : 1} />
              <text x={n.x + 10} y={n.y + 17} fontSize="11.5" fill="var(--foreground)">
                {n.label}
              </text>
              <text x={n.x + 10} y={n.y + 31} fontSize="9.5" fill="var(--dim)" className="t-mono">
                {n.sub}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Methodology() {
  const [open, setOpen] = useState<string>("03");
  const active = SECTIONS.find((s) => s.n === open)?.nodes ?? [];
  const pick = (id: string) => {
    const s = SECTIONS.find((x) => x.nodes.includes(id));
    if (s) setOpen(s.n);
  };
  return (
    <div className="flex flex-col gap-3 p-3">
      <Panel>
        <div className="px-4 py-5 md:px-6">
          <p className="t-mono text-[10.5px] tracking-[0.2em] text-teal">RESEARCH NOTES · METHODOLOGY</p>
          <h1 className="mt-2 max-w-4xl text-[22px] leading-snug font-medium text-foreground md:text-[26px]">AI-Driven Cancer Tissue Detection Utilizing Multi-Band Optical Imaging and Explainable Artificial Intelligence</h1>
          <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
            A decision-support prototype that classifies histopathology tiles as benign or cancerous using pseudo-spectral colour decomposition and a transfer-learned MobileNetV2, and exposes the evidence behind each output
            with Grad-CAM. The approach avoids hyperspectral hardware by deriving optical bands from standard RGB microscopy.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Tag>Python · TensorFlow/Keras</Tag>
            <Tag>OpenCV</Tag>
            <Tag>Matplotlib</Tag>
            <Tag>Colab GPU (training)</Tag>
            <Tag tone="teal">Next.js · FastAPI (this workstation)</Tag>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader index="A" title="System architecture" meta="click a node to open its section" />
        <div className="px-2 py-4">
          <Diagram active={active} onPick={pick} />
        </div>
        <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-dim">
          <span className="t-mono text-warn">NOTE · </span>The saved model accepts a 96 × 96 × 3 tensor. The nine optical channels are therefore either reduced to a three-channel composite before inference or used for analysis alongside an RGB
          input; which of these the training notebook used should be confirmed and recorded in <span className="t-mono">backend/app/config.py</span>.
        </p>
      </Panel>

      <div className="flex flex-col gap-px border border-line bg-line">
        {SECTIONS.map((s) => {
          const on = open === s.n;
          return (
            <section key={s.n} className="bg-panel">
              <button type="button" onClick={() => setOpen(on ? "" : s.n)} aria-expanded={on} className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-panel-2">
                <span className={cn("t-mono text-[13px]", on ? "text-teal" : "text-faint")}>{s.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-foreground">{s.title}</span>
                  <span className="block truncate text-[12px] text-dim">{s.summary}</span>
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-dim transition-transform", on && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {on && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="grid gap-4 border-t border-line px-4 py-4 pl-[52px] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                      <div>
                        <p className="text-[13px] leading-relaxed text-muted-foreground">{s.summary}</p>
                        <ul className="mt-3 flex flex-col gap-1.5">
                          {s.points.map((p) => (
                            <li key={p} className="flex gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
                              <span className="mt-2 size-1 shrink-0 bg-teal" aria-hidden />
                              {p}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3">
                          <TLabel>In this build</TLabel>
                          <p className="t-mono mt-0.5 text-[11px] text-dim">{s.impl}</p>
                        </div>
                      </div>
                      {s.code && (
                        <pre className="t-mono self-start overflow-x-auto border border-line bg-viewport px-3 py-2.5 text-[11px] leading-relaxed text-foreground/90">
                          <code>{s.code}</code>
                        </pre>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </div>

      <Panel>
        <PanelHeader index="R" title="References" />
        <ol className="flex flex-col gap-1.5 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
          <li>Janowczyk A., Madabhushi A. Deep learning for digital pathology image analysis: a comprehensive tutorial with selected use cases. J Pathol Inform, 2016.</li>
          <li>Spanhol F. A. et al. A dataset for breast cancer histopathological image classification (BreakHis). IEEE TBME, 2016.</li>
          <li>Sandler M. et al. MobileNetV2: Inverted residuals and linear bottlenecks. CVPR, 2018.</li>
          <li>Selvaraju R. R. et al. Grad-CAM: Visual explanations from deep networks via gradient-based localization. ICCV, 2017.</li>
          <li>Guo C. et al. On calibration of modern neural networks. ICML, 2017.</li>
          <li>Mitchell M. et al. Model cards for model reporting. FAT*, 2019.</li>
        </ol>
      </Panel>
    </div>
  );
}
