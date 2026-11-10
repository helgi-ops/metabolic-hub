import Link from "next/link";
import { SignupForm, type SignupStation } from "./signup-form";
import { createClient } from "@/lib/supabase/server";
import { parsePricing } from "@/lib/pricing";

export const metadata = {
  title: "Nýskráning · Metabolic",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ stod?: string | string[] }>;
}) {
  const { stod } = await searchParams;
  const slug = Array.isArray(stod) ? stod[0] : stod;

  const supabase = await createClient();
  const { data } = await supabase
    .from("stations")
    .select("id, name, slug, online_signup, pricing")
    .order("name", { ascending: true });

  const stations: SignupStation[] = (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    onlineSignup: s.online_signup,
    plans: s.online_signup ? parsePricing(s.pricing) : [],
  }));
  const preselected = (data ?? []).find((s) => s.slug === slug)?.id ?? "";

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="font-mono text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground"
          >
            ← Metabolic
          </Link>
          <h1 className="mt-6 text-2xl font-semibold">Skráning í Metabolic</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Veldu stöðina þína og búðu til aðgang að Metabolic-appinu.
          </p>
        </div>
        <SignupForm stations={stations} initialStationId={preselected} />
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
