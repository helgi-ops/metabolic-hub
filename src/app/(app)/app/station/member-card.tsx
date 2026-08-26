"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MemberActions } from "./member-actions";
import { ProgramBuilderToggle } from "./program-builder-toggle";

const CATEGORY_LABEL: Record<string, string> = {
  strength: "Strength",
  power_strength: "Power/Strength",
  power: "Power",
  endurance: "Endurance",
  burn: "Burn",
};

const MACHINE_LABEL: Record<string, string> = {
  assault_airbike: "Assault Airbike",
  concept2_row: "Concept2 Róður",
  concept2_bike: "Concept2 Bike",
  concept2_ski: "Concept2 Ski",
  other: "Annað",
};

type Member = {
  id: string;
  full_name: string | null;
  role: string;
  status: string;
  can_build_programs: boolean | null;
};

type Risk = "none" | "warn" | "at";

type LogRow = {
  id: string;
  logged_on: string;
  rpe: number | null;
  calories: number | null;
  machine: string | null;
  machines_json: Record<string, string> | null;
  weights: string | null;
  activity: string | null;
  scheduled_day: string | null;
  scheduled_category: string | null;
  level: string | null;
};

const RISK_TEXT: Record<Risk, string> = {
  none: "text-muted-foreground",
  warn: "text-amber-400",
  at: "text-red-400",
};

// Compact "Bekkpressa 60kg, Bekkpressa 65kg" → "Bekkpressa ×2 (60–65kg)".
function summarizeWeights(weights: string | null): string {
  if (!weights) return "";
  const items = weights
    .split(/\s*·\s*/)
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  const groups = new Map<string, number[]>();
  const order: string[] = [];
  const other: string[] = [];
  for (const it of items) {
    const m = it.match(/^(.+?)\s+([\d.,]+)\s*kg$/i);
    if (m) {
      const name = m[1].trim();
      const val = parseFloat(m[2].replace(",", "."));
      if (!groups.has(name)) {
        groups.set(name, []);
        order.push(name);
      }
      groups.get(name)!.push(val);
    } else {
      other.push(it);
    }
  }
  const parts = order.map((name) => {
    const vals = groups.get(name)!;
    if (vals.length > 1) {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const range = min === max ? `${min}kg` : `${min}–${max}kg`;
      return `${name} ×${vals.length} (${range})`;
    }
    return `${name} ${vals[0]}kg`;
  });
  return [...parts, ...other].join(", ");
}

function kcalOf(l: LogRow): number | null {
  if (l.machines_json) {
    const sum = Object.values(l.machines_json).reduce(
      (a, v) => a + (Number(v) || 0),
      0,
    );
    if (sum > 0) return sum;
  }
  return l.calories != null ? Number(l.calories) : null;
}

export function MemberCard({
  member,
  pbCount,
  isAdmin,
  lastLabel,
  risk,
}: {
  member: Member;
  pbCount: number;
  isAdmin: boolean;
  lastLabel: string;
  risk: Risk;
}) {
  const [open, setOpen] = useState(false);
  const isStudent = member.role === "student";

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 flex-col text-left transition hover:opacity-80"
        title="Sjá virkni"
      >
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">
            {member.full_name ?? "—"}
          </span>
          {member.role !== "student" && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-accent">
              {member.role}
            </span>
          )}
          {isStudent && member.status === "suspended" && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-red-400">
              Lokað
            </span>
          )}
        </span>
        <span className="text-xs">
          {isStudent ? (
            <span className={RISK_TEXT[risk]}>
              {lastLabel}
              {risk === "at" && " ⚠"}
            </span>
          ) : (
            <span className="text-muted-foreground">{pbCount} met</span>
          )}
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-2">
        {isStudent && (
          <MemberActions
            memberId={member.id}
            status={member.status}
            canDelete={isAdmin}
          />
        )}
        {isAdmin && member.role === "coach" && (
          <ProgramBuilderToggle
            memberId={member.id}
            enabled={member.can_build_programs}
          />
        )}
      </span>

      {open && (
        <ActivityModal
          member={member}
          pbCount={pbCount}
          onClose={() => setOpen(false)}
        />
      )}
    </li>
  );
}

function ActivityModal({
  member,
  pbCount,
  onClose,
}: {
  member: Member;
  pbCount: number;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<LogRow[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("workout_logs")
        .select(
          "id, logged_on, rpe, calories, machine, machines_json, weights, activity, scheduled_day, scheduled_category, level",
        )
        .eq("user_id", member.id)
        .order("logged_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40);
      if (alive) setLogs((data ?? []) as LogRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [member.id]);

  const total = logs?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">
              {member.full_name ?? "—"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pbCount} skráð met
              {logs != null &&
                ` · ${total} æfing${total === 1 ? "" : "ar"} skráð${
                  total === 1 ? "" : "ar"
                }`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Loka"
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[calc(80vh-4.5rem)] overflow-y-auto px-5 py-4">
          {logs == null ? (
            <p className="text-sm text-muted-foreground">Sæki virkni…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Engin skráð æfing enn.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {logs.map((l) => {
                const kcal = kcalOf(l);
                const what = l.activity
                  ? `🚲 ${l.activity}`
                  : [
                      l.scheduled_day,
                      l.scheduled_category
                        ? (CATEGORY_LABEL[l.scheduled_category] ??
                          l.scheduled_category)
                        : null,
                      l.level,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Æfing";
                const w = summarizeWeights(l.weights);
                return (
                  <li
                    key={l.id}
                    className="rounded-lg border border-border bg-muted px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{what}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {l.logged_on}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {l.rpe != null && <span>RPE {l.rpe}/10</span>}
                      {kcal != null && (
                        <span>
                          {Math.round(kcal)} kcal
                          {l.machine && !l.machines_json
                            ? ` · ${MACHINE_LABEL[l.machine] ?? l.machine}`
                            : ""}
                        </span>
                      )}
                    </div>
                    {w && (
                      <div className="mt-1 text-xs text-foreground/80">{w}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
