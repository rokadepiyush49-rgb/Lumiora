/**
 * Specimen loading: validation, header probing, and preparation of the two
 * rasters the workstation uses:
 *   display — full-resolution (capped) canvas for the viewer
 *   work    — ≤768 px analysis raster for band extraction, stats, saliency
 */
import { ApiError } from "../types";

export const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
export const ACCEPTED_EXT = [".png", ".jpg", ".jpeg"];
export const MAX_BYTES = 50 * 1024 * 1024;
const MAX_DISPLAY = 4096;
const MAX_WORK = 768;

export interface FileProbe {
  format: "PNG" | "JPEG";
  bitDepth: number;
  colorType: string;
  colorProfile: string;
}

export interface PreparedImage {
  display: HTMLCanvasElement;
  work: ImageData;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  displayScale: number;
  workScale: number;
  ms: number;
}

const PNG_COLOR: Record<number, string> = { 0: "Grayscale", 2: "RGB", 3: "Indexed", 4: "Gray + Alpha", 6: "RGBA" };

export async function probeFile(file: File): Promise<FileProbe> {
  const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  const ascii = (a: number, n: number) => String.fromCharCode(...head.slice(a, a + n));
  const contains = (needle: string) => {
    const bytes = new TextEncoder().encode(needle);
    outer: for (let i = 0; i < head.length - bytes.length; i++) {
      for (let j = 0; j < bytes.length; j++) if (head[i + j] !== bytes[j]) continue outer;
      return true;
    }
    return false;
  };
  if (head[0] === 0x89 && ascii(1, 3) === "PNG") {
    const bitDepth = head[24];
    const colorType = PNG_COLOR[head[25]] ?? "Unknown";
    const colorProfile = contains("iCCP") ? "ICC embedded" : contains("sRGB") ? "sRGB (tagged)" : "Untagged · assumed sRGB";
    return { format: "PNG", bitDepth, colorType, colorProfile };
  }
  if (head[0] === 0xff && head[1] === 0xd8) {
    const colorProfile = contains("ICC_PROFILE") ? "ICC embedded" : "Untagged · assumed sRGB";
    return { format: "JPEG", bitDepth: 8, colorType: "RGB (YCbCr)", colorProfile };
  }
  throw new ApiError("INVALID_IMAGE", "File signature is not PNG or JPEG.");
}

export function validateFile(file: File) {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXT.includes(ext)) {
    throw new ApiError("INVALID_IMAGE", `Unsupported format “${ext || file.type}”. Accepted: PNG, JPG, JPEG.`);
  }
  if (file.size > MAX_BYTES) {
    throw new ApiError("INVALID_IMAGE", `File exceeds ${MAX_BYTES / 1024 / 1024} MB limit.`);
  }
  if (file.size === 0) throw new ApiError("INVALID_IMAGE", "File is empty.");
}

export async function decodeFile(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    if ("createImageBitmap" in window) return await createImageBitmap(file);
  } catch {
    /* fall through to <img> decode */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new ApiError("INVALID_IMAGE", "Image could not be decoded — the file may be corrupt.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function prepareImage(source: CanvasImageSource, sw: number, sh: number): PreparedImage {
  const t0 = performance.now();
  if (sw < 32 || sh < 32) throw new ApiError("INVALID_IMAGE", `Image is ${sw}×${sh}; minimum is 32×32 px.`);
  const displayScale = Math.min(1, MAX_DISPLAY / Math.max(sw, sh));
  const width = Math.round(sw * displayScale);
  const height = Math.round(sh * displayScale);
  const display = document.createElement("canvas");
  display.width = width;
  display.height = height;
  const dctx = display.getContext("2d")!;
  dctx.imageSmoothingQuality = "high";
  dctx.drawImage(source, 0, 0, width, height);

  const workScale = Math.min(1, MAX_WORK / Math.max(width, height));
  const ww = Math.max(1, Math.round(width * workScale));
  const wh = Math.max(1, Math.round(height * workScale));
  const wc = document.createElement("canvas");
  wc.width = ww;
  wc.height = wh;
  const wctx = wc.getContext("2d", { willReadFrequently: true })!;
  wctx.imageSmoothingQuality = "high";
  wctx.drawImage(display, 0, 0, ww, wh);
  const work = wctx.getImageData(0, 0, ww, wh);
  return { display, work, width, height, sourceWidth: sw, sourceHeight: sh, displayScale, workScale, ms: performance.now() - t0 };
}

export function canvasToBlob(c: HTMLCanvasElement, type = "image/png", q?: number) {
  return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), type, q));
}
