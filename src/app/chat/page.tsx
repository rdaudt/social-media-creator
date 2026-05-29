import { redirect } from "next/navigation";
import { requireCoachSessionUser } from "@/lib/auth";
import ChatPageClient from "./ChatPageClient";

export default async function ChatPage() {
  let role: "coach" | "admin" = "coach";
  try {
    const user = await requireCoachSessionUser();
    role = user.role;
  } catch (error) {
    const code = error instanceof Error ? error.message : "unauthorized";
    if (code === "forbidden") {
      redirect("/access-denied");
    }
    if (code === "unauthorized") {
      redirect("/signin?callbackUrl=/chat");
    }
    throw error;
  }

  return <ChatPageClient role={role} />;
}
