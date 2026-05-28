"use client";

import { useState } from "react";
import { Button, Panel } from "@/components/ui";

export default function AdminPromptTemplatesClientPage() {
  const [title, setTitle] = useState("Instagram Promo");
  const [promptText, setPromptText] = useState("Create an energetic branded HIIT instagram post.");

  async function createTemplate() {
    await fetch("/api/admin/prompt-templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, platform: "instagram", format: "square", promptText, defaultOptions: { tone: "energetic" }, isActive: true })
    });
  }

  return (
    <Panel className="stack">
      <h2 className="panel-title">Admin Template CRUD</h2>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={5} value={promptText} onChange={(e) => setPromptText(e.target.value)} />
      <div className="actions">
        <Button onClick={createTemplate}>Create Template</Button>
      </div>
    </Panel>
  );
}
