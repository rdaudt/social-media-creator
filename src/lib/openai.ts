import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateImageWithContext(inputPrompt: string, imageUrls: string[]): Promise<{ b64: string; usage: { input: number; output: number }; model: string }> {
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  const input: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "low" | "high" | "auto" }> = [
    { type: "input_text", text: inputPrompt },
    ...imageUrls.map((url) => ({ type: "input_image" as const, image_url: url, detail: "auto" as const }))
  ];

  const result = await client.responses.create({
    model,
    input: [{ role: "user", content: input }],
    tools: [{ type: "image_generation" }]
  });

  const imageOutput = result.output
    .flatMap((item: any) => item.content ?? [])
    .find((c: any) => c.type === "output_image");

  if (!imageOutput?.image_base64) {
    throw new Error("no_image_output");
  }

  return {
    b64: imageOutput.image_base64,
    usage: {
      input: result.usage?.input_tokens ?? 0,
      output: result.usage?.output_tokens ?? 0
    },
    model
  };
}

