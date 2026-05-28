import { Panel } from "@/components/ui";

export default function HomePage() {
  return (
    <Panel className="stack">
      <h1 className="panel-title">Social Media Creator</h1>
      <p className="muted">Open the media creation workspace at <a href="/chat">/chat</a>.</p>
    </Panel>
  );
}
