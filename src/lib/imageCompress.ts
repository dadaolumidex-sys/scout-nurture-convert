/**
 * Downscale + compress an image file to a small JPEG data URL.
 *
 * Phone photos are often 3-8MB. Sending raw base64 of that to the AI (and
 * storing it in the database) makes replies take a very long time — which is
 * why an image-only message used to look like "nothing happened".
 * Compressing first keeps uploads and AI replies fast.
 */
export async function compressImageFile(
  file: File,
  maxDimension = 1280,
  quality = 0.72
): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);

  // Non-raster formats (svg, heic fallbacks) just pass through.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return dataUrl;

  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, width, height);

    const out = canvas.toDataURL("image/jpeg", quality);
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}
