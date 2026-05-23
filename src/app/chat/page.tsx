import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ChatPageClient from "./ChatPageClient";

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin?callbackUrl=/chat");
  }
  return <ChatPageClient />;
}
