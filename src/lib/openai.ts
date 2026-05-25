import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ImageGenerationResponse = {
  output?: Array<{
    type: string;
    result?: string | null;
    content?: Array<{
      type: string;
      image_base64?: string | null;
    }>;
  }>;
};

export async function generateImageWithContext(inputPrompt: string, imageUrls: string[]): Promise<{ b64: string; usage: { input: number; output: number }; model: string }> {
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
  const responsesModel = process.env.OPENAI_RESPONSES_MODEL?.trim() || "gpt-4.1";
  const size = "1024x1536";
  const quality = "high";
  const outputFormat = "png";

  const imageB64 = imageUrls.length > 0
    ? await generateFromImageUrls(responsesModel, inputPrompt, imageUrls, size, quality, outputFormat)
    : await generateFromPrompt(model, inputPrompt, size, quality, outputFormat);

  return {
    b64: imageB64,
    usage: {
      input: 0,
      output: 0
    },
    model: imageUrls.length > 0 ? responsesModel : model
  };
}

async function generateFromPrompt(
  model: string,
  prompt: string,
  size: "1024x1024" | "1024x1536" | "1536x1024",
  quality: "low" | "medium" | "high",
  outputFormat: "png" | "jpeg" | "webp"
): Promise<string> {
  const result = await client.images.generate({
    model,
    prompt,
    size,
    quality,
    output_format: outputFormat
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("no_image_output");
  return b64;
}

async function generateFromImageUrls(
  model: string,
  prompt: string,
  imageUrls: string[],
  size: "1024x1024" | "1024x1536" | "1536x1024",
  quality: "low" | "medium" | "high",
  outputFormat: "png" | "jpeg" | "webp"
): Promise<string> {
  console.info(`[openai.image] responses_generate_start imageRefs=${imageUrls.length}`);
  const result = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...imageUrls.map((url) => ({ type: "input_image", image_url: url, detail: "high" }))
        ]
      }
    ],
    tools: [
      {
        type: "image_generation",
        quality,
        size,
        output_format: outputFormat
      }
    ],
    stream: false
  } as Parameters<typeof client.responses.create>[0]) as ImageGenerationResponse;

  const b64 = result.output
    ?.flatMap((output) => {
      if (output.type === "image_generation_call") return [output.result];
      return output.content?.map((content) => content.image_base64) ?? [];
    })
    .find((item): item is string => typeof item === "string" && item.length > 0);
  if (!b64) throw new Error("no_image_output");
  return b64;
}

