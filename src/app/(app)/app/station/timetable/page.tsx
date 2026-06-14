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
    .select("station_id, coach_station_ids")
    .eq("id", user.id)
    .single();

  const { data: stations } = await supabase
    .from("stations")
    .select("id, slug, name")
    .order("name", { ascending: true });
  const allStations = stations ?? [];

  // Stations this user may edit: admins → all; coaches → primary + extras.
  const myIds = [
    profile?.station_id,
    ...(profile?.coach_station_ids ?? []),
  ].filter(Boolean) as string[];
  const allowedStations = isAdmin
    ? allStations
    : allStations.filter((s) => myIds.includes(s.id));
  const canSwitch = allowedStations.length > 1;

  const targetStationId =
    stationParam && allowedStations.some((s) => s.id === stationParam)
      ? stationParam
      : allowedStations[0]?.id ?? profile?.station_id;
  const station = allStations.find((s) => s.id === targetStationId);

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

      {/* Switch station (admins, and coaches with more than one station) */}
      {canSwitch && (
        <div className="mb-6 flex flex-wrap gap-2">
          {allowedStations.map((s) => (
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
