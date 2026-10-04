import { getDb } from "@officeorg/db/client";
import { findOwnProfile } from "@officeorg/db/queries/people";
import { ProfileForm } from "@/components/profile/profile-form";
import { requireUser } from "@/lib/session";

// A person's own profile (#20). The fields an admin manages are shown for reference; the rest
// they can change themself.
export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await findOwnProfile(getDb(), user.email);

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-heading">My profile</h1>
      {profile ? (
        <>
          <p className="mt-1 text-sm text-muted-fg">
            {profile.name} · {user.email}. An admin manages your name, title, manager, desk and teams.
          </p>
          <div className="mt-6">
            <ProfileForm initial={profile.form} homeRegion={profile.homeRegion} />
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-border p-5 text-sm text-muted-fg">
          Your account isn&apos;t linked to a person in the directory yet. Ask an admin to add you with
          the email {user.email}.
        </p>
      )}
    </div>
  );
}
