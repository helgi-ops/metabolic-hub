import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const WEEKDAYS = [
  "Mánudagur",
  "Þriðjudagur",
  "Miðvikudagur",
  "Fimmtudagur",
  "Föstudagur",
  "Laugardagur",
  "Sunnudagur",
];

type StationClass = {
  weekday: number;
  start_time: string;
  note: string | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: station } = await supabase
    .from("stations")
    .select("name, city")
    .eq("slug", slug)
    .single();
  if (!station) return { title: "Stöð · Metabolic" };
  return {
    title: `${station.name} — tímatafla og staðsetning`,
    description: `Tímatafla og staðsetning fyrir ${station.name}${
      station.city ? `, ${station.city}` : ""
    }.`,
  };
}

export default async function StationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: station } = await supabase
    .from("stations")
    .select("id, name, city, intro, address, maps_url")
    .eq("slug", slug)
    .single();

  if (!station) notFound();

  const { data: classes } = await supabase
    .from("station_classes")
    .select("weekday, start_time, note")
    .eq("station_id", station.id)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  const byDay = new Map<number, StationClass[]>();
  for (const c of (classes ?? []) as StationClass[]) {
    if (!byDay.has(c.weekday)) byDay.set(c.weekday, []);
    byDay.get(c.weekday)!.push(c);
  }
  const hasTimetable = byDay.size > 0;

  return (
    <main className="flex-1">
      {/* Top nav */}
      <nav className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="font-mono text-sm tracking-widest uppercase hover:text-accent transition"
          >
            ← Metabolic
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
          >
            Innskráning
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-grid border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="font-mono text-xs tracking-widest text-accent uppercase">
            Metabolic stöð
          </div>
          <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight">
            {station.name}
          </h1>
          {station.city && (
            <div className="mt-2 text-lg text-muted-foreground">
              {station.city}
            </div>
          )}
          {station.intro && (
            <p className="mt-6 max-w-2xl text-muted-foreground">
              {station.intro}
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-16 grid gap-12 lg:grid-cols-3">
        {/* Timetable */}
        <div className="lg:col-span-2">
          <h2 className="text-2xl font-bold">Tímatafla</h2>
          {hasTimetable ? (
            <div className="mt-6 space-y-4">
              {WEEKDAYS.map((day, i) => {
                const list = byDay.get(i + 1);
                if (!list || list.length === 0) return null;
                return (
                  <div
                    key={day}
                    className="rounded-lg border border-border bg-muted p-5"
                  >
                    <h3 className="font-semibold">{day}</h3>
                    <ul className="mt-3 divide-y divide-border">
                      {list.map((c, j) => (
                        <li
                          key={j}
                          className="flex items-center justify-between py-2 text-sm"
                        >
                          <span className="font-mono">{c.start_time}</span>
                          {c.note && (
                            <span className="text-muted-foreground">
                              {c.note}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-muted-foreground">
              Tímatafla fyrir þessa stöð kemur fljótlega.
            </p>
          )}
        </div>

        {/* Location + CTA */}
        <aside className="space-y-6">
          <div className="rounded-lg border border-border bg-muted p-5">
            <h2 className="font-semibold">Staðsetning</h2>
            {station.address ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {station.address}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {station.city ?? "Staðsetning kemur fljótlega."}
              </p>
            )}
            {station.maps_url && (
              <a
                href={station.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm text-accent hover:underline"
              >
                Opna í korti →
              </a>
            )}
          </div>
          <div className="rounded-lg border border-accent/40 bg-accent/10 p-5">
            <h2 className="font-semibold">Ert þú iðkandi?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Skráðu þig inn — kerfið opnar þitt svæði hjá {station.name}.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
            >
              Innskráning →
            </Link>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} Metabolic — Helgasport ehf.</div>
          <Link href="/" className="font-mono hover:text-foreground transition">
            metabolic.is
          </Link>
        </div>
      </footer>
    </main>
  );
}
