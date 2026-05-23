import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = params.callbackUrl || "/chat";

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <section className="card" style={{ maxWidth: 560, margin: "4rem auto" }}>
      <h1>Sign in</h1>
      <p>Use your Google account to access Social Media Creator.</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: callbackUrl });
        }}
      >
        <button type="submit">Continue with Google</button>
      </form>
    </section>
  );
}
