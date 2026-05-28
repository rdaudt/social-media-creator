import { signOut } from "@/auth";
import { Button, Panel } from "@/components/ui";

export default function AccessDeniedPage() {
  return (
    <Panel className="stack" style={{ maxWidth: 560, margin: "4rem auto" }}>
      <h1 className="panel-title">Access Denied</h1>
      <p className="muted">Your account is signed in, but it is not authorized to use this app.</p>
      <p className="muted">If you believe this is a mistake, contact the app administrator.</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin?callbackUrl=/chat" });
        }}
      >
        <Button type="submit">Sign out</Button>
      </form>
    </Panel>
  );
}
