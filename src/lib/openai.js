import OpenAI, { toFile } from "openai";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  return new OpenAI({ apiKey });
}

export async function chatJson({ model, system, user }) {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty response from OpenAI");
  }
  return JSON.parse(raw);
}

/**
 * Chat completion with one or more inline images (base64 data URLs) + optional text; JSON response.
 * @param {{ imageBase64: string, mimeType: string }[]} images
 */
export async function chatJsonVision({
  model,
  system,
  userText,
  images,
}) {
  const client = getClient();
  const imageParts = images.map(({ imageBase64, mimeType }) => ({
    type: "image_url",
    image_url: { url: `data:${mimeType};base64,${imageBase64}` },
  }));
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          ...(userText
            ? [{ type: "text", text: userText }]
            : [
                {
                  type: "text",
                  text:
                    images.length > 1
                      ? "Follow the system instructions for these images."
                      : "Follow the system instructions for this image.",
                },
              ]),
          ...imageParts,
        ],
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty response from OpenAI");
  }
  return JSON.parse(raw);
}

export async function editImageBase64({
  model,
  prompt,
  imageBase64,
  mimeType,
  size = "1024x1024",
  quality = "high",
  outputFormat = "jpeg",
}) {
  const client = getClient();
  const imageBuffer = Buffer.from(imageBase64, "base64");
  const imageFile = await toFile(imageBuffer, "source-image", {
    type: mimeType,
  });

  const response = await client.images.edit({
    model,
    image: imageFile,
    prompt,
    size,
    output_format: outputFormat,
    quality,
  });

  const result = response.data?.[0]?.b64_json;
  if (!result) {
    throw new Error("Empty image edit result from OpenAI");
  }
  return result;
}
