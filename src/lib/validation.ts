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
  sessionId: z.string().min(1),
  message: z.string().min(1),
  promptTemplateId: z.string().optional(),
  format: z.enum(["square", "portrait", "story"]),
  selectedAssetIds: z.array(z.string()).default([]),
  tempUploadRefs: z.array(z.string()).default([]),
  options: z.record(z.any()).optional(),
  parentMessageId: z.string().optional()
});