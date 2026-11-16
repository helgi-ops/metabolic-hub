import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Markdown } from "@/components/markdown";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Verkefnaskil · Akademía" };

const STATUS = {
  submitted: { label: "Skilað", cls: "border-sky-400/50 text-sky-400" },
  approved: { label: "Yfirfarið", cls: "border-accent/50 text-accent" },
  needs_revision: { label: "Þarf lagfæringu", cls: "border-amber-400/50 text-amber-400" },
} as const;

export default async function CourseSubmissionsPage({
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
  if (profile?.role !== "admin") redirect(`/app/akademia/${slug}`);

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, title_is")
    .eq("slug", slug)
    .single();
  if (!course) notFound();

  const { data: modules } = await supabase
    .from("modules")
    .select("id, position")
    .eq("course_id", course.id);
  const modPos = new Map((modules ?? []).map((m) => [m.id, m.position]));
  const { data: lessons } = modPos.size
    ? await supabase
        .from("lessons")
        .select("id, module_id")
        .in("module_id", [...modPos.keys()])
    : { data: [] as { id: string; module_id: string }[] };
  const lessonModule = new Map((lessons ?? []).map((l) => [l.id, l.module_id]));
  const { data: assignments } = lessonModule.size
    ? await supabase
        .from("assignments")
        .select("id, lesson_id, title, requires_approval")
        .in("lesson_id", [...lessonModule.keys()])
    : { data: [] as { id: string; lesson_id: string; title: string; requires_approval: boolean }[] };
  const assignmentById = new Map((assignments ?? []).map((a) => [a.id, a]));

  const { data: subs } = assignmentById.size
    ? await supabase
        .from("submissions")
        .select("id, assignment_id, user_id, text_response, status, feedback, submitted_at, reviewed_at")
        .in("assignment_id", [...assignmentById.keys()])
        .order("submitted_at", { ascending: false })
    : { data: [] };

  const userIds = [...new Set((subs ?? []).map((s) => s.user_id))];
  const { data: people } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name || "—"]));

  const rows = (subs ?? []).map((s) => {
    const a = assignmentById.get(s.assignment_id)!;
    return {
      ...s,
      title: a.title,
      isFinal: a.requires_approval,
      module: modPos.get(lessonModule.get(a.lesson_id) ?? "") ?? 0,
      name: nameById.get(s.user_id) ?? "—",
    };
  });
  const waitingFinal = rows.filter((r) => r.isFinal && r.status === "submitted");
  const rest = rows.filter((r) => !(r.isFinal && r.status === "submitted"));
  const unreviewed = rest.filter((r) => r.status === "submitted").length;

  const date = (s: string) => new Date(s).toLocaleDateString("is-IS", { timeZone: "Atlantic/Reykjavik" });

  const Item = ({ r, open }: { r: (typeof rows)[number]; open?: boolean }) => (
    <details open={open} className="group rounded-lg border border-border bg-muted">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4">
        <div className="min-w-0">
          <div className="font-semibold">{r.name}</div>
          <div className="text-sm text-muted-foreground">
            {r.isFinal ? "Lokaverkefni" : `Kafli ${r.module}`} · {r.title}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`rounded-full border px-2 py-0.5 ${STATUS[r.status].cls}`}>
            {STATUS[r.status].label}
          </span>
          {date(r.submitted_at)}
        </div>
      </summary>
      <div className="border-t border-border px-5 py-4">
        <div className="max-h-[32rem] overflow-auto rounded-md border border-border bg-background p-4 text-sm">
          <Markdown source={r.text_response ?? ""} />
        </div>
        <ReviewForm submissionId={r.id} isFinal={r.isFinal} initialFeedback={r.feedback ?? ""} />
      </div>
    </details>
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href={`/app/akademia/${slug}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {course.title_is || course.title}
      </Link>
      <div className="mt-6">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">Verkefnaskil</div>
        <h1 className="mt-2 text-3xl font-bold">Verkefni nemenda</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {waitingFinal.length} lokaverkefni bíða samþykkis · {unreviewed} kaflaverkefni án
          endurgjafar · {assignmentById.size} verkefni í námskeiðinu
        </p>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Lokaverkefni sem bíða</h2>
      {waitingFinal.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Ekkert bíður samþykkis.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {waitingFinal.map((r) => (
            <Item key={r.id} r={r} open />
          ))}
        </div>
      )}

      <h2 className="mt-10 text-lg font-semibold">Öll skil</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Kaflaverkefni teljast kláruð við skil — endurgjöf er valfrjáls.
      </p>
      {rest.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Engin skil ennþá.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {rest.map((r) => (
            <Item key={r.id} r={r} />
          ))}
        </div>
      )}
    </main>
  );
}
