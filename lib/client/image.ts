import { LIMITS } from "@/lib/schemas";

export interface ProcessedImage {
  photo: string;
  thumb: string;
  color: string;
}

export class ImageError extends Error {}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new ImageError("That file couldn't be read as a photo. Try a JPEG or PNG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(source: ImageBitmap | HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("Your browser can't process photos.");
  ctx.fillStyle = "#fff"; // PNG transparency → white instead of black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Shrink until the encoded data URL fits in `maxChars`. */
function encode(source: ImageBitmap | HTMLImageElement, startSide: number, startQ: number, maxChars: number): string {
  let side = startSide;
  let q = startQ;
  for (let i = 0; i < 8; i++) {
    const url = draw(source, side).toDataURL("image/jpeg", q);
    if (url.length <= maxChars) return url;
    if (q > 0.6) q -= 0.08;
    else side = Math.round(side * 0.82);
  }
  throw new ImageError("That photo is too detailed to upload. Try a smaller one.");
}

function dominantColor(source: ImageBitmap | HTMLImageElement): string {
  const c = draw(source, 16);
  const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  let r = 0, g = 0, b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Full-size and thumbnail JPEGs plus an average colour, all produced on-device. */
export async function processImage(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new ImageError("Choose an image file.");
  }
  if (file.size > 40 * 1024 * 1024) throw new ImageError("That file is over 40 MB. Choose a smaller photo.");
  const source = await decode(file);
  try {
    return {
      photo: encode(source, 1400, 0.82, LIMITS.photoChars),
      thumb: encode(source, 520, 0.74, LIMITS.thumbChars),
      color: dominantColor(source),
    };
  } finally {
    if ("close" in source) source.close();
  }
}
