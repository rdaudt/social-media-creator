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
        <Button type="submit" variant="google" className="google-signin-button">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
            <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.8-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 2.9 14.6 2 12 2 6.9 2 2.8 6.2 2.8 11.3S6.9 20.6 12 20.6c6.9 0 8.6-4.9 8.6-7.4 0-.5-.1-.8-.1-1.2H12z" />
            <path fill="#34A853" d="M3.8 7.2l3.2 2.3c.9-2 2.8-3.4 5-3.4 1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 2.9 14.6 2 12 2 8.4 2 5.3 4.1 3.8 7.2z" />
            <path fill="#FBBC05" d="M12 20.6c2.5 0 4.6-.8 6.1-2.3l-2.8-2.3c-.8.6-1.9 1-3.3 1-2.2 0-4.1-1.4-4.9-3.3l-3.2 2.4C5.3 19.1 8.4 20.6 12 20.6z" />
            <path fill="#4285F4" d="M20.6 13.2c0-.5-.1-.8-.1-1.2H12v3.9h5.5c-.3 1-.9 1.8-1.8 2.3l2.8 2.3c1.6-1.5 2.6-3.8 2.6-7.3z" />
          </svg>
          Continue with Google
        </Button>
      </form>
    </Panel>
  );
}
