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
  maxDimension = 480,
  quality = 0.42
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Unsupported image file");
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    throw new Error("HEIC images are not supported. Use JPG, PNG, or WebP.");
  }
  const dataUrl = await readFileAsDataUrl(file);

  if (file.type === "image/svg+xml") throw new Error("SVG images are not supported. Use JPG, PNG, or WebP.");

  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare image");
    ctx.drawImage(img, 0, 0, width, height);

    // Groq accepts screenshots, but its request limit counts the full base64
    // payload. Phone PNG screenshots can stay surprisingly large even after
    // a basic resize. Re-encode at a smaller size until it is safely below a
    // conservative request budget, while still leaving enough detail to read
    // a Discord/DM conversation.
    const maxDataUrlLength = 550_000;
    let currentWidth = width;
    let currentHeight = height;
    let currentQuality = quality;
    let out = canvas.toDataURL("image/jpeg", currentQuality);
    while (out.length > maxDataUrlLength && currentWidth > 240) {
      currentWidth = Math.max(240, Math.round(currentWidth * 0.8));
      currentHeight = Math.max(1, Math.round(currentHeight * 0.8));
      canvas.width = currentWidth;
      canvas.height = currentHeight;
      ctx.drawImage(img, 0, 0, currentWidth, currentHeight);
      currentQuality = Math.max(0.28, currentQuality - 0.05);
      out = canvas.toDataURL("image/jpeg", currentQuality);
    }
    return out;
  } catch (error) {
    throw error instanceof Error ? error : new Error("Could not prepare image");
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
