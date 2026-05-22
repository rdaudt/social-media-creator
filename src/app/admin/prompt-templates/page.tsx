"use client";

import { useState } from "react";

export default function AdminPromptTemplatesPage() {
  const [title, setTitle] = useState("Instagram Promo");
  const [promptText, setPromptText] = useState("Create an energetic branded HIIT instagram post.");

  async function createTemplate() {
    await fetch("/api/admin/prompt-templates", {
      method: "POST",
      headers: { "content-type": "application/json", "x-smc-role": "admin" },
      body: JSON.stringify({ title, platform: "instagram", format: "square", promptText, defaultOptions: { tone: "energetic" }, isActive: true })
    });
  }

  return (
    <section className="card">
      <h2>Admin Template CRUD</h2>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={5} value={promptText} onChange={(e) => setPromptText(e.target.value)} />
      <button onClick={createTemplate}>Create Template</button>
    </section>
  );
}
