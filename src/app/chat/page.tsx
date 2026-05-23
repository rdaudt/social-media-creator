import { redirect } from "next/navigation";
import { requireCoachSessionUser } from "@/lib/auth";
import ChatPageClient from "./ChatPageClient";

export default async function ChatPage() {
  try {
    await requireCoachSessionUser();
  } catch (error) {
    const code = error instanceof Error ? error.message : "unauthorized";
    if (code === "forbidden") {
      redirect("/access-denied");
    }
    redirect("/signin?callbackUrl=/chat");
  }

  return <ChatPageClient />;
}
