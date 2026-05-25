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
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  } | null;
};

type OpenAIImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "1024x1792";
type ImageUsage = { input: number; output: number };
type GeneratedImage = { b64: string; usage: ImageUsage };
type GeneratedImageWithModels = GeneratedImage & {
  orchestratorModel: string;
  imageModel: string;
  displayModel: string;
};

export async function generateImageWithContext(
  inputPrompt: string,
  imageUrls: string[],
  options: { aspectRatio?: "1:1" | "4:5" | "9:16" } = {}
): Promise<GeneratedImageWithModels> {
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
  const responsesModel = process.env.OPENAI_RESPONSES_MODEL?.trim() || "gpt-4.1";
  const size = resolveImageSize(options.aspectRatio);
  const quality = "high";
  const outputFormat = "png";

  const generated = imageUrls.length > 0
    ? await generateFromImageUrls(responsesModel, model, inputPrompt, imageUrls, size, quality, outputFormat)
    : await generateFromPrompt(model, inputPrompt, size, quality, outputFormat);

  if (imageUrls.length > 0) {
    return {
      b64: generated.b64,
      usage: generated.usage,
      orchestratorModel: responsesModel,
      imageModel: model,
      displayModel: model
    };
  }
  return {
    b64: generated.b64,
    usage: generated.usage,
    orchestratorModel: model,
    imageModel: model,
    displayModel: model
  };
}

function resolveImageSize(aspectRatio?: "1:1" | "4:5" | "9:16"): OpenAIImageSize {
  if (aspectRatio === "1:1") return "1024x1024";
  if (aspectRatio === "9:16") return "1024x1792";
  return "1024x1536";
}

async function generateFromPrompt(
  model: string,
  prompt: string,
  size: OpenAIImageSize,
  quality: "low" | "medium" | "high",
  outputFormat: "png" | "jpeg" | "webp"
): Promise<GeneratedImage> {
  const result = await client.images.generate({
    model,
    prompt,
    size,
    quality,
    output_format: outputFormat
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("no_image_output");
  return {
    b64,
    usage: {
      input: result.usage?.input_tokens ?? 0,
      output: result.usage?.output_tokens ?? 0
    }
  };
}

async function generateFromImageUrls(
  responsesModel: string,
  imageModel: string,
  prompt: string,
  imageUrls: string[],
  size: OpenAIImageSize,
  quality: "low" | "medium" | "high",
  outputFormat: "png" | "jpeg" | "webp"
): Promise<GeneratedImage> {
  console.info(`[openai.image] responses_generate_start orchestratorModel=${responsesModel} imageModel=${imageModel} imageRefs=${imageUrls.length}`);
  const result = await client.responses.create({
    model: responsesModel,
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
        model: imageModel,
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
  console.info(`[openai.image] responses_generate_done orchestratorModel=${responsesModel} imageModel=${imageModel} imageRefs=${imageUrls.length}`);
  return {
    b64,
    usage: {
      input: result.usage?.input_tokens ?? 0,
      output: result.usage?.output_tokens ?? 0
    }
  };
}

