/** Image-edit models clients may request (allowlist). */
export const OPENAI_IMAGE_MODEL_IDS = Object.freeze([
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
]);

// Backward-compatible export name used by the route.
export const OPENAI_VISION_MODEL_IDS = OPENAI_IMAGE_MODEL_IDS;

const DEFAULT_IMAGE_MODEL = "gpt-image-1-mini";

export function resolveVisionModel(requested) {
  if (requested == null || requested === "") {
    return DEFAULT_IMAGE_MODEL;
  }
  if (typeof requested !== "string") {
    return null;
  }
  const normalized = requested.trim();
  if (!normalized) {
    return DEFAULT_IMAGE_MODEL;
  }
  return OPENAI_IMAGE_MODEL_IDS.includes(normalized) ? normalized : null;
}
