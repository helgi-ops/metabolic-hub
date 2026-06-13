import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

export const metadata = { title: "Akademía · Metabolic" };

const TRACK_LABEL: Record<string, string> = {
  metabolic_coach: "Metabolic Coach",
  foundations: "Foundations",
};

export default async function AcademyHome() {
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

  // RLS shows published courses to everyone, and everything to admins.
  const { data: courses } = await supabase
    .from("courses")
    .select(
      "id, slug, title, subtitle, track, price_cents, currency, is_published, estimated_hours",
    )
    .order("price_cents", { ascending: false });

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("course_id")
    .eq("user_id", user.id);
  const enrolledIds = new Set((enrollments ?? []).map((e) => e.course_id));

  const courseIds = (courses ?? []).map((c) => c.id);
  const { data: modules } = courseIds.length
    ? await supabase.from("modules").select("course_id").in("course_id", courseIds)
    : { data: [] as { course_id: string }[] };
  const moduleCount = new Map<string, number>();
  for (const m of modules ?? [])
    moduleCount.set(m.course_id, (moduleCount.get(m.course_id) ?? 0) + 1);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Metabolic Coach Academy
        </div>
        <h1 className="mt-2 text-3xl font-bold">Námskeið</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Lærðu Metabolic aðferðafræðina — heimspekina, programming og
          periodization — með verklegum verkefnum í okkar eigin kerfi.
        </p>
      </div>

      {!courses || courses.length === 0 ? (
        <p className="text-muted-foreground">Engin námskeið í boði ennþá.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {courses.map((c) => {
            const enrolled = enrolledIds.has(c.id);
            const mods = moduleCount.get(c.id) ?? 0;
            return (
              <Link
                key={c.id}
                href={`/app/akademia/${c.slug}`}
                className="group flex flex-col rounded-lg border border-border bg-muted p-7 transition hover:border-accent"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs tracking-widest text-accent uppercase">
                    {TRACK_LABEL[c.track] ?? c.track}
                  </span>
                  {enrolled && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground uppercase tracking-wide">
                      Skráð/ur
                    </span>
                  )}
                  {isAdmin && !c.is_published && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Óbirt
                    </span>
                  )}
                </div>
                <h2 className="mt-3 text-2xl font-bold">{c.title}</h2>
                {c.subtitle && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {c.subtitle}
                  </p>
                )}
                <div className="mt-5 flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{mods} modules</span>
                  {c.estimated_hours ? <span>~{c.estimated_hours} klst</span> : null}
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <span className="text-lg font-semibold">
                    {enrolled ? "Halda áfram" : formatPrice(c.price_cents, c.currency)}
                  </span>
                  <span className="text-sm text-accent transition group-hover:translate-x-0.5">
                    {enrolled ? "Opna →" : "Skoða →"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
