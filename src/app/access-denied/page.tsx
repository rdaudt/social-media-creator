import { signOut } from "@/auth";

export default function AccessDeniedPage() {
  return (
    <section className="card" style={{ maxWidth: 560, margin: "4rem auto" }}>
      <h1>Access denied</h1>
      <p>Your account is signed in, but it is not authorized to use this app.</p>
      <p>If you believe this is a mistake, contact the app administrator.</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin?callbackUrl=/chat" });
        }}
      >
        <button type="submit">Sign out</button>
      </form>
    </section>
  );
}
