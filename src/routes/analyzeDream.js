import { Router } from "express";
import { chatJson } from "../lib/openai.js";
import { chatJsonClaude } from "../lib/claude.js";

export const analyzeDreamRouter = Router();
const MAX_DREAM_TEXT_LENGTH = 10000;



/** Optional client field; empty / "not specified" are treated as absent. */
const normalizeAge = (value) => {
  if (value == null) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim())
        : NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

/** Optional client field; empty / "not specified" are treated as absent. */
const normalizeGender = (value) => {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "not specified") {
    return null;
  }
  return trimmed;
};

analyzeDreamRouter.post("/", async (req, res) => {
  try {
    const { dreamText, age, gender, status, mood, language, provider, premium } =
      req.body ?? {};

    if (dreamText == null || status == null || mood == null) {
      return res.status(400).json({
        error: "Missing required fields: dreamText, status, mood",
      });
    }

    const outputLanguage =
      typeof language === "string" && language.trim() ? language.trim() : "en";
    const selectedProvider =
      typeof provider === "string" && provider.trim()
        ? provider.trim().toLowerCase()
        : "claude";

    if (typeof dreamText !== "string") {
      return res.status(400).json({ error: "dreamText must be a string" });
    }

    if (dreamText.length > MAX_DREAM_TEXT_LENGTH) {
      return res.status(400).json({
        error: `dreamText is too long (max ${MAX_DREAM_TEXT_LENGTH} characters)`,
      });
    }

    if (selectedProvider !== "openai" && selectedProvider !== "claude") {
      return res
        .status(400)
        .json({ error: "provider must be either 'openai' or 'claude'" });
    }

    const ageForPrompt = normalizeAge(age);
    const genderForPrompt = normalizeGender(gender);
    const profileParts = [];

    if (ageForPrompt != null) {
      profileParts.push(`${ageForPrompt} years old`);
    }

    if (genderForPrompt) {
      profileParts.push(genderForPrompt);
    }

    profileParts.push(`status: ${status}`);

    const SYSTEM_FREE = `
Return only valid JSON without markdown.

Schema:
{
  "symbols": [string, string, string],
  "reflection": string
}

Rules:
- symbols must contain exactly 3 short, simple phrases
- keep symbols obvious and surface-level
- reflection must be simple, clear, and grounded in the dream events
- avoid deep interpretation or layered meaning
- keep emotional tone light and general
- do not explore hidden motives or subconscious patterns
- reflection must stay within the dream experience
- reflection must NOT mention relationships, marriage, spouse, partner, or real-life assumptions unless explicitly present in the dream
- reflection must NOT give advice or instructions
- keep reflection concise (4-6 sentences)
You must write every symbol and the reflection in ${outputLanguage}.
`;

    const SYSTEM_PREMIUM = `
Return only valid JSON without markdown.

Schema:
{
  "symbols": [string, string, string, string],
  "reflection": string
}

Rules:
- symbols must contain exactly 4 intuitive and expressive phrases
- symbols should capture emotional and symbolic layers, not just objects
- reflection must feel immersive, introspective, and emotionally rich
- explore subtle meanings, inner tension, and shifting feelings within the dream
- connect symbols together into a coherent inner narrative
- allow slightly poetic language, but keep it natural and human
- reflection must stay within the dream experience
- reflection must NOT mention relationships, marriage, spouse, partner, or real-life assumptions unless explicitly present in the dream
- reflection must NOT give advice or instructions
- keep reflection concise (10-14 sentences)
You must write every symbol and the reflection in ${outputLanguage}.
`;

    const userPrompt = `
Explain the dream in a clear, grounded, slightly bold way — like you're walking the person through it and not afraid to connect the dots.

Do NOT retell the dream. Focus on interpreting the key elements.

Structure the response:
- short intro (1–2 lines, slightly informal tone)
- then break down 4–6 important elements from the dream
- for each element:
  * name it clearly
  * explain what it represents in simple terms
  * connect it to an internal state or feeling

You ARE allowed to:
- carefully connect the dream to the dreamer’s inner state
- make grounded, human interpretations (not abstract or vague)
- be a bit direct when something feels obvious

Avoid:
- generic phrases
- overly soft or “safe” wording
- formal psychological language

End with a short, honest summary that pulls everything together in a direct way.

Dream:
${dreamText}

Mood:
${mood}

Language:
${outputLanguage}
`;
    const systemParams = premium ? SYSTEM_PREMIUM : SYSTEM_FREE;

    const parsed =
      selectedProvider === "claude"
        ? await chatJsonClaude({
            model: "claude-sonnet-4-6",
            system: systemParams,
            user: userPrompt,
          })
        : await chatJson({
            model: "gpt-4o",
            system: systemParams,
            user: userPrompt,
          });

    let symbols = Array.isArray(parsed.symbols) ? parsed.symbols : [];

    symbols = symbols
        .filter((s) => typeof s === "string")
        .slice(0, 3);

    while (symbols.length < 3) {
      symbols.push("—");
    }

    const reflection =
        typeof parsed.reflection === "string"
            ? parsed.reflection
            : typeof parsed.analysis === "string"
                ? parsed.analysis
                : "";

    res.json({ symbols, analysis: reflection });
  } catch (err) {
    if (
      err.message === "OPENAI_API_KEY is not set" ||
      err.message === "ANTHROPIC_API_KEY is not set"
    ) {
      return res.status(500).json({ error: "Server misconfiguration" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to analyze dream" });
  }
});
