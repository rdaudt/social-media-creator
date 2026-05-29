"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { validateHiitClassForMediaGeneration } from "@/lib/hiitClassValidation";
import type { ChatBootstrapResponse, CoachHiitClassMedia } from "@/types";

type Message = { id: string; role: string; content: string; generation_metadata_json?: string; attachments_json?: string };
type TempUploadResponseItem = { url: string; name?: string };
type GenerationImageMeta = {
  image?: {
    signedUrl?: string;
    expiresAt?: string;
    fileName?: string;
  };
  usage?: {
    model?: string;
    imageModel?: string;
    orchestratorModel?: string;
    estimatedCost?: number;
    actualCostUsd?: number;
    costConfidence?: string;
    durationMs?: number;
  };
};
type CostSnapshot = {
  estimate?: { minEstimateUsd: number; maxEstimateUsd: number; confidence: "high" | "low" };
  spend?: { todayUsd: number; monthUsd: number; lifetimeUsd: number };
  pricingBasis?: { model: string; effectiveFrom: string; version: string };
};
const WORKOUT_WARRIOR_TEMPLATE_TITLES = new Set([
  "ig hiit workout warrior",
  "ig hiit workout warrior collective"
]);
const DEFAULT_STYLE_PRESET_ID = "style_clean_dashboard_v1";

type ChatPageClientProps = {
  role: "coach" | "admin";
};

