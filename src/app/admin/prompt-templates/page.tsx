import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import AdminPromptTemplatesClientPage from "./AdminPromptTemplatesClientPage";

export default async function AdminPromptTemplatesPage() {
  try {
    await requireAdmin();
  } catch (error) {
    const code = error instanceof Error ? error.message : "unauthorized";
    if (code === "unauthorized") {
      redirect("/signin?callbackUrl=/admin/prompt-templates");
    }
    redirect("/access-denied");
  }
  return <AdminPromptTemplatesClientPage />;
}
