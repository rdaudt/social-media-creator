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

export type CoachProfile = {
  id: string;
  businessName: string | null;
  coachName: string | null;
  coachPhotoUrl: string | null;
  businessLogoUrl: string | null;
  bio: string | null;
  brandHeadline: string | null;
  headerTagline: string | null;
  themePrimaryColor: string | null;
  themeSecondaryColor: string | null;
  igUsername: string | null;
};

export type CoachLocation = {
  id: string;
  businessName: string | null;
  locationName: string | null;
  logoUrl: string | null;
  isDefault: boolean;
  sortOrder: number;
};

export type CoachHiitClass = {
  id: string;
  timerNameAtRun: string | null;
  category: string | null;
  classDate: string | null;
  startTime: string | null;
  locationLabelAtRun: string | null;
  timerSnapshotJson: string | null;
  ranAt: string | null;
};

export type BootstrapAsset = {
  id: string;
  title: string;
  blobUrl: string;
  createdAt: string;
};

export type BootstrapTemplate = {
  id: string;
  title: string;
  platform: string;
  format: string;
  promptText: string;
  defaultOptionsJson: string | null;
};

export type BootstrapSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatBootstrapResponse = {
  coach: CoachProfile | null;
  locations: CoachLocation[];
  classes: CoachHiitClass[];
  assets: BootstrapAsset[];
  templates: BootstrapTemplate[];
  sessions: BootstrapSession[];
  defaults: {
    selectedLocationId?: string;
    selectedClassId?: string;
  };
};
