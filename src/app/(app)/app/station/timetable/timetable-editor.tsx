"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  id: string;
  weekday: number;
  start_time: string;
  note: string | null;
};

export function TimetableEditor({
  stationId,
  classes,
}: {
  stationId: string;
  classes: StationClass[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("");
  const [note, setNote] = useState("");

  function addClass() {
    setError(null);
    if (!startTime.trim()) {
      setError("Sláðu inn tíma (t.d. 06:00).");
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const { error: insertError } = await supabase
        .from("station_classes")
        .insert({
          station_id: stationId,
          weekday,
          start_time: startTime.trim(),
          note: note.trim() || null,
        });
      if (insertError) {
        setError(insertError.message);
        return;
      }
      setStartTime("");
      setNote("");
      router.refresh();
    });
  }

  function removeClass(id: string) {
    startTransition(async () => {
      const supabase = createClient();
      const { error: delError } = await supabase
        .from("station_classes")
        .delete()
        .eq("id", id);
      if (!delError) router.refresh();
    });
  }

  const byDay = new Map<number, StationClass[]>();
  for (const c of classes) {
    if (!byDay.has(c.weekday)) byDay.set(c.weekday, []);
    byDay.get(c.weekday)!.push(c);
  }

  return (
    <div>
      {/* Add a class */}
      <div className="rounded-lg border border-border bg-muted p-4">
        <h3 className="font-semibold">Bæta við tíma</h3>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              Dagur
            </span>
            <select
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              Tími
            </span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-xs text-muted-foreground">
              Athugasemd (valfrjálst)
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="t.d. Open gym"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <button
            onClick={addClass}
            disabled={pending}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
          >
            Bæta við
          </button>
        </div>
        {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
      </div>

      {/* Current timetable */}
      <div className="mt-6 space-y-4">
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Engir tímar skráðir enn. Bættu við hér að ofan.
          </p>
        ) : (
          WEEKDAYS.map((day, i) => {
            const list = byDay.get(i + 1);
            if (!list || list.length === 0) return null;
            return (
              <div
                key={day}
                className="rounded-lg border border-border bg-muted p-4"
              >
                <h3 className="font-semibold">{day}</h3>
                <ul className="mt-2 divide-y divide-border">
                  {list.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="flex items-center gap-3">
                        <span className="font-mono">{c.start_time}</span>
                        {c.note && (
                          <span className="text-muted-foreground">
                            {c.note}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => removeClass(c.id)}
                        disabled={pending}
                        className="text-xs text-muted-foreground hover:text-red-400 transition disabled:opacity-50"
                      >
                        Eyða
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
