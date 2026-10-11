"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

// Ends the session in the database, so it can't be used again, and clears the cookie.
export async function signOutAction() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}
