import { z } from "zod";

export const templateSchema = z.object({
  title: z.string().min(3),
  platform: z.string().min(2),
  format: z.enum(["square", "portrait", "story"]),
  promptText: z.string().min(10),
  defaultOptions: z.record(z.any()).optional(),
  isActive: z.boolean().optional()
});

export const generateSchema = z.object({
  mode: z.enum(["generate", "download_prompt"]).default("generate"),
  sessionId: z.string().min(1),
  message: z.string().min(1),
  promptTemplateId: z.string().optional(),
  attendeeName: z.string().trim().min(1).max(120).optional(),
  attendeeImageRef: z.string().url().optional(),
  locationId: z.string().optional(),
  classId: z.string().optional(),
  platform: z.literal("instagram").default("instagram"),
  format: z.enum(["square", "portrait", "story"]),
  outputPreset: z.enum(["ig_square_1080", "ig_portrait_1080x1350", "ig_story_1080x1920"]).optional(),
  aspectRatio: z.enum(["1:1", "4:5", "9:16"]).optional(),
  selectedAssetIds: z.array(z.string()).default([]),
  tempUploadRefs: z.array(z.string()).default([]),
  options: z.record(z.any()).optional(),
  parentMessageId: z.string().optional()
});
