import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatKennitala } from "@/lib/kennitala";
import { formatPrice } from "@/lib/format";
import { RegistrationActions } from "./row-actions";

export const metadata = { title: "Skráningar · Akademía" };

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "Ný", cls: "border-amber-400/50 text-amber-400" },
  invoiced: { label: "Seðill sendur", cls: "border-sky-400/50 text-sky-400" },
  enrolled: { label: "Aðgangur opinn", cls: "border-accent/50 text-accent" },
  cancelled: { label: "Hætt við", cls: "border-border text-muted-foreground" },
};

export default async function CourseRegistrationsPage({
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
  // Registrations hold kennitala — admin-only (RLS enforces it too).
  if (profile?.role !== "admin") redirect(`/app/akademia/${slug}`);

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, title_is, price_cents, currency")
    .eq("slug", slug)
    .single();
  if (!course) notFound();

  const { data: regs } = await supabase
    .from("course_registrations")
    .select("id, full_name, email, phone, kennitala, status, created_at, enrolled_at")
    .eq("course_id", course.id)
    .order("created_at", { ascending: false });

  const rows = regs ?? [];
  const open = rows.filter((r) => r.status === "new" || r.status === "invoiced").length;
  const enrolled = rows.filter((r) => r.status === "enrolled").length;
  const date = (s: string) =>
    new Date(s).toLocaleDateString("is-IS", {
      timeZone: "Atlantic/Reykjavik",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link
        href={`/app/akademia/${slug}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {course.title_is || course.title}
      </Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs tracking-widest text-accent uppercase">
            Skráningar af metabolic.is/akademia
          </div>
          <h1 className="mt-2 text-3xl font-bold">Skráningar</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {open} bíða greiðslu · {enrolled} með aðgang · verð{" "}
            {formatPrice(course.price_cents, course.currency)}
          </p>
        </div>
        <a
          href="/akademia"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
        >
          Opna sölusíðuna ↗
        </a>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
        Ferlið: stofnaðu greiðsluseðil í heimabanka (merktu „Seðill sendur“). Þegar hann er
        greiddur ýtirðu á <strong className="text-foreground">Greitt — opna aðgang</strong>: þá er
        aðgangur stofnaður (eða námskeiðinu bætt við núverandi aðgang) og viðkomandi fær
        tölvupóst með innskráningu.
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 text-muted-foreground">Engar skráningar ennþá.</p>
      ) : (
        <ul className="mt-8 divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => {
            const st = STATUS[r.status] ?? STATUS.new;
            return (
              <li
                key={r.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.full_name}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    kt. {formatKennitala(r.kennitala)} · {r.email}
                    {r.phone ? ` · ${r.phone}` : ""}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Skráð {date(r.created_at)}
                    {r.enrolled_at ? ` · aðgangur opnaður ${date(r.enrolled_at)}` : ""}
                  </div>
                </div>
                <RegistrationActions id={r.id} status={r.status} name={r.full_name} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
