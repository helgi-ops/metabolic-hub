import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Framvinda iðkenda · Akademía" };

export default async function CourseProgressPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  // Enrollment data is admin-only (RLS), so this overview is too.
  if (profile?.role !== "admin") redirect(`/app/akademia/${slug}`);

  const { data: course } = await supabase
    .from("courses")
    .select("id, title")
    .eq("slug", slug)
    .single();
  if (!course) notFound();

  // All lessons in the course.
  const { data: modules } = await supabase
    .from("modules")
    .select("id")
    .eq("course_id", course.id);
  const moduleIds = (modules ?? []).map((m) => m.id);
  const { data: lessons } = moduleIds.length
    ? await supabase.from("lessons").select("id").in("module_id", moduleIds)
    : { data: [] as { id: string }[] };
  const lessonIds = new Set((lessons ?? []).map((l) => l.id));
  const totalLessons = lessonIds.size;

  // Enrolled learners.
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("user_id, enrolled_at, completed_at")
    .eq("course_id", course.id)
    .order("enrolled_at", { ascending: true });
  const userIds = (enrollments ?? []).map((e) => e.user_id);

  // Names.
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  // Completed lessons per learner (only lessons that belong to this course).
  const { data: progress } = userIds.length
    ? await supabase
        .from("lesson_progress")
        .select("user_id, lesson_id, completed_at, last_watched_at")
        .in("user_id", userIds)
    : { data: [] as { user_id: string; lesson_id: string; completed_at: string | null; last_watched_at: string }[] };

  const doneByUser = new Map<string, number>();
  const lastByUser = new Map<string, string>();
  for (const p of progress ?? []) {
    if (!lessonIds.has(p.lesson_id)) continue;
    if (p.completed_at)
      doneByUser.set(p.user_id, (doneByUser.get(p.user_id) ?? 0) + 1);
    const prev = lastByUser.get(p.user_id);
    if (!prev || p.last_watched_at > prev) lastByUser.set(p.user_id, p.last_watched_at);
  }

  const rows = (enrollments ?? []).map((e) => {
    const done = doneByUser.get(e.user_id) ?? 0;
    return {
      name: nameById.get(e.user_id) || "—",
      enrolled: e.enrolled_at,
      done,
      pct: totalLessons ? Math.round((done / totalLessons) * 100) : 0,
      finished: !!e.completed_at,
      last: lastByUser.get(e.user_id) ?? null,
    };
  });

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("is-IS") : "—";

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href={`/app/akademia/${slug}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {course.title}
      </Link>
      <div className="mt-4 mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Framvinda iðkenda
        </div>
        <h1 className="mt-2 text-2xl font-bold">{course.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {rows.length} skráðir · {totalLessons} lexíur í námskeiðinu
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">Enginn skráður í námskeiðið ennþá.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Iðkandi</th>
                <th className="px-4 py-3">Skráð/ur</th>
                <th className="px-4 py-3">Síðast virk/ur</th>
                <th className="px-4 py-3 w-48">Framvinda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">
                    {r.name}
                    {r.finished && (
                      <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground uppercase">
                        Lokið
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt(r.enrolled)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt(r.last)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${r.pct}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                        {r.done}/{totalLessons} ({r.pct}%)
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
