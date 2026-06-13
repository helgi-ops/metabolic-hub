import Link from "next/link";
import { requireStaff } from "@/lib/auth/require-staff";
import { TimetableEditor } from "./timetable-editor";

export const metadata = {
  title: "Tímatafla · Metabolic",
};

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const { station: stationParam } = await searchParams;
  const { supabase, user, role } = await requireStaff();
  const isAdmin = role === "admin";

  const { data: profile } = await supabase
    .from("profiles")
    .select("station_id")
    .eq("id", user.id)
    .single();

  const { data: stations } = await supabase
    .from("stations")
    .select("id, slug, name")
    .order("name", { ascending: true });

  // Coach edits their own station; admin can pick any.
  const targetStationId = isAdmin
    ? stationParam || profile?.station_id || stations?.[0]?.id
    : profile?.station_id;
  const station = stations?.find((s) => s.id === targetStationId);

  const { data: classes } = targetStationId
    ? await supabase
        .from("station_classes")
        .select("id, weekday, start_time, note")
        .eq("station_id", targetStationId)
        .order("weekday", { ascending: true })
        .order("start_time", { ascending: true })
    : { data: [] };

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <Link
          href="/app/station"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Stöðin
        </Link>
        <div className="mt-4 font-mono text-xs tracking-widest text-accent uppercase">
          Tímatafla
        </div>
        <h1 className="mt-2 text-3xl font-bold">
          {station?.name ?? "Tímatafla"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Bættu við eða eyddu tímum. Breytingar birtast strax á{" "}
          {station ? (
            <Link
              href={`/stod/${station.slug}`}
              className="text-accent hover:underline"
            >
              opinberu stöðvarsíðunni
            </Link>
          ) : (
            "opinberu stöðvarsíðunni"
          )}
          .
        </p>
      </div>

      {/* Admin: switch station */}
      {isAdmin && stations && stations.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {stations.map((s) => (
            <Link
              key={s.id}
              href={`/app/station/timetable?station=${s.id}`}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                s.id === targetStationId
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {targetStationId ? (
        <TimetableEditor
          stationId={targetStationId}
          classes={classes ?? []}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Þú ert ekki tengd/ur stöð. Hafðu samband við admin.
        </p>
      )}
    </main>
  );
}
