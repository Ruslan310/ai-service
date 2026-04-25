import { Router } from "express";
import { chatJson } from "../lib/openai.js";
import { chatJsonClaude } from "../lib/claude.js";

export const analyzeDreamRouter = Router();
const MAX_DREAM_TEXT_LENGTH = 5000;

const SYSTEM = `
Return only valid JSON without markdown.

Schema:
{
  "symbols": [string, string, string],
  "reflection": string
}

Rules:
- symbols must contain exactly 3 short phrases
- symbols should be intuitive and human, not clinical labels
- reflection must feel like a natural, human explanation (not a psychological report)
- reflection must stay within the dream experience
- reflection must NOT mention relationships, marriage, spouse, partner, or real-life assumptions unless explicitly present in the dream
- reflection must NOT give advice or instructions
- keep reflection concise (6-8 sentences)
`;

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
    const { dreamText, age, gender, status, mood, language, provider } =
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

    const userPrompt = `
Interpret this dream in a natural, human way, like you're gently helping someone understand what they felt.

IMPORTANT:
- Stay strictly within the dream content
- Do NOT assume anything about the user's real life
- Do NOT interpret the dream as a metaphor for real life situations
- Do NOT generalize to relationships or personal life situations
- Avoid sounding like a psychologist or giving structured analysis

Focus on:
- emotional atmosphere of the dream
- what the experience felt like from inside
- subtle emotional meaning of symbols (without over-explaining)

Write as a calm, thoughtful explanation, not a report.

Dream:
${dreamText}

Mood:
${mood}

Write in ${outputLanguage}.
`;

    const parsed =
      selectedProvider === "claude"
        ? await chatJsonClaude({
            model: "claude-sonnet-4-6",
            system: SYSTEM,
            user: userPrompt,
          })
        : await chatJson({
            model: "gpt-4o",
            system: SYSTEM,
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
