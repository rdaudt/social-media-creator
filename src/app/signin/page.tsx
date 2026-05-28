import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button, Panel } from "@/components/ui";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = params.callbackUrl || "/chat";

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <Panel className="stack" style={{ maxWidth: 560, margin: "4rem auto" }}>
      <h1 className="panel-title">Sign In</h1>
      <p className="muted">Use your Google account to access Social Media Creator.</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: callbackUrl });
        }}
      >
        <Button type="submit">Continue with Google</Button>
      </form>
    </Panel>
  );
}
