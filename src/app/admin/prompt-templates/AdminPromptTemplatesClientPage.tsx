"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Panel } from "@/components/ui";

type PromptTemplate = {
  id: string;
  title: string;
  platform: string;
  format: string;
  prompt_text: string;
};

export default function AdminPromptTemplatesClientPage() {
  const [title, setTitle] = useState("Instagram Promo");
  const [promptText, setPromptText] = useState("Create an energetic branded HIIT instagram post.");
  const [format, setFormat] = useState<"square" | "portrait" | "story">("square");
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadTemplates() {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/prompt-templates?platform=instagram");
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage("Could not load templates.");
        return;
      }
      setTemplates(Array.isArray(data.templates) ? data.templates as PromptTemplate[] : []);
    } catch {
      setErrorMessage("Could not load templates.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  async function createTemplate() {
    if (!title.trim() || !promptText.trim()) return;
    setIsSaving(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const res = await fetch("/api/admin/prompt-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, platform: "instagram", format, promptText, defaultOptions: { tone: "energetic" }, isActive: true })
      });
      if (!res.ok) {
        setErrorMessage("Template creation failed.");
        return;
      }
      setStatusMessage("Template created.");
      await loadTemplates();
    } catch {
      setErrorMessage("Template creation failed.");
    } finally {
      setIsSaving(false);
    }
  }

  const recentTemplates = useMemo(() => templates.slice(0, 8), [templates]);

  return (
    <div className="grid admin-templates-grid">
      <Panel className="stack">
        <div className="split">
          <h2 className="panel-title">Admin Template CRUD</h2>
          <Button variant="secondary" onClick={() => void loadTemplates()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
        <label htmlFor="template-title">Title</label>
        <input id="template-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor="template-format">Format</label>
        <select id="template-format" value={format} onChange={(e) => setFormat(e.target.value as "square" | "portrait" | "story")}>
          <option value="square">Square</option>
          <option value="portrait">Portrait</option>
          <option value="story">Story</option>
        </select>
        <label htmlFor="template-prompt">Prompt</label>
        <textarea id="template-prompt" rows={9} value={promptText} onChange={(e) => setPromptText(e.target.value)} />
        <div className="actions">
          <Button onClick={createTemplate} disabled={isSaving}>
            {isSaving ? "Creating..." : "Create Template"}
          </Button>
        </div>
        {statusMessage ? <Alert>{statusMessage}</Alert> : null}
        {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
      </Panel>
      <Panel className="stack">
        <h2 className="panel-title">Active Templates</h2>
        {isLoading ? <p className="muted">Loading...</p> : null}
        {!isLoading && recentTemplates.length === 0 ? <p className="muted">No active templates found.</p> : null}
        <div className="stack">
          {recentTemplates.map((tpl) => (
            <article key={tpl.id} className="card admin-template-list-item">
              <h3>{tpl.title}</h3>
              <small>{tpl.platform} | {tpl.format}</small>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
