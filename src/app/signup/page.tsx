import Link from "next/link";
import { SignupForm } from "./signup-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Nýskráning · Metabolic",
};

export default async function SignupPage() {
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
          <h1 className="mt-6 text-2xl font-semibold">Nýr aðgangur</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Búa til aðgang á Metabolic Hub.
          </p>
        </div>
        <SignupForm stations={stations ?? []} />
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
