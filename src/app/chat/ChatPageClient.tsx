"use client";

import { useEffect, useState } from "react";
import type { ChatBootstrapResponse } from "@/types";

type Session = { id: string; title: string };
type Message = { id: string; role: string; content: string; generation_metadata_json?: string; attachments_json?: string };
type TempUploadResponseItem = { url: string; name?: string };

export default function ChatPageClient() {
  const [activeTab, setActiveTab] = useState<"chat" | "prompt">("chat");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [bootstrap, setBootstrap] = useState<ChatBootstrapResponse | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<"square" | "portrait" | "story">("square");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [tempUploadRefs, setTempUploadRefs] = useState<string[]>([]);
  const [tempUploadNames, setTempUploadNames] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [generationError, setGenerationError] = useState<string>("");

  useEffect(() => {
    void fetch("/api/chat/bootstrap")
      .then((r) => r.json())
      .then((d: ChatBootstrapResponse) => {
        setBootstrap(d);
        setSessions((d.sessions ?? []).map((s) => ({ id: s.id, title: s.title })));
        setSessionId(d.sessions?.[0]?.id ?? "");
        setSelectedLocationId(d.defaults?.selectedLocationId ?? "");
        if (d.templates?.[0]) {
          setSelectedTemplateId(d.templates[0].id);
          setMessage(d.templates[0].promptText);
        }
      });
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    void fetch(`/api/chat/sessions/${sessionId}/messages`).then((r) => r.json()).then((d) => setMessages(d.messages ?? []));
  }, [sessionId]);

  async function createSession(title = "New session"): Promise<string | null> {
    const res = await fetch("/api/chat/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    const data = await res.json();
    if (!res.ok || typeof data.id !== "string") {
      setGenerationError("Could not create a chat session. Please try again.");
      return null;
    }
    setSessionId(data.id);
    setSessions((p) => [{ id: data.id, title: data.title }, ...p]);
    return data.id;
  }

  async function submitGenerate() {
    if (!message.trim() || isGenerating) return;
    const selectedClass = (bootstrap?.classes ?? []).find((klass) => klass.id === selectedClassId);
    if (!selectedClass) {
      setGenerationError("Select a HIIT class before generating an image.");
      return;
    }
    if (!selectedClass.classDate || !(selectedClass.startTime ?? selectedClass.ranAt)) {
      setGenerationError("The selected HIIT class needs a date and start time before image generation.");
      return;
    }

    const activeSessionId = sessionId || await createSession("New session");
    if (!activeSessionId) return;

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
          locationId: selectedLocationId || undefined,
          classId: selectedClassId || undefined,
          platform: "instagram",
          format: selectedFormat,
          outputPreset: selectedFormat === "portrait" ? "ig_portrait_1080x1350" : selectedFormat === "story" ? "ig_story_1080x1920" : "ig_square_1080",
          selectedAssetIds,
          tempUploadRefs
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
      } else {
        setMessage("");
        setTempUploadRefs([]);
        setTempUploadNames([]);
      }
      const d = await fetch(`/api/chat/sessions/${activeSessionId}/messages`).then((r) => r.json());
      setMessages(d.messages ?? []);
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
    const datePart = classDate || "No date";
    const startTimePart = startTime ? new Date(startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "No time";
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

  async function uploadReferenceFiles(files: FileList | null) {
    if (!files?.length) return;
    const activeSessionId = sessionId || await createSession("New session");
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
    setTempUploadRefs((prev) => [...prev, ...uploads.map((upload) => String(upload.url))]);
    setTempUploadNames((prev) => [...prev, ...uploads.map((upload) => String(upload.name ?? "Reference image"))]);
  }

  function toImageSrc(url: string | null | undefined): string | null {
    if (!url) return null;
    if (!url.includes(".blob.vercel-storage.com")) return url;
    return `/api/blob?url=${encodeURIComponent(url)}`;
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

  return (
    <div className="grid grid-2">
      <section className="card" style={{ gridColumn: "1 / span 2", display: "flex", gap: 8 }}>
        <button onClick={() => setActiveTab("chat")} disabled={activeTab === "chat"}>Chat</button>
        <button onClick={() => setActiveTab("prompt")} disabled={activeTab === "prompt"}>Prompt Debug</button>
      </section>
      <section className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {toImageSrc(bootstrap?.coach?.coachPhotoUrl) ? (
            <img
              src={toImageSrc(bootstrap?.coach?.coachPhotoUrl) ?? ""}
              alt={bootstrap?.coach?.coachName ?? "Coach photo"}
              style={{ width: 44, height: 44, objectFit: "cover", borderRadius: "50%" }}
            />
          ) : null}
          <h2 style={{ margin: 0 }}>{bootstrap?.coach?.coachName ?? "Coach"}</h2>
        </div>
        <p><strong>Tagline:</strong> {bootstrap?.coach?.headerTagline ?? "N/A"}</p>
        <p><strong>Bio:</strong> {bootstrap?.coach?.bio ?? "N/A"}</p>
        <p><strong>Business:</strong> {bootstrap?.coach?.businessName ?? "N/A"}</p>
        {toImageSrc(bootstrap?.coach?.businessLogoUrl) ? (
          <img
            src={toImageSrc(bootstrap?.coach?.businessLogoUrl) ?? ""}
            alt={`${bootstrap?.coach?.businessName ?? "Business"} logo`}
            style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 8 }}
          />
        ) : null}
        <h3 style={{ marginTop: 10 }}>HIIT Classes</h3>
        <select value={selectedClassId} onChange={(e) => onClassChange(e.target.value)}>
          <option value="">Select a class</option>
          {(bootstrap?.classes ?? []).map((klass) => (
            <option key={klass.id} value={klass.id}>
              {formatClassEntry(klass.classDate, klass.startTime ?? klass.ranAt, klass.locationLabelAtRun, klass.timerNameAtRun)}
            </option>
          ))}
        </select>
        <h3 style={{ marginTop: 10 }}>Template</h3>
        <select value={selectedTemplateId} onChange={(e) => onTemplateChange(e.target.value)}>
          <option value="">No template</option>
          {(bootstrap?.templates ?? []).map((tpl) => (
            <option key={tpl.id} value={tpl.id}>{tpl.title}</option>
          ))}
        </select>
        <h3 style={{ marginTop: 10 }}>Format</h3>
        <select value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value as "square" | "portrait" | "story")}>
          <option value="square">Square (1080x1080)</option>
          <option value="portrait">Portrait (1080x1350)</option>
          <option value="story">Story (1080x1920)</option>
        </select>
        <h3 style={{ marginTop: 10 }}>Assets</h3>
        <div style={{ maxHeight: 160, overflowY: "auto" }}>
          {(bootstrap?.assets ?? []).map((asset) => (
            <label key={asset.id} style={{ display: "block" }}>
              <input type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => toggleAsset(asset.id)} /> {asset.title}
            </label>
          ))}
        </div>
        <h3 style={{ marginTop: 10 }}>Upload References</h3>
        <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple onChange={(e) => void uploadReferenceFiles(e.target.files)} />
        {tempUploadNames.length ? <small>{tempUploadNames.length} staged: {tempUploadNames.join(", ")}</small> : null}
      </section>
      <section className="card">
        <h2>Sessions</h2>
        <button onClick={() => void createSession()}>New Session</button>
        <div style={{ marginTop: 12 }}>
          {sessions.map((s) => (
            <div key={s.id}>
              <button onClick={() => setSessionId(s.id)}>{s.title}</button>
            </div>
          ))}
        </div>
      </section>
      <section className="card" style={{ gridColumn: "1 / span 2" }}>
        {activeTab === "chat" ? (
          <>
        <h2>Chat</h2>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Describe the image you want to generate" />
        <div style={{ marginTop: 8 }}>
          <button onClick={submitGenerate} disabled={isGenerating}>{isGenerating ? "Generating..." : "Generate"}</button>
        </div>
        {generationStatus ? <p style={{ marginTop: 8 }}>{generationStatus}</p> : null}
        {generationError ? <p style={{ marginTop: 8, color: "#9b1c1c" }}>{generationError}</p> : null}
        <div style={{ marginTop: 12 }}>
          {messages.map((m) => {
            const meta = m.generation_metadata_json ? JSON.parse(m.generation_metadata_json) : null;
            return (
              <article key={m.id} className="card">
                <strong>{m.role}</strong>
                <p>{m.content}</p>
                {meta?.image?.signedUrl ? <img src={meta.image.signedUrl} alt="generated" style={{ width: "100%", borderRadius: 8 }} /> : null}
                {meta?.image?.signedUrl ? <p><a href={meta.image.signedUrl} download>Download</a> <small>Expires {new Date(meta.image.expiresAt).toLocaleString()}</small></p> : null}
                {meta?.usage ? (
                  <small>
                    {(meta.usage.imageModel ?? meta.usage.model)}
                    {meta.usage.orchestratorModel && meta.usage.orchestratorModel !== (meta.usage.imageModel ?? meta.usage.model)
                      ? ` (via ${meta.usage.orchestratorModel})`
                      : ""}
                    {" "} - ${meta.usage.estimatedCost} - {meta.usage.durationMs}ms
                  </small>
                ) : null}
              </article>
            );
          })}
        </div>
          </>
        ) : (
          <>
            <h2>Prompt Debug</h2>
            <p>Complete prompt sent to the LLM for the latest generation request in this session.</p>
            <textarea
              readOnly
              value={assembledPrompt || "No assembled prompt found yet for this session."}
              rows={20}
              style={{ width: "100%", whiteSpace: "pre-wrap" }}
            />
            <h3>JSON Context</h3>
            <textarea
              readOnly
              value={generationContextText || "No JSON context found yet for this session."}
              rows={14}
              style={{ width: "100%", whiteSpace: "pre-wrap" }}
            />
          </>
        )}
      </section>
    </div>
  );
}
