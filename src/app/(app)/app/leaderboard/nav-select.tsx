"use client";

import { useRouter } from "next/navigation";

export type NavOption = { label: string; href: string };
export type NavGroup = { label?: string; options: NavOption[] };

// A <select> whose options are links: picking one navigates there. Used for the
// leaderboard's test, machine and station pickers so filters stay in the URL.
export function NavSelect({
  label,
  groups,
  value,
}: {
  label: string;
  groups: NavGroup[];
  value: string; // href of the selected option
}) {
  const router = useRouter();
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted px-3 text-[13px] text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => router.push(e.target.value, { scroll: false })}
        className="max-w-[220px] cursor-pointer bg-transparent text-sm text-foreground focus:outline-none"
      >
        {groups.map((g, i) =>
          g.label ? (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.href} value={o.href}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            g.options.map((o) => (
              <option key={`${i}-${o.href}`} value={o.href}>
                {o.label}
              </option>
            ))
          ),
        )}
      </select>
    </label>
  );
}
