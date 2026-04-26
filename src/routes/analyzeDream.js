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
- symbols must contain exactly 3-4 short phrases
- symbols should be intuitive and human, not clinical labels
- reflection must feel like a natural, human explanation (not a psychological report)
- reflection must stay within the dream experience
- reflection must NOT mention relationships, marriage, spouse, partner, or real-life assumptions unless explicitly present in the dream
- reflection must NOT give advice or instructions
- keep reflection concise (8-10 sentences)
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
Interpret the dream as if you're gently talking to the dreamer.

Do not retell the plot. Focus only on what the experience felt like from inside the dream.

Stay within the dream itself. Do not connect it to real-life situations.

Pay attention to emotional shifts and contrasts (e.g. safety vs tension, control vs confusion), and reflect on why certain moments or details feel important.

Write in a natural, human tone. No formal analysis, no generic phrases.

Speak in possibilities, not conclusions.

Include one slightly sharper insight that feels a bit more direct and personal, but still grounded only in the dream.

Keep it concise (5–7 sentences).

Dream:
${dreamText}

Mood:
${mood}

Language:
${outputLanguage}
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
