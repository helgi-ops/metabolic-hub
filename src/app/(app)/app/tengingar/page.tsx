import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { terraConfigured } from "@/lib/terra/config";
import { TerraConnect } from "./terra-connect";

export const metadata = { title: "Tengingar · Metabolic" };

const STATUS: Record<string, { text: string; tone: "ok" | "err" | "info" }> = {
  connected: { text: "Úrið er tengt ✓", tone: "ok" },
  error: { text: "Tengingin tókst ekki — reyndu aftur.", tone: "err" },
  unconfigured: {
    text: "Úra-tengingin er ekki tilbúin enn (í uppsetningu).",
    tone: "info",
  },
};

const PROVIDER_LABEL: Record<string, string> = {
  GARMIN: "Garmin",
  FITBIT: "Fitbit",
  POLAR: "Polar",
  SUUNTO: "Suunto",
  OURA: "Oura",
  APPLE: "Apple Watch",
  COROS: "Coros",
  GOOGLE: "Google Fit",
};

export default async function TengingarPage({
  searchParams,
}: {
  searchParams: Promise<{ terra?: string }>;
}) {
  const { terra } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conns } = await supabase
    .from("terra_connections")
    .select("provider, connected_at")
    .eq("user_id", user.id);

  const list = conns ?? [];
  const connected = list.length > 0;
  const configured = terraConfigured();
  const status = terra ? STATUS[terra] : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Tengingar
        </div>
        <h1 className="mt-2 text-3xl font-bold">Tengja úr og tæki</h1>
        <p className="mt-2 text-muted-foreground">
          Tengdu úrið þitt til að láta æfingar skrást sjálfkrafa í Dagbókina —
          kaloríur, púls og tími rata beint inn og telja á leaderboardið.
          Styður Garmin, Apple Watch, Polar, Fitbit, Suunto, Oura o.fl.
        </p>
      </div>

      {status && (
        <div
          className={`mb-6 rounded-md border px-4 py-2 text-sm ${
            status.tone === "ok"
              ? "border-accent/40 bg-accent/10 text-accent"
              : status.tone === "err"
                ? "border-red-400/40 bg-red-500/10 text-red-400"
                : "border-border bg-muted text-muted-foreground"
          }`}
        >
          {status.text}
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="font-semibold">Úra-tenging</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {connected
                ? `Tengt: ${
                    list
                      .map((c) =>
                        c.provider
                          ? (PROVIDER_LABEL[c.provider] ?? c.provider)
                          : "úr",
                      )
                      .join(", ")
                  } — nýjar æfingar birtast sjálfkrafa.`
                : "Ekki tengt."}
            </div>
          </div>
          <TerraConnect
            connected={connected}
            configured={configured}
            userId={user.id}
          />
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Þú getur alltaf aftengt. Æfingar sem þegar hafa skráðst haldast — þú
        getur leiðrétt eða eytt þeim í Dagbókinni.
      </p>
    </main>
  );
}
