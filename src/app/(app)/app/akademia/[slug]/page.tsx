import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Markdown } from "@/components/markdown";
import { formatPrice, formatDuration } from "@/lib/format";
import { EnrollButton } from "../enroll-button";

const TRACK_LABEL: Record<string, string> = {
  metabolic_coach: "Metabolic Coach",
  foundations: "Foundations",
};

type LessonRow = {
  id: string;
  module_id: string;
  position: number;
  title: string;
  video_duration_seconds: number | null;
  is_free_preview: boolean;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("title")
    .eq("slug", slug)
    .single();
  return { title: `${course?.title ?? "Námskeið"} · Akademía` };
}

export default async function CoursePage({
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
  const isAdmin = profile?.role === "admin";

  const { data: course } = await supabase
    .from("courses")
    .select(
      "id, slug, title, subtitle, description, track, price_cents, currency, is_published, estimated_hours",
    )
    .eq("slug", slug)
    .single();
  if (!course) notFound();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, enrolled_at")
    .eq("user_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle();
  const enrolled = !!enrollment;

  const { data: modules } = await supabase
    .from("modules")
    .select("id, position, title, description")
    .eq("course_id", course.id)
    .order("position", { ascending: true });

  const moduleIds = (modules ?? []).map((m) => m.id);
  const { data: lessons } = moduleIds.length
    ? await supabase
        .from("lessons")
        .select(
          "id, module_id, position, title, video_duration_seconds, is_free_preview",
        )
        .in("module_id", moduleIds)
        .order("position", { ascending: true })
    : { data: [] as LessonRow[] };

  const { data: progress } = await supabase
    .from("lesson_progress")
    .select("lesson_id, completed_at")
    .eq("user_id", user.id);
  const completed = new Set(
    (progress ?? []).filter((p) => p.completed_at).map((p) => p.lesson_id),
  );

  const lessonsByModule = new Map<string, LessonRow[]>();
  for (const l of (lessons ?? []) as LessonRow[]) {
    if (!lessonsByModule.has(l.module_id)) lessonsByModule.set(l.module_id, []);
    lessonsByModule.get(l.module_id)!.push(l);
  }

  const allLessons = (lessons ?? []) as LessonRow[];
  const totalLessons = allLessons.length;
  const doneLessons = allLessons.filter((l) => completed.has(l.id)).length;
  const pct =
    totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;

  const continueLesson =
    allLessons.find((l) => !completed.has(l.id)) ?? allLessons[0];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <Link
          href="/app/akademia"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Námskeið
        </Link>
        {isAdmin && (
          <Link
            href={`/app/akademia/${course.slug}/framvinda`}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
          >
            Framvinda iðkenda →
          </Link>
        )}
      </div>

      {/* Hero */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tracking-widest text-accent uppercase">
            {TRACK_LABEL[course.track] ?? course.track}
          </span>
          {isAdmin && !course.is_published && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Óbirt
            </span>
          )}
        </div>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold">{course.title}</h1>
        {course.subtitle && (
          <p className="mt-2 text-lg text-muted-foreground">{course.subtitle}</p>
        )}
      </div>

      {/* Enrollment / progress bar */}
      <div className="mt-8 rounded-lg border border-border bg-muted p-6">
        {enrolled ? (
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Framvinda</span>
              <span className="text-muted-foreground">
                {doneLessons}/{totalLessons} lexíur ({pct}%)
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            {continueLesson && (
              <Link
                href={`/app/akademia/${course.slug}/${continueLesson.id}`}
                className="mt-5 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
              >
                {doneLessons === 0 ? "Byrja námskeið →" : "Halda áfram →"}
              </Link>
            )}
            {totalLessons > 0 && doneLessons === totalLessons && (
              <div className="mt-5">
                <div className="text-sm font-medium text-accent">
                  🎉 Til hamingju — þú hefur lokið námskeiðinu!
                </div>
                <a
                  href={`/app/akademia/${course.slug}/skirteini`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block rounded-md border border-accent px-5 py-2.5 text-sm font-medium text-accent hover:bg-accent hover:text-accent-foreground transition"
                >
                  🎓 Sækja skírteini (PDF)
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-2xl font-bold">
                {formatPrice(course.price_cents, course.currency)}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {isAdmin
                  ? "Sem admin geturðu skráð þig beint til að skoða námskeiðið."
                  : "Hafðu samband við Metabolic til að fá aðgang að námskeiðinu."}
              </p>
            </div>
            {isAdmin && <EnrollButton courseId={course.id} />}
          </div>
        )}
      </div>

      {/* Description */}
      {course.description && (
        <div className="mt-8">
          <Markdown source={course.description} />
        </div>
      )}

      {/* Curriculum */}
      <div className="mt-10">
        <h2 className="text-xl font-bold">Námsefni</h2>
        <div className="mt-5 space-y-4">
          {(modules ?? []).map((m, mi) => {
            const ls = lessonsByModule.get(m.id) ?? [];
            return (
              <div
                key={m.id}
                className="rounded-lg border border-border bg-muted p-5"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-accent">
                    {String(mi + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-semibold">{m.title}</h3>
                </div>
                {m.description && (
                  <p className="mt-1 pl-8 text-sm text-muted-foreground">
                    {m.description}
                  </p>
                )}
                <ul className="mt-3 divide-y divide-border">
                  {ls.length === 0 ? (
                    <li className="py-2 pl-8 text-sm text-muted-foreground">
                      Lexíur væntanlegar.
                    </li>
                  ) : (
                    ls.map((l) => {
                      const canOpen =
                        enrolled || isAdmin || l.is_free_preview;
                      const done = completed.has(l.id);
                      const inner = (
                        <>
                          <span className="flex items-center gap-3">
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                                done
                                  ? "border-accent bg-accent text-accent-foreground"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {done ? "✓" : canOpen ? "▸" : "🔒"}
                            </span>
                            <span className={canOpen ? "" : "text-muted-foreground"}>
                              {l.title}
                            </span>
                            {l.is_free_preview && !enrolled && (
                              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                Forskoðun
                              </span>
                            )}
                          </span>
                          {l.video_duration_seconds ? (
                            <span className="text-xs text-muted-foreground">
                              {formatDuration(l.video_duration_seconds)}
                            </span>
                          ) : null}
                        </>
                      );
                      return (
                        <li key={l.id} className="pl-8">
                          {canOpen ? (
                            <Link
                              href={`/app/akademia/${course.slug}/${l.id}`}
                              className="flex items-center justify-between py-2.5 text-sm transition hover:text-accent"
                            >
                              {inner}
                            </Link>
                          ) : (
                            <div className="flex items-center justify-between py-2.5 text-sm">
                              {inner}
                            </div>
                          )}
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
