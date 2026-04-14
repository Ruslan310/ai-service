import Anthropic from "@anthropic-ai/sdk";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

function parseJsonFromText(raw) {
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Claude may still wrap the JSON in a markdown code fence.
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return JSON.parse(fencedMatch[1].trim());
  }

  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  }

  throw new Error("Claude did not return valid JSON");
}

export async function chatJsonClaude({ model, system, user }) {
  const client = getClient();
  const response = await client.messages.create({
    model,
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: user }],
  });

  const textBlock = response.content.find((item) => item.type === "text");
  const raw = textBlock?.text;
  if (!raw) {
    throw new Error("Empty response from Claude");
  }

  return parseJsonFromText(raw);
}
