import { Router } from "express";
import JSZip from "jszip";
import { editImageBase64 } from "../lib/openai.js";
import { OPENAI_VISION_MODEL_IDS } from "../lib/openaiVisionModels.js";

export const analyzeImageRouter = Router();

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 60 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const QUALITY_PRESETS = {
  low: {
    outputSize: "512x512",
    apiSize: "auto",
    quality: "low",
    model: "gpt-image-1-mini"
  },
  medium: {
    outputSize: "768x768",
    apiSize: "auto",
    quality: "medium",
    model: "gpt-image-1"
  },
  high: {
    outputSize: "1024x1024",
    apiSize: "auto",
    quality: "high",
    model: "gpt-image-1"
  }
};

const BASE_ENHANCEMENT_PROMPT = `
Professional photo enhancement for real user photos.

Primary objective:
- produce a polished studio-like result
- improve lighting balance (key/fill/rim feel), shadow quality, highlights, contrast
- fix horizon and perspective when visibly tilted
- keep skin tones natural and preserve identity
- remove harsh color casts while keeping realistic texture

Hard constraints:
- preserve the original subject, scene meaning, and camera framing
- do not invent new objects, text, outfits, or backgrounds
- do not over-smooth faces or create plastic skin
- keep details sharp but natural
`;

/** Used when the client sends realEstateListing: true — avoids generic "studio" goals that can alter interiors. */
const BASE_REAL_ESTATE_LISTING_PROMPT = `
Real estate listing photo edit — strict documentary fidelity.

Absolute rules:
- Never add, remove, relocate, replace, merge, or "clean up" any visible object (furniture, built-ins, appliances, range hoods, sinks, faucets, decor, plants, vehicles, people, pets, signage, light switches, outlets, door hardware, window frames, blinds, curtains, mirrors, art, rugs, bins, or outdoor elements).
- Never change the number, shape, length, or position of light fixtures (recessed cans, pendants, tracks, cords, chandeliers) or ceiling details; never remove a fixture or invent a new one.
- Never change floor material, tile pattern, plank direction, grout lines, transitions between surfaces, or thresholds.
- Never alter wall or ceiling planes, room corners, window count, door count, or cabinet layout.
- Do not invent staging, fake window views, or altered square footage impressions.
- Do not re-render or replace regions — no hallucinated pixels where real objects exist.

Allowed adjustments only:
- Exposure, highlight and shadow recovery, white balance, gentle global contrast
- Mild noise reduction and sharpening that preserves real texture and edges
- Very cautious vertical correction only if it does not warp fixtures, cabinets, or straight architectural lines

If any change would risk altering a real object or layout, skip it and leave that area identical to the source image.
`;

analyzeImageRouter.get("/models", (_req, res) => {
  res.json({ models: [...OPENAI_VISION_MODEL_IDS], defaultModel: "gpt-image-2" });
});

/**
 * Normalize request body to a list of { imageBase64, mimeType } (base64 without data URL prefix).
 * Supports legacy single field `imageBase64` + `mimeType`, or `images: [{ imageBase64, mimeType? }, ...]`.
 */
function collectImageInputs(body) {
  const { imageBase64, mimeType, images } = body ?? {};

  if (Array.isArray(images) && images.length > 0) {
    return { source: "images", items: images };
  }

  if (imageBase64 != null) {
    return {
      source: "legacy",
      items: [{ imageBase64, mimeType }],
    };
  }

  return { source: "none", items: [] };
}

analyzeImageRouter.post("/", async (req, res) => {
  try {
    const { prompt, qualityPreset = "low", realEstateListing } = req.body ?? {};
    if (!(qualityPreset in QUALITY_PRESETS)) {
      return res.status(400).json({
        error: "Unknown quality preset",
        allowedQualityPresets: Object.keys(QUALITY_PRESETS)
      });
    }
    const selectedPreset = QUALITY_PRESETS[qualityPreset];

    const collected = collectImageInputs(req.body);

    if (collected.items.length === 0) {
      return res.status(400).json({
        error:
          "Missing images: send either `images` (non-empty array) or legacy `imageBase64`",
      });
    }

    if (collected.items.length > MAX_IMAGES) {
      return res.status(400).json({
        error: `Too many images (maximum is ${MAX_IMAGES})`,
      });
    }

    const normalizedImages = [];
    let totalBytes = 0;

    for (let i = 0; i < collected.items.length; i++) {
      const entry = collected.items[i];
      const b64 = entry?.imageBase64;

      if (b64 == null) {
        return res.status(400).json({
          error: `images[${i}]: missing imageBase64`,
        });
      }

      if (typeof b64 !== "string" || !b64.trim()) {
        return res.status(400).json({
          error: `images[${i}]: imageBase64 must be a non-empty string`,
        });
      }

      const rawMime =
        typeof entry.mimeType === "string" && entry.mimeType.trim()
          ? entry.mimeType.trim().toLowerCase()
          : "image/jpeg";

      if (!ALLOWED_MIME.has(rawMime)) {
        return res.status(400).json({
          error: `images[${i}]: mimeType must be one of: ${[...ALLOWED_MIME].join(", ")}`,
        });
      }

      const normalizedB64 = b64.replace(/\s/g, "");
      let buf;
      try {
        buf = Buffer.from(normalizedB64, "base64");
      } catch {
        return res.status(400).json({
          error: `images[${i}]: imageBase64 is not valid base64`,
        });
      }

      if (!buf.length) {
        return res.status(400).json({
          error: `images[${i}]: decoded image is empty`,
        });
      }

      if (buf.length > MAX_IMAGE_BYTES) {
        return res.status(400).json({
          error: `images[${i}]: image too large after decode (max ${MAX_IMAGE_BYTES} bytes)`,
        });
      }

      totalBytes += buf.length;
      if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
        return res.status(400).json({
          error: `Total images payload is too large (max ${MAX_TOTAL_IMAGE_BYTES} bytes)`,
        });
      }

      normalizedImages.push({
        imageBase64: normalizedB64,
        mimeType: rawMime,
      });
    }

    const additionalPrompt =
      typeof prompt === "string" && prompt.trim() ? prompt.trim() : null;

    const useRealEstateBase =
      realEstateListing === true || realEstateListing === "true";

    const baseBlock = useRealEstateBase
      ? BASE_REAL_ESTATE_LISTING_PROMPT.trim()
      : BASE_ENHANCEMENT_PROMPT.trim();

    const fullPrompt = [
      baseBlock,
      additionalPrompt ? `Additional user wishes:\n${additionalPrompt}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const zip = new JSZip();

    const results = await Promise.all(
      normalizedImages.map(async (image, i) => {
        const enhancedBase64 = await editImageBase64({
          model: selectedPreset.model,
          prompt: fullPrompt,
          imageBase64: image.imageBase64,
          mimeType: image.mimeType,
          size: selectedPreset.apiSize,
          quality: selectedPreset.quality,
          outputFormat: "jpeg",
        });
        const outputBuffer = Buffer.from(enhancedBase64, "base64");
        const originalExt = MIME_TO_EXT[image.mimeType] ?? "jpg";
        return { i, outputBuffer, originalExt };
      })
    );

    for (const { i, outputBuffer, originalExt } of results) {
      zip.file(`enhanced-${i + 1}-from-${originalExt}.jpg`, outputBuffer);
    }

    const archiveBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="enhanced-photos.zip"',
    );
    return res.status(200).send(archiveBuffer);
  } catch (err) {
    if (err.message === "OPENAI_API_KEY is not set") {
      return res.status(500).json({ error: "Server misconfiguration" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to enhance photos" });
  }
});
