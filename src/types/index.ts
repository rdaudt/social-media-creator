export type Role = "coach" | "admin";

export type SessionUser = {
  sub: string;
  email: string;
  role: Role;
};

export type ChatMessageRole = "user" | "assistant" | "system";

export type GenerateResponse = {
  messageId: string;
  image: { signedUrl: string; expiresAt: string };
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    durationMs: number;
    model: string;
  };
  status: "completed" | "failed";
  error?: { code: string; message: string };
};
