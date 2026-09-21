import { redirect } from "next/navigation";
import { requireAdminSession } from "../lib/auth";

export default async function RootPage() {
  const isAuthed = await requireAdminSession();
  if (isAuthed) {
    redirect("/admin");
  } else {
    redirect("/admin/login");
  }
}
