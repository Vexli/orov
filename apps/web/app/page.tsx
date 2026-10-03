import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export default async function Home() {
  await requireUser();
  redirect("/directory");
}