export default function ChatPageClient({ role }: ChatPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = role === "admin";
  const [activeTab, setActiveTab] = useState<"chat" | "prompt" | "classMedia">("chat");
  const [bootstrap, setBootstrap] = useState<ChatBootstrapResponse | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedStylePresetId, setSelectedStylePresetId] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<"square" | "portrait" | "story">("square");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [runSessionId, setRunSessionId] = useState<string>("");
  const [uploadSessionId, setUploadSessionId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [tempUploadRefs, setTempUploadRefs] = useState<string[]>([]);
  const [tempUploadNames, setTempUploadNames] = useState<string[]>([]);
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeImageRef, setAttendeeImageRef] = useState<string>("");
  const [attendeeImageName, setAttendeeImageName] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloadingPrompt, setIsDownloadingPrompt] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [generationError, setGenerationError] = useState<string>("");
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const [costSnapshot, setCostSnapshot] = useState<CostSnapshot | null>(null);
  const [classMedia, setClassMedia] = useState<CoachHiitClassMedia[]>([]);
  const [isLoadingClassMedia, setIsLoadingClassMedia] = useState(false);
  const [attachStateByMessageId, setAttachStateByMessageId] = useState<Record<string, "idle" | "loading" | "success" | "error">>({});
  const [deleteStateByMediaId, setDeleteStateByMediaId] = useState<Record<string, boolean>>({});
  const [shareStateByMediaId, setShareStateByMediaId] = useState<Record<string, boolean>>({});
  const [selectedClassMediaPreviewUrl, setSelectedClassMediaPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const tabFromQuery = searchParams.get("tab");
    if (tabFromQuery === "classMedia") {
      setActiveTab("classMedia");
      return;
    }
    if (tabFromQuery === "prompt" && isAdmin) {
      setActiveTab("prompt");
      return;
    }
    setActiveTab("chat");
  }, [searchParams, isAdmin]);

  useEffect(() => {
    if (!isAdmin && activeTab === "prompt") {
      setActiveTab("chat");
      return;
    }
    const currentTab = searchParams.get("tab");
    if (currentTab === activeTab) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", activeTab);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [activeTab, isAdmin, pathname, router, searchParams]);

  useEffect(() => {
    if (!isGenerating) return;
    const startedAt = Date.now();
    setGenerationElapsedSeconds(0);
    const interval = setInterval(() => {
      setGenerationElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    void fetch("/api/chat/bootstrap")
      .then((r) => r.json())
      .then((d: ChatBootstrapResponse) => {
        setBootstrap(d);
        setSelectedLocationId(d.defaults?.selectedLocationId ?? "");
        setSelectedClassId(d.defaults?.selectedClassId ?? d.classes?.[0]?.id ?? "");
        if (d.templates?.[0]) {
          setSelectedTemplateId(d.templates[0].id);
          setMessage(d.templates[0].promptText);
        }
        const stylePresets = d.stylePresets ?? [];
        const preferredStyle = stylePresets.find((preset) => preset.id === DEFAULT_STYLE_PRESET_ID) ?? stylePresets[0];
        if (preferredStyle) {
          setSelectedStylePresetId(preferredStyle.id);
        }
      });
  }, []);

  useEffect(() => {
    void fetch(`/api/chat/costs?format=${selectedFormat}`)
      .then((r) => r.json())
      .then((d: CostSnapshot) => setCostSnapshot(d))
      .catch(() => {});
  }, [selectedFormat, messages.length]);

  useEffect(() => {
    if (!selectedClassId) {
      setClassMedia([]);
      return;
    }
    void loadClassMedia(selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    if (activeTab !== "classMedia" || !selectedClassId) return;
    void loadClassMedia(selectedClassId);
  }, [activeTab, selectedClassId]);

  async function createSession(title = "Single run"): Promise<string | null> {
    const res = await fetch("/api/chat/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    const data = await res.json();
    if (!res.ok || typeof data.id !== "string") {
      setGenerationError("Could not create a chat session. Please try again.");
      return null;
    }
    return data.id;
  }

  async function ensureRunSessionId(title: string): Promise<string | null> {
    if (runSessionId) return runSessionId;
    const created = await createSession(title);
    if (!created) return null;
    setRunSessionId(created);
    return created;
  }

  async function submitGenerate() {
    if (!message.trim() || isGenerating) return;
    const selectedTemplate = (bootstrap?.templates ?? []).find((tpl) => tpl.id === selectedTemplateId);
    const isWorkoutWarriorTemplate = WORKOUT_WARRIOR_TEMPLATE_TITLES.has(selectedTemplate?.title?.trim().toLowerCase() ?? "");
    const selectedClass = (bootstrap?.classes ?? []).find((klass) => klass.id === selectedClassId);
    if (!selectedClass) {
      setGenerationError("Select a HIIT class before generating an image.");
      return;
    }
    const hiitValidation = validateHiitClassForMediaGeneration(selectedClass);
    if (!hiitValidation.ok) {
      setGenerationError(hiitValidation.message);
      return;
    }
    if (isWorkoutWarriorTemplate && !attendeeName.trim()) {
      setGenerationError("Enter the attendee name or group caption for IG HIIT Workout Warrior.");
      return;
    }

    const activeSessionId = await ensureRunSessionId("Generate image");
    if (!activeSessionId) return;
    const uploadsMatchActiveSession = uploadSessionId === activeSessionId;
    const scopedTempUploadRefs = uploadsMatchActiveSession ? tempUploadRefs : [];
    const effectiveAttendeeImageRef = uploadsMatchActiveSession
      ? attendeeImageRef || scopedTempUploadRefs[scopedTempUploadRefs.length - 1] || ""
      : "";

    if (isWorkoutWarriorTemplate && !uploadsMatchActiveSession) {
      setGenerationError("Please upload the attendee/group image again for this run.");
      return;
    }
    if (isWorkoutWarriorTemplate && !effectiveAttendeeImageRef) {
      setGenerationError("Upload the attendee or group image for IG HIIT Workout Warrior.");
      return;
    }

    setIsGenerating(true);
    setGenerationError("");
    setGenerationStatus("Image creation request submitted. Waiting for return from the LLM...");
    let poller: ReturnType<typeof setInterval> | null = null;
    try {
      poller = setInterval(() => {
        void fetch(`/api/chat/sessions/${activeSessionId}/messages`)
          .then((r) => r.json())
          .then((d) => setMessages(d.messages ?? []))
          .catch(() => {});
      }, 1200);

      const res = await fetch("/api/chat/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          message,
          promptTemplateId: selectedTemplateId || undefined,
          stylePresetId: selectedStylePresetId || undefined,
          attendeeName: attendeeName.trim() || undefined,
          attendeeImageRef: effectiveAttendeeImageRef || undefined,
          locationId: selectedLocationId || undefined,
          classId: selectedClassId || undefined,
          platform: "instagram",
          format: selectedFormat,
          outputPreset: selectedFormat === "portrait" ? "ig_portrait_1080x1350" : selectedFormat === "story" ? "ig_story_1080x1920" : "ig_square_1080",
          selectedAssetIds,
          tempUploadRefs: scopedTempUploadRefs
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMessage = typeof payload?.error?.message === "string"
          ? payload.error.message
          : typeof payload?.error === "string"
            ? payload.error
            : "Image generation failed.";
        setGenerationError(errorMessage);
      }
      const d = await fetch(`/api/chat/sessions/${activeSessionId}/messages`).then((r) => r.json());
      setMessages(d.messages ?? []);
      if (res.ok) {
        setRunSessionId("");
        setUploadSessionId("");
        setTempUploadRefs([]);
        setTempUploadNames([]);
        setAttendeeImageRef("");
        setAttendeeImageName("");
        void fetch(`/api/chat/costs?format=${selectedFormat}`)
          .then((r) => r.json())
          .then((d: CostSnapshot) => setCostSnapshot(d))
          .catch(() => {});
      }
    } finally {
      if (poller) clearInterval(poller);
      setIsGenerating(false);
      setGenerationStatus("");
    }
  }

  function toggleAsset(assetId: string) {
    setSelectedAssetIds((prev) => prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]);
  }

  function formatClassEntry(classDate: string | null, startTime: string | null, locationName: string | null, className: string | null): string {
    const datePart = classDate && /^\d{4}-\d{2}-\d{2}$/.test(classDate)
      ? classDate
      : (classDate || "No date");
    const startTimePart = (() => {
      if (!startTime) return "No time";
      if (/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) return startTime.slice(0, 5);
      const parsed = new Date(startTime);
      if (Number.isNaN(parsed.getTime())) return "No time";
      return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    })();
    const locationPart = locationName || "No location";
    const classNamePart = className || "No class name";
    return `${datePart} - ${startTimePart} - ${locationPart} - ${classNamePart}`;
  }

  function onClassChange(classId: string) {
    setSelectedClassId(classId);
    const selected = (bootstrap?.classes ?? []).find((klass) => klass.id === classId);
    if (!selected?.locationLabelAtRun) return;
    const classLocation = selected.locationLabelAtRun.trim().toLowerCase();
    const matchingLocation = (bootstrap?.locations ?? []).find((loc) => {
      const names = [loc.locationName, loc.businessName].map((name) => (name ?? "").trim().toLowerCase());
      return names.some((name) => name === classLocation);
    });
    if (matchingLocation?.id) {
      setSelectedLocationId(matchingLocation.id);
    }
  }

  function onTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);
    const selected = (bootstrap?.templates ?? []).find((tpl) => tpl.id === templateId);
    setMessage(selected?.promptText ?? "");
  }

  async function submitDownloadPrompt() {
    if (!message.trim() || isGenerating || isDownloadingPrompt) return;
    const selectedTemplate = (bootstrap?.templates ?? []).find((tpl) => tpl.id === selectedTemplateId);
    const isWorkoutWarriorTemplate = WORKOUT_WARRIOR_TEMPLATE_TITLES.has(selectedTemplate?.title?.trim().toLowerCase() ?? "");
    const selectedClass = (bootstrap?.classes ?? []).find((klass) => klass.id === selectedClassId);
    if (!selectedClass) {
      setGenerationError("Select a HIIT class before generating an image.");
      return;
    }
    const hiitValidation = validateHiitClassForMediaGeneration(selectedClass);
    if (!hiitValidation.ok) {
      setGenerationError(hiitValidation.message);
      return;
    }
    if (isWorkoutWarriorTemplate && !attendeeName.trim()) {
      setGenerationError("Enter the attendee name or group caption for IG HIIT Workout Warrior.");
      return;
    }

    const activeSessionId = await ensureRunSessionId("Download prompt");
    if (!activeSessionId) return;
    const uploadsMatchActiveSession = uploadSessionId === activeSessionId;
    const scopedTempUploadRefs = uploadsMatchActiveSession ? tempUploadRefs : [];
    const effectiveAttendeeImageRef = uploadsMatchActiveSession
      ? attendeeImageRef || scopedTempUploadRefs[scopedTempUploadRefs.length - 1] || ""
      : "";

    if (isWorkoutWarriorTemplate && !uploadsMatchActiveSession) {
      setGenerationError("Please upload the attendee/group image again for this run.");
      return;
    }
    if (isWorkoutWarriorTemplate && !effectiveAttendeeImageRef) {
      setGenerationError("Upload the attendee or group image for IG HIIT Workout Warrior.");
      return;
    }

    setIsDownloadingPrompt(true);
    setGenerationError("");
    setGenerationStatus("Preparing downloadable LLM payload...");
    try {
      const res = await fetch("/api/chat/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "download_prompt",
          sessionId: activeSessionId,
          message,
          promptTemplateId: selectedTemplateId || undefined,
          stylePresetId: selectedStylePresetId || undefined,
          attendeeName: attendeeName.trim() || undefined,
          attendeeImageRef: effectiveAttendeeImageRef || undefined,
          locationId: selectedLocationId || undefined,
          classId: selectedClassId || undefined,
          platform: "instagram",
          format: selectedFormat,
          outputPreset: selectedFormat === "portrait" ? "ig_portrait_1080x1350" : selectedFormat === "story" ? "ig_story_1080x1920" : "ig_square_1080",
          selectedAssetIds,
          tempUploadRefs: scopedTempUploadRefs
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMessage = typeof payload?.error?.message === "string"
          ? payload.error.message
          : typeof payload?.error === "string"
            ? payload.error
            : "Could not prepare LLM payload.";
        setGenerationError(errorMessage);
        return;
      }

      const assembledPromptText = typeof payload?.assembledPrompt === "string" ? payload.assembledPrompt : "";
      const fileName = typeof payload?.fileName === "string" ? payload.fileName : `llm-payload-${activeSessionId}.txt`;
      if (!assembledPromptText) {
        setGenerationError("Could not prepare LLM payload.");
        return;
      }

      const timestamp = new Date().toISOString();
      const text = [
        `LLM Payload Export | Session ${activeSessionId} | Generated at ${timestamp}`,
        "",
        assembledPromptText,
        "",
        "Note: Signed image URLs in this payload may expire."
      ].join("\n");

      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setRunSessionId("");
      setUploadSessionId("");
      setTempUploadRefs([]);
      setTempUploadNames([]);
      setAttendeeImageRef("");
      setAttendeeImageName("");
    } finally {
      setIsDownloadingPrompt(false);
      setGenerationStatus("");
    }
  }

  async function uploadReferenceFiles(files: FileList | null) {
    if (!files?.length) return;
    const activeSessionId = await ensureRunSessionId("Upload references");
    if (!activeSessionId) return;

    setGenerationError("");
    const selectedFiles = Array.from(files);
    const invalid = selectedFiles.find((file) => file.type !== "image/jpeg" && file.type !== "image/png");
    if (invalid) {
      setGenerationError("Only JPG and PNG reference images can be uploaded.");
      return;
    }

    const form = new FormData();
    form.set("sessionId", activeSessionId);
    for (const file of selectedFiles) {
      form.append("files", file);
    }

    const res = await fetch("/api/chat/generate", { method: "POST", body: form });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setGenerationError("Reference image upload failed.");
      return;
    }

    const uploads: TempUploadResponseItem[] = Array.isArray(payload.uploads) ? payload.uploads : [];
    setUploadSessionId(activeSessionId);
    setTempUploadRefs((prev) => [...prev, ...uploads.map((upload) => String(upload.url))]);
    setTempUploadNames((prev) => [...prev, ...uploads.map((upload) => String(upload.name ?? "Reference image"))]);
  }

  async function uploadAttendeeImage(file: File | null) {
    if (!file) return;
    const activeSessionId = await ensureRunSessionId("Upload attendee image");
    if (!activeSessionId) return;

    setGenerationError("");
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setGenerationError("Only JPG and PNG attendee images can be uploaded.");
      return;
    }

    const form = new FormData();
    form.set("sessionId", activeSessionId);
    form.append("files", file);

    const res = await fetch("/api/chat/generate", { method: "POST", body: form });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setGenerationError("Attendee image upload failed.");
      return;
    }

    const upload = Array.isArray(payload.uploads) ? payload.uploads[0] as TempUploadResponseItem | undefined : undefined;
    if (!upload?.url) {
      setGenerationError("Attendee image upload failed.");
      return;
    }
    setUploadSessionId(activeSessionId);
    setAttendeeImageRef(String(upload.url));
    setAttendeeImageName(String(upload.name ?? file.name ?? "Attendee image"));
  }

  function toImageSrc(url: string | null | undefined): string | null {
    if (!url) return null;
    if (!url.includes(".blob.vercel-storage.com")) return url;
    return `/api/blob?url=${encodeURIComponent(url)}`;
  }

  async function loadClassMedia(classId: string) {
    setIsLoadingClassMedia(true);
    try {
      const res = await fetch(`/api/chat/class-media?classId=${encodeURIComponent(classId)}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setClassMedia(Array.isArray(payload.media) ? payload.media : []);
    } finally {
      setIsLoadingClassMedia(false);
    }
  }

  async function attachGeneratedImage(messageId: string, generatedImageUrl: string) {
    if (!selectedClassId) {
      setGenerationError("Select a HIIT class before attaching media.");
      return;
    }
    setAttachStateByMessageId((prev) => ({ ...prev, [messageId]: "loading" }));
    try {
      const res = await fetch("/api/chat/class-media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId: selectedClassId, generatedImageUrl, sourceMessageId: messageId })
      });
      if (!res.ok) {
        setAttachStateByMessageId((prev) => ({ ...prev, [messageId]: "error" }));
        setGenerationError("Could not attach image to class.");
        return;
      }
      setAttachStateByMessageId((prev) => ({ ...prev, [messageId]: "success" }));
      await loadClassMedia(selectedClassId);
    } catch {
      setAttachStateByMessageId((prev) => ({ ...prev, [messageId]: "error" }));
      setGenerationError("Could not attach image to class.");
    }
  }

  async function deleteClassMedia(mediaId: string) {
    setDeleteStateByMediaId((prev) => ({ ...prev, [mediaId]: true }));
    try {
      const res = await fetch(`/api/chat/class-media/${mediaId}`, { method: "DELETE" });
      if (!res.ok) {
        setGenerationError("Could not delete class media.");
        return;
      }
      if (selectedClassId) await loadClassMedia(selectedClassId);
    } finally {
      setDeleteStateByMediaId((prev) => ({ ...prev, [mediaId]: false }));
    }
  }

  async function toggleClassMediaSharable(mediaId: string, isSharable: boolean) {
    setShareStateByMediaId((prev) => ({ ...prev, [mediaId]: true }));
    try {
      const res = await fetch(`/api/chat/class-media/${mediaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isSharable })
      });
      if (!res.ok) {
        setGenerationError("Could not update share setting.");
        return;
      }
      setClassMedia((prev) => prev.map((media) => (media.id === mediaId ? { ...media, isSharable } : media)));
    } finally {
      setShareStateByMediaId((prev) => ({ ...prev, [mediaId]: false }));
    }
  }

  function latestPromptEnvelope(): { assembledPrompt?: string; generationContextJson?: unknown } | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg.role !== "user" || !msg.attachments_json) continue;
      try {
        const parsed = JSON.parse(msg.attachments_json) as { promptEnvelope?: { assembledPrompt?: string; generationContextJson?: unknown } };
        if (parsed.promptEnvelope?.assembledPrompt) return parsed.promptEnvelope;
      } catch {
        // ignore parse errors and continue scanning older messages
      }
    }
    return null;
  }

  const promptEnvelope = latestPromptEnvelope();
  const assembledPrompt = promptEnvelope?.assembledPrompt ?? "";
  const generationContextText = promptEnvelope?.generationContextJson
    ? JSON.stringify(promptEnvelope.generationContextJson, null, 2)
    : "";
  const selectedTemplate = (bootstrap?.templates ?? []).find((tpl) => tpl.id === selectedTemplateId);
  const stylePresetOptions = (bootstrap?.stylePresets ?? []).filter((preset) => preset.format === "any" || preset.format === selectedFormat);
  const isWorkoutWarriorTemplate = WORKOUT_WARRIOR_TEMPLATE_TITLES.has(selectedTemplate?.title?.trim().toLowerCase() ?? "");
  const isFormLocked = isGenerating;
  const elapsedMinutes = String(Math.floor(generationElapsedSeconds / 60)).padStart(2, "0");
  const elapsedSeconds = String(generationElapsedSeconds % 60).padStart(2, "0");
  const latestAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");
  const latestMeta = parseGenerationMeta(latestAssistantMessage?.generation_metadata_json);
  const latestImageMessage = [...messages].reverse().find((m) => {
    const meta = parseGenerationMeta(m.generation_metadata_json);
    return m.role === "assistant" && Boolean(meta?.image?.signedUrl);
  });
  const latestImageMeta = parseGenerationMeta(latestImageMessage?.generation_metadata_json);
  const runCostUsd = Number(latestMeta?.usage?.actualCostUsd ?? 0);
  const runCostConfidence = String(latestMeta?.usage?.costConfidence ?? "partial");

  return (
    <div className="grid">
      <section className="card stack">
        <div className="split" style={{ justifyContent: "flex-start", gap: 10 }}>
          {toImageSrc(bootstrap?.coach?.coachPhotoUrl) ? (
            <img
              src={toImageSrc(bootstrap?.coach?.coachPhotoUrl) ?? ""}
              alt={bootstrap?.coach?.coachName ?? "Coach photo"}
              style={{ width: 44, height: 44, objectFit: "cover", borderRadius: "50%" }}
            />
          ) : null}
          <h2 className="panel-title">{bootstrap?.coach?.coachName ?? "Coach"}</h2>
        </div>
        <h3>HIIT Classes</h3>
        <select value={selectedClassId} onChange={(e) => onClassChange(e.target.value)} disabled={isFormLocked}>
          <option value="">Select a class</option>
          {(bootstrap?.classes ?? []).map((klass) => (
            <option key={klass.id} value={klass.id}>
              {formatClassEntry(klass.classDate, klass.startTime ?? klass.ranAt, klass.locationLabelAtRun, klass.timerNameAtRun)}
            </option>
          ))}
        </select>
        <h3>Template</h3>
        <select value={selectedTemplateId} onChange={(e) => onTemplateChange(e.target.value)} disabled={isFormLocked}>
          <option value="">No template</option>
          {(bootstrap?.templates ?? []).map((tpl) => (
            <option key={tpl.id} value={tpl.id}>{tpl.title}</option>
          ))}
        </select>
        <h3>Style</h3>
        <select value={selectedStylePresetId} onChange={(e) => setSelectedStylePresetId(e.target.value)} disabled={isFormLocked}>
          {!selectedStylePresetId ? <option value="">Default style</option> : null}
          {stylePresetOptions.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.title}</option>
          ))}
        </select>
        <h3>Format</h3>
        <select value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value as "square" | "portrait" | "story")} disabled={isFormLocked}>
          <option value="square">Square (1080x1080)</option>
          <option value="portrait">Portrait (1080x1350)</option>
          <option value="story">Story (1080x1920)</option>
        </select>
        <h3>Assets</h3>
        <div style={{ maxHeight: 160, overflowY: "auto" }}>
          {(bootstrap?.assets ?? []).map((asset) => (
            <label key={asset.id} style={{ display: "block" }}>
              <input type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => toggleAsset(asset.id)} disabled={isFormLocked} /> {asset.title}
            </label>
          ))}
        </div>
        <h3>Upload References</h3>
        <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple onChange={(e) => void uploadReferenceFiles(e.target.files)} disabled={isFormLocked} />
        {tempUploadNames.length ? <small>{tempUploadNames.length} staged: {tempUploadNames.join(", ")}</small> : null}
        {isWorkoutWarriorTemplate ? (
          <>
            <h3 style={{ marginTop: 10 }}>Workout Warrior Attendee</h3>
            <input
              type="text"
              value={attendeeName}
              onChange={(e) => setAttendeeName(e.target.value)}
              placeholder="Attendee name"
              disabled={isFormLocked}
            />
            <input
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              onChange={(e) => void uploadAttendeeImage(e.target.files?.[0] ?? null)}
              disabled={isFormLocked}
            />
            {attendeeImageName ? <small>Staged attendee image: {attendeeImageName}</small> : null}
          </>
        ) : null}
      </section>
      {activeTab === "chat" ? (
        <>
          <section className="card stack">
            <h2 className="panel-title">Prompt</h2>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={16}
                placeholder="Describe the image you want to generate"
                style={{ width: "100%", minHeight: 360, resize: "vertical" }}
                disabled={isFormLocked}
              />
              <div className="actions">
                <button type="button" onClick={submitGenerate} disabled={isGenerating}>{isGenerating ? "Generating..." : "Generate"}</button>
                <button type="button" onClick={submitDownloadPrompt} disabled={isGenerating || isDownloadingPrompt || isFormLocked}>
                  {isDownloadingPrompt ? "Preparing..." : "Download LLM Message"}
                </button>
              </div>
              {costSnapshot?.estimate ? (
                <p className="muted">
                  Estimated cost: ${costSnapshot.estimate.minEstimateUsd.toFixed(4)} - ${costSnapshot.estimate.maxEstimateUsd.toFixed(4)}
                  {" "}({costSnapshot.estimate.confidence} confidence)
                  {costSnapshot.pricingBasis ? ` | Pricing basis: ${costSnapshot.pricingBasis.model} effective ${new Date(costSnapshot.pricingBasis.effectiveFrom).toLocaleDateString()}` : ""}
                </p>
              ) : null}
              <div className="actions">
                <small>This run: ${runCostUsd.toFixed(4)} ({runCostConfidence})</small>
                <small>Today: ${(costSnapshot?.spend?.todayUsd ?? 0).toFixed(4)}</small>
                <small>This month: ${(costSnapshot?.spend?.monthUsd ?? 0).toFixed(4)}</small>
                <small>Lifetime: ${(costSnapshot?.spend?.lifetimeUsd ?? 0).toFixed(4)}</small>
              </div>
              {generationStatus ? <p className="alert" role="status">{generationStatus}</p> : null}
              {generationError ? <p className="alert error" role="alert">{generationError}</p> : null}
          </section>
          <section className="card stack">
            <h2 className="panel-title">Created Image</h2>
            <div style={{ marginTop: 12 }}>
              {!latestImageMessage || !latestImageMeta?.image?.signedUrl ? (
                <p>No generated image found for this session yet.</p>
              ) : (
                <article key={latestImageMessage.id} className="card stack">
                  <img src={latestImageMeta.image.signedUrl} alt="generated" style={{ width: "100%", borderRadius: 8 }} />
                  <p><a href={latestImageMeta.image.signedUrl} download={latestImageMeta.image.fileName ?? "Generated Image.png"}>Download</a> <small>Expires {latestImageMeta.image.expiresAt ? new Date(latestImageMeta.image.expiresAt).toLocaleString() : "Soon"}</small></p>
                  <div style={{ marginBottom: 6 }}>
                    <button
                      type="button"
                      onClick={() => void attachGeneratedImage(latestImageMessage.id, latestImageMeta.image?.signedUrl ?? "")}
                      disabled={!selectedClassId || attachStateByMessageId[latestImageMessage.id] === "loading"}
                    >
                      {attachStateByMessageId[latestImageMessage.id] === "loading" ? "Attaching..." : "Attach to class"}
                    </button>
                    {attachStateByMessageId[latestImageMessage.id] === "success" ? <small style={{ marginLeft: 8 }}>Attached</small> : null}
                    {attachStateByMessageId[latestImageMessage.id] === "error" ? <small style={{ marginLeft: 8, color: "#9b1c1c" }}>Failed</small> : null}
                  </div>
                  {latestImageMeta?.usage ? (
                    <small>
                      {(latestImageMeta.usage.imageModel ?? latestImageMeta.usage.model)}
                      {latestImageMeta.usage.orchestratorModel && latestImageMeta.usage.orchestratorModel !== (latestImageMeta.usage.imageModel ?? latestImageMeta.usage.model)
                        ? ` (via ${latestImageMeta.usage.orchestratorModel})`
                        : ""}
                      {" "} - ${latestImageMeta.usage.estimatedCost} - {latestImageMeta.usage.durationMs}ms
                      {latestImageMeta.usage.actualCostUsd != null ? ` - actual $${Number(latestImageMeta.usage.actualCostUsd).toFixed(6)} (${String(latestImageMeta.usage.costConfidence ?? "partial")})` : ""}
                    </small>
                  ) : null}
                </article>
              )}
            </div>
          </section>
        </>
      ) : activeTab === "prompt" && isAdmin ? (
        <section className="card stack">
          <h2 className="panel-title">Prompt Debug</h2>
              <p className="muted">Complete prompt sent to the LLM for the latest generation request.</p>
              <textarea
                readOnly
                value={assembledPrompt || "No assembled prompt found yet for the latest request."}
                rows={20}
                style={{ width: "100%", whiteSpace: "pre-wrap" }}
              />
              <h3>JSON Context</h3>
              <textarea
                readOnly
                value={generationContextText || "No JSON context found yet for the latest request."}
                rows={14}
                style={{ width: "100%", whiteSpace: "pre-wrap" }}
              />
        </section>
      ) : (
        <section className="card stack">
          <div className="split">
                <h2 className="panel-title">Media Management</h2>
                <button
                  type="button"
                  onClick={() => selectedClassId ? void loadClassMedia(selectedClassId) : undefined}
                  disabled={!selectedClassId || isLoadingClassMedia}
                >
                  {isLoadingClassMedia ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              {!selectedClassId ? <p>Select a HIIT class to manage attached media.</p> : null}
              {isLoadingClassMedia ? <p>Loading class media...</p> : null}
              {!isLoadingClassMedia && selectedClassId && classMedia.length === 0 ? <p>No media attached yet for this class.</p> : null}
              <div className="media-grid">
                {classMedia.map((media) => (
                  <article key={media.id} className="card stack">
                    {toImageSrc(media.blobUrl) ? (
                      <button
                        type="button"
                        onClick={() => setSelectedClassMediaPreviewUrl(toImageSrc(media.blobUrl))}
                        style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", width: "100%" }}
                        aria-label="Open class media preview"
                      >
                        <img src={toImageSrc(media.blobUrl) ?? ""} alt="Class media" style={{ width: "100%", borderRadius: 8 }} />
                      </button>
                    ) : null}
                    <small>Attached {new Date(media.createdAt).toLocaleString()}</small>
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={media.isSharable}
                          onChange={(e) => void toggleClassMediaSharable(media.id, e.target.checked)}
                          disabled={Boolean(shareStateByMediaId[media.id])}
                        />
                        <span>Sharable</span>
                      </label>
                      {shareStateByMediaId[media.id] ? <small>Saving...</small> : null}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button type="button" onClick={() => void deleteClassMedia(media.id)} disabled={Boolean(deleteStateByMediaId[media.id])}>
                        {deleteStateByMediaId[media.id] ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
        </section>
      )}
      {selectedClassMediaPreviewUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedClassMediaPreviewUrl(null)}
          className="overlay"
        >
          <div className="card" style={{ maxWidth: "95vw", maxHeight: "95vh" }} onClick={(e) => e.stopPropagation()}>
            <img src={selectedClassMediaPreviewUrl} alt="Class media preview" style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 8 }} />
            <div style={{ marginTop: 8, textAlign: "right" }}>
              <button type="button" onClick={() => setSelectedClassMediaPreviewUrl(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
      {isGenerating ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          className="overlay"
        >
          <div
            className="card"
            style={{
              width: "min(420px, calc(100vw - 32px))",
              textAlign: "center",
              padding: 20
            }}
          >
            <div
              aria-hidden="true"
              className="spinner"
            />
            <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "#4b5563" }}>
              {elapsedMinutes}:{elapsedSeconds}
            </p>
            <p style={{ margin: 0, fontWeight: 700 }}>Generating image... usually takes ~3 minutes</p>
          </div>
        </div>
      ) : null}
      <nav className="footer-nav" role="tablist" aria-label="Media creation views">
        <button
          type="button"
          className={`tab-button ${activeTab === "chat" ? "is-active" : ""}`}
          onClick={() => setActiveTab("chat")}
          disabled={activeTab === "chat" || isFormLocked}
          role="tab"
          aria-selected={activeTab === "chat"}
          aria-label="Open Media Creation Studio"
        >
          Media Creation Studio
        </button>
        {isAdmin ? (
          <button
            type="button"
            className={`tab-button ${activeTab === "prompt" ? "is-active" : ""}`}
            onClick={() => setActiveTab("prompt")}
            disabled={activeTab === "prompt" || isFormLocked}
            role="tab"
            aria-selected={activeTab === "prompt"}
            aria-label="Open Prompt Debug"
          >
            Prompt Debug
          </button>
        ) : null}
        <button
          type="button"
          className={`tab-button ${activeTab === "classMedia" ? "is-active" : ""}`}
          onClick={() => setActiveTab("classMedia")}
          disabled={activeTab === "classMedia" || isFormLocked}
          role="tab"
          aria-selected={activeTab === "classMedia"}
          aria-label="Open Media Management"
        >
          Media Management
        </button>
      </nav>
    </div>
  );
}
  function parseGenerationMeta(raw: string | undefined): GenerationImageMeta | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GenerationImageMeta;
    } catch {
      return null;
    }
  }
