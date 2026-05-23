import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminPromptTemplatesClientPage from "./AdminPromptTemplatesClientPage";

export default async function AdminPromptTemplatesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin?callbackUrl=/admin/prompt-templates");
  }
  if (session.user.role !== "admin") {
    redirect("/chat");
  }
  return <AdminPromptTemplatesClientPage />;
}
