import { Router } from "express";
import { chatJson } from "../lib/openai.js";
import { chatJsonClaude } from "../lib/claude.js";

export const analyzeDreamRouter = Router();
const MAX_DREAM_TEXT_LENGTH = 5000;

const SYSTEM =
  "Return only valid JSON without markdown. Schema: {\"symbols\": [string, string, string], \"analysis\": \"short text\"}. Exactly 3 items in symbols. The analysis must include concise interpretations and practical advice.";

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
You are not a clinical psychologist.
You are someone who deeply understands people and emotions.

Analyze the following dream in a human, intuitive and conversational way.

Do NOT write like a report.
Do NOT give generic advice.
Do NOT mention therapy or life instructions.

STRICT RULES:
- Do NOT infer real-life situations (relationships, job, personality traits).
- Do NOT invent or assume anything about the user's life.
- Stay grounded only in the dream experience.
- Avoid general life conclusions.

Focus on:
- what the dream FEELS like
- what inner state it may reflect
- subtle emotional meaning behind symbols
- emotional contradictions (e.g. calm + anxiety)

Explain the dream step by step, as if you are guiding the person through it.

Be specific, but avoid over-interpretation.
Speak in possibilities, not conclusions.

Tone:
Natural, clear, slightly informal, emotionally intelligent.

Include:
- one strong, concise insight grounded in the dream
- one short reflective question at the end

Dream:
${dreamText}

Mood:
${mood}

User context (ignore unless directly relevant to the dream):
${profileParts.join(", ")}

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
            model: "gpt-4o-mini",
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

    const analysis =
      typeof parsed.analysis === "string" ? parsed.analysis : "";

    res.json({ symbols, analysis });
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
