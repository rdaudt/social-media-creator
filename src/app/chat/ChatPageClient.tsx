"use client";

import { useEffect, useState } from "react";
import type { ChatBootstrapResponse } from "@/types";

type Session = { id: string; title: string };
type Message = { id: string; role: string; content: string; generation_metadata_json?: string };

export default function ChatPageClient() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [bootstrap, setBootstrap] = useState<ChatBootstrapResponse | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    void fetch("/api/chat/bootstrap")
      .then((r) => r.json())
      .then((d: ChatBootstrapResponse) => {
        setBootstrap(d);
        setSessions((d.sessions ?? []).map((s) => ({ id: s.id, title: s.title })));
        setSessionId(d.sessions?.[0]?.id ?? "");
        setSelectedLocationId(d.defaults?.selectedLocationId ?? "");
        setSelectedClassId(d.defaults?.selectedClassId ?? "");
        if (d.templates?.[0]?.id) setSelectedTemplateId(d.templates[0].id);
      });
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    void fetch(`/api/chat/sessions/${sessionId}/messages`).then((r) => r.json()).then((d) => setMessages(d.messages ?? []));
  }, [sessionId]);

  async function createSession() {
    const res = await fetch("/api/chat/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "New session" }) });
    const data = await res.json();
    setSessionId(data.id);
    setSessions((p) => [{ id: data.id, title: data.title }, ...p]);
  }

  async function submitGenerate() {
    if (!sessionId || !message.trim()) return;
    await fetch("/api/chat/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message,
        promptTemplateId: selectedTemplateId || undefined,
        locationId: selectedLocationId || undefined,
        classId: selectedClassId || undefined,
        format: "square",
        selectedAssetIds,
        tempUploadRefs: []
      })
    });
    setMessage("");
    const d = await fetch(`/api/chat/sessions/${sessionId}/messages`).then((r) => r.json());
    setMessages(d.messages ?? []);
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
    const matchingLocation = (bootstrap?.locations ?? []).find((loc) => loc.locationName === selected.locationLabelAtRun);
    if (matchingLocation?.id) {
      setSelectedLocationId(matchingLocation.id);
    }
  }

  function toImageSrc(url: string | null | undefined): string | null {
    if (!url) return null;
    if (!url.includes(".blob.vercel-storage.com")) return url;
    return `/api/blob?url=${encodeURIComponent(url)}`;
  }

  return (
    <div className="grid grid-2">
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
          <option value="">Latest available</option>
          {(bootstrap?.classes ?? []).map((klass) => (
            <option key={klass.id} value={klass.id}>
              {formatClassEntry(klass.classDate, klass.startTime ?? klass.ranAt, klass.locationLabelAtRun, klass.timerNameAtRun)}
            </option>
          ))}
        </select>
        <h3 style={{ marginTop: 10 }}>Template</h3>
        <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
          <option value="">No template</option>
          {(bootstrap?.templates ?? []).map((tpl) => (
            <option key={tpl.id} value={tpl.id}>{tpl.title}</option>
          ))}
        </select>
        <h3 style={{ marginTop: 10 }}>Assets</h3>
        <div style={{ maxHeight: 160, overflowY: "auto" }}>
          {(bootstrap?.assets ?? []).map((asset) => (
            <label key={asset.id} style={{ display: "block" }}>
              <input type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => toggleAsset(asset.id)} /> {asset.title}
            </label>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Sessions</h2>
        <button onClick={createSession}>New Session</button>
        <div style={{ marginTop: 12 }}>
          {sessions.map((s) => (
            <div key={s.id}>
              <button onClick={() => setSessionId(s.id)}>{s.title}</button>
            </div>
          ))}
        </div>
      </section>
      <section className="card" style={{ gridColumn: "1 / span 2" }}>
        <h2>Chat</h2>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Describe the image you want to generate" />
        <div style={{ marginTop: 8 }}>
          <button onClick={submitGenerate}>Generate</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {messages.map((m) => {
            const meta = m.generation_metadata_json ? JSON.parse(m.generation_metadata_json) : null;
            return (
              <article key={m.id} className="card">
                <strong>{m.role}</strong>
                <p>{m.content}</p>
                {meta?.image?.signedUrl ? <img src={meta.image.signedUrl} alt="generated" style={{ width: "100%", borderRadius: 8 }} /> : null}
                {meta?.usage ? <small>{meta.usage.model} - ${meta.usage.estimatedCost} - {meta.usage.durationMs}ms</small> : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
