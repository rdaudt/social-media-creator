"use client";

import { useEffect, useState } from "react";

type Session = { id: string; title: string };

type Message = { id: string; role: string; content: string; generation_metadata_json?: string };

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    void fetch("/api/chat/sessions").then((r) => r.json()).then((d) => {
      setSessions(d.sessions ?? []);
      if (d.sessions?.[0]?.id) setSessionId(d.sessions[0].id);
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
      body: JSON.stringify({ sessionId, message, format: "square", selectedAssetIds: [], tempUploadRefs: [] })
    });
    setMessage("");
    const d = await fetch(`/api/chat/sessions/${sessionId}/messages`).then((r) => r.json());
    setMessages(d.messages ?? []);
  }

  return (
    <div className="grid grid-2">
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
      <section className="card">
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
                {meta?.usage ? <small>{meta.usage.model} • ${meta.usage.estimatedCost} • {meta.usage.durationMs}ms</small> : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
