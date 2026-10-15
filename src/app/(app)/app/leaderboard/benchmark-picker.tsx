"use client";

import { useRouter } from "next/navigation";

export type PickerOption = { id: string; name: string };
export type PickerSubgroup = { label: string; options: PickerOption[] };
export type PickerDropdown = { label: string; subgroups: PickerSubgroup[] };

// Two compact dropdowns (strength / conditioning) that replace a long wall of
// benchmark chips on the leaderboard. Selecting one navigates to that
// benchmark's ranking, preserving the admin station filter.
export function BenchmarkPicker({
  dropdowns,
  selectedId,
  stationParam,
}: {
  dropdowns: PickerDropdown[];
  selectedId: string | null;
  stationParam?: string;
}) {
  const router = useRouter();

  function go(id: string) {
    if (!id) return;
    const p = new URLSearchParams();
    if (stationParam) p.set("station", stationParam);
    p.set("met", id);
    router.push(`/app/leaderboard?${p.toString()}`);
  }

  return (
    <>
      {dropdowns.map((d) => {
        const active = d.subgroups.some((sg) =>
          sg.options.some((o) => o.id === selectedId),
        );
        return (
          <select
            key={d.label}
            value={active ? (selectedId as string) : ""}
            onChange={(e) => go(e.target.value)}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-accent ${
              active
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <option value="" disabled>
              {d.label}
            </option>
            {d.subgroups.map((sg) => (
              <optgroup key={sg.label} label={sg.label}>
                {sg.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        );
      })}
    </>
  );
}
