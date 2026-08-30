import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { garminConfigured } from "@/lib/garmin/config";
import { GarminConnect } from "./garmin-connect";

export const metadata = { title: "Tengingar · Metabolic" };

const STATUS: Record<string, { text: string; tone: "ok" | "err" | "info" }> = {
  connected: { text: "Garmin er tengt ✓", tone: "ok" },
  error: { text: "Tengingin tókst ekki — reyndu aftur.", tone: "err" },
  unconfigured: {
    text: "Garmin-tengingin er ekki tilbúin enn (beðið eftir aðgangi).",
    tone: "info",
  },
};

export default async function TengingarPage({
  searchParams,
}: {
  searchParams: Promise<{ garmin?: string }>;
}) {
  const { garmin } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conn } = await supabase
    .from("garmin_connections")
    .select("connected_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const connected = !!conn;
  const configured = garminConfigured();
  const status = garmin ? STATUS[garmin] : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Tengingar
        </div>
        <h1 className="mt-2 text-3xl font-bold">Tengja úr og tæki</h1>
        <p className="mt-2 text-muted-foreground">
          Tengdu Garmin-úrið þitt til að láta æfingar skrást sjálfkrafa í
          Dagbókina — kaloríur, púls og tími rata beint inn og telja á
          leaderboardið.
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
          <div>
            <div className="font-semibold">Garmin Connect</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {connected
                ? "Tengt — nýjar æfingar birtast sjálfkrafa í Dagbók."
                : "Ekki tengt."}
            </div>
          </div>
          <GarminConnect
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
