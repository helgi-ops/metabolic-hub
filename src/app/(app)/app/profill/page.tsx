import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const metadata = {
  title: "Mínar upplýsingar · Metabolic",
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const { data: np } = await supabase
    .from("nutrition_profile")
    .select("sex, birth_year, height_cm, weight_kg, base_activity, goal")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Mínar upplýsingar
        </div>
        <h1 className="mt-2 text-3xl font-bold">Mínar upplýsingar</h1>
        <p className="mt-2 text-muted-foreground">
          Uppfærðu nafnið þitt og líkamstölur. Þyngdin er notuð í
          brennsluáætlun æfinga og í orkuþörf í Matardagbók.
        </p>
      </div>

      <ProfileForm
        userId={user.id}
        fullName={profile?.full_name ?? ""}
        profile={np ?? null}
      />
    </main>
  );
}
