import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Markdown } from "@/components/markdown";
import { LessonVideo } from "@/components/lesson-video";
import { CompleteButton } from "./complete-button";

type LessonNav = {
  id: string;
  module_id: string;
  position: number;
  title: string;
};

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, title")
    .eq("slug", slug)
    .single();
  if (!course) notFound();

  const { data: modules } = await supabase
    .from("modules")
    .select("id, position, title")
    .eq("course_id", course.id)
    .order("position", { ascending: true });
  const moduleIds = (modules ?? []).map((m) => m.id);

  // RLS: returns the lesson only if free preview, enrolled, or admin.
  const { data: lesson } = await supabase
    .from("lessons")
    .select(
      "id, module_id, title, body_markdown, video_url, video_duration_seconds, is_free_preview",
    )
    .eq("id", lessonId)
    .maybeSingle();

  // Locked or missing → send back to the course outline.
  if (!lesson || !moduleIds.includes(lesson.module_id)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-20 text-center">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Lokað efni
        </div>
        <h1 className="mt-3 text-2xl font-bold">Þú hefur ekki aðgang að þessari lexíu</h1>
        <p className="mt-3 text-muted-foreground">
          Skráðu þig í námskeiðið til að opna allt efnið.
        </p>
        <Link
          href={`/app/akademia/${slug}`}
          className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
        >
          ← Að námskeiðinu
        </Link>
      </main>
    );
  }

  const { data: lessons } = moduleIds.length
    ? await supabase
        .from("lessons")
        .select("id, module_id, position, title")
        .in("module_id", moduleIds)
        .order("position", { ascending: true })
    : { data: [] as LessonNav[] };

  const { data: progress } = await supabase
    .from("lesson_progress")
    .select("lesson_id, completed_at")
    .eq("user_id", user.id);
  const completed = new Set(
    (progress ?? []).filter((p) => p.completed_at).map((p) => p.lesson_id),
  );

  // Flatten lessons into global order (module position, then lesson position).
  const lessonsByModule = new Map<string, LessonNav[]>();
  for (const l of (lessons ?? []) as LessonNav[]) {
    if (!lessonsByModule.has(l.module_id)) lessonsByModule.set(l.module_id, []);
    lessonsByModule.get(l.module_id)!.push(l);
  }
  const flat: LessonNav[] = [];
  for (const m of modules ?? [])
    for (const l of lessonsByModule.get(m.id) ?? []) flat.push(l);

  const idx = flat.findIndex((l) => l.id === lesson.id);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
  const isDone = completed.has(lesson.id);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href={`/app/akademia/${course.slug}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {course.title}
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_300px]">
        {/* Player */}
        <div>
          <LessonVideo url={lesson.video_url} title={lesson.title} />
          <h1 className="mt-6 text-2xl font-bold">{lesson.title}</h1>

          {lesson.body_markdown && (
            <div className="mt-5">
              <Markdown source={lesson.body_markdown} />
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <CompleteButton
              lessonId={lesson.id}
              done={isDone}
              nextHref={
                next ? `/app/akademia/${course.slug}/${next.id}` : undefined
              }
            />
            <div className="ml-auto flex gap-2">
              {prev && (
                <Link
                  href={`/app/akademia/${course.slug}/${prev.id}`}
                  className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition"
                >
                  ← Fyrri
                </Link>
              )}
              {next && (
                <Link
                  href={`/app/akademia/${course.slug}/${next.id}`}
                  className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition"
                >
                  Næsta →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Curriculum sidebar */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="font-mono text-xs tracking-widest text-accent uppercase">
            Námsefni
          </div>
          <div className="mt-4 space-y-4">
            {(modules ?? []).map((m, mi) => (
              <div key={m.id}>
                <div className="flex items-baseline gap-2 text-sm font-semibold">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(mi + 1).padStart(2, "0")}
                  </span>
                  {m.title}
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {(lessonsByModule.get(m.id) ?? []).map((l) => {
                    const current = l.id === lesson.id;
                    const done = completed.has(l.id);
                    return (
                      <li key={l.id}>
                        <Link
                          href={`/app/akademia/${course.slug}/${l.id}`}
                          className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm transition ${
                            current
                              ? "bg-accent/15 text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span
                            className={`text-[11px] ${done ? "text-accent" : "text-muted-foreground"}`}
                          >
                            {done ? "✓" : "○"}
                          </span>
                          <span className="line-clamp-1">{l.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
