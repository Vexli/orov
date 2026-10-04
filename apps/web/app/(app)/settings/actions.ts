"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isDateFormat, isRegionDisplay } from "@officeorg/core";
import { getDb } from "@officeorg/db/client";
import { setUserSettings } from "@officeorg/db/queries/app-users";
import { requireUser } from "@/lib/session";

// Any signed-in user can change their own settings, and only their own: the email comes from
// the session, never from the form.
export async function saveSettingsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const regionDisplay = formData.get("regionDisplay");
  const dateFormat = formData.get("dateFormat");
  if (!isRegionDisplay(regionDisplay) || !isDateFormat(dateFormat)) redirect("/settings?error=1");

  // An unticked checkbox isn't sent at all.
  const regionFlag = formData.get("regionFlag") === "on";
  await setUserSettings(getDb(), user.email, { regionDisplay, regionFlag, dateFormat });
  // Every view formats regions and dates on the server, so drop cached pages for the whole app.
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}
