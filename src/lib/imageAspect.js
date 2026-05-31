import sharp from "sharp";

/** OpenAI images.edit sizes for gpt-image-1 (landscape / portrait / square). */
const API_LANDSCAPE = "1536x1024";
const API_PORTRAIT = "1024x1536";
const API_SQUARE = "1024x1024";

const SQUARE_RATIO_TOLERANCE = 0.08;

/**
 * Pick the API `size` that matches the source aspect ratio.
 * `auto` often picks the wrong orientation and distorts or crops the frame.
 */
export function pickEditApiSize(width, height) {
  if (!width || !height) return API_SQUARE;
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= SQUARE_RATIO_TOLERANCE) return API_SQUARE;
  return ratio > 1 ? API_LANDSCAPE : API_PORTRAIT;
}

export async function readImageDimensions(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    return {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  } catch {
    return { width: 0, height: 0 };
  }
}

/**
 * Upscale (or downscale) the edited JPEG back to the source pixel dimensions
 * so the delivered file keeps the original aspect ratio and resolution.
 */
export async function resizeToSourceDimensions(
  outputBuffer,
  sourceWidth,
  sourceHeight
) {
  if (!sourceWidth || !sourceHeight) return outputBuffer;
  return sharp(outputBuffer)
    .resize(sourceWidth, sourceHeight, {
      kernel: sharp.kernel.lanczos3,
      fit: "fill",
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
