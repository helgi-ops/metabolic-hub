import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CoachSignupForm } from "./coach-signup-form";

export const metadata = {
  title: "Þjálfaraskráning · Metabolic",
};

export default async function CoachSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ kodi?: string }>;
}) {
  const { kodi } = await searchParams;
  const supabase = await createClient();
  const { data: stations } = await supabase
    .from("stations")
    .select("id, name")
    .order("name", { ascending: true });

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="font-mono text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground"
          >
            ← Metabolic
          </Link>
          <h1 className="mt-6 text-2xl font-semibold">Þjálfaraaðgangur</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Búa til þjálfaraaðgang á Metabolic Hub. Þú þarft boðskóða frá Metabolic.
          </p>
        </div>
        <CoachSignupForm stations={stations ?? []} presetCode={kodi ?? ""} />
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Áttu nú þegar aðgang?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Innskráning
          </Link>
        </div>
      </div>
    </main>
  );
}
