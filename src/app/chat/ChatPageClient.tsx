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

  return (
    <div className="grid grid-2">
      <section className="card">
        <h2>Coach Context</h2>
        <p><strong>Business:</strong> {bootstrap?.coach?.businessName ?? "N/A"}</p>
        <p><strong>Coach:</strong> {bootstrap?.coach?.coachName ?? "N/A"}</p>
        <h3>Location</h3>
        <select value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)}>
          <option value="">None</option>
          {(bootstrap?.locations ?? []).map((loc) => (
            <option key={loc.id} value={loc.id}>
              {(loc.businessName ?? "Business")} - {(loc.locationName ?? "Location")}
            </option>
          ))}
        </select>
        <h3 style={{ marginTop: 10 }}>HIIT Class</h3>
        <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
          <option value="">Latest available</option>
          {(bootstrap?.classes ?? []).map((klass) => (
            <option key={klass.id} value={klass.id}>
              {(klass.timerNameAtRun ?? "Class")} ({klass.classDate ?? "No date"})
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
