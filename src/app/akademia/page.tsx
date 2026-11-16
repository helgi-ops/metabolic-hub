import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/format";
import { CourseRegistrationForm } from "./registration-form";

export const metadata = {
  title: "Metabolic þjálfaranámskeið — netnámskeið með vottun",
  description:
    "Lærðu Metabolic aðferðafræðina á netinu, á þínum hraða: 14 kaflar, myndbönd og lesefni á íslensku og ensku, verkleg verkefni, lokaverkefni og skírteini.",
};

// Course facts (price, curriculum, counts) come live from the database so this
// page never drifts from the course itself. Refreshed at most hourly.
export const revalidate = 3600;

const COURSE_SLUG = "metabolic-coach";

type Curriculum = {
  price: string;
  modules: { position: number; title: string; lessons: number; assignments: number; final: boolean }[];
  lessonCount: number;
  videoCount: number;
  assignmentCount: number;
};

async function loadCurriculum(): Promise<Curriculum | null> {
  try {
    const admin = createAdminClient();
    const { data: course } = await admin
      .from("courses")
      .select("id, price_cents, currency")
      .eq("slug", COURSE_SLUG)
      .maybeSingle();
    if (!course) return null;
    const { data: mods } = await admin
      .from("modules")
      .select("id, position, title, title_is")
      .eq("course_id", course.id)
      .order("position");
    const modIds = (mods ?? []).map((m) => m.id);
    const { data: allLessons } = modIds.length
      ? await admin.from("lessons").select("id, module_id, video_url").in("module_id", modIds)
      : { data: [] as { id: string; module_id: string; video_url: string | null }[] };
    const { data: assignments } = allLessons?.length
      ? await admin
          .from("assignments")
          .select("lesson_id, requires_approval")
          .in("lesson_id", allLessons.map((l) => l.id))
      : { data: [] as { lesson_id: string; requires_approval: boolean }[] };
    const assignmentLesson = new Map((assignments ?? []).map((a) => [a.lesson_id, a]));
    // Assignment lessons are counted as assignments, not as reading lessons.
    const lessons = (allLessons ?? []).filter((l) => !assignmentLesson.has(l.id));
    const perModule = new Map<string, number>();
    for (const l of lessons) perModule.set(l.module_id, (perModule.get(l.module_id) ?? 0) + 1);
    const assignPerModule = new Map<string, number>();
    const finalModule = new Set<string>();
    for (const l of allLessons ?? []) {
      const a = assignmentLesson.get(l.id);
      if (!a) continue;
      if (a.requires_approval) finalModule.add(l.module_id);
      else assignPerModule.set(l.module_id, (assignPerModule.get(l.module_id) ?? 0) + 1);
    }
    return {
      price: formatPrice(course.price_cents, course.currency),
      modules: (mods ?? []).map((m) => ({
        position: m.position,
        title: m.title_is || m.title,
        lessons: perModule.get(m.id) ?? 0,
        assignments: assignPerModule.get(m.id) ?? 0,
        final: finalModule.has(m.id),
      })),
      lessonCount: lessons.length,
      videoCount: lessons.filter((l) => !!l.video_url).length,
      assignmentCount: assignments?.length ?? 0,
    };
  } catch (e) {
    console.error("akademia: could not load curriculum", e);
    return null;
  }
}

const BENEFITS = [
  {
    icon: "💻",
    title: "Alfarið á netinu",
    text: "Lærðu þegar þér hentar, í tölvu eða síma. Framvindan vistast og þú heldur áfram þar sem frá var horfið.",
  },
  {
    icon: "🎬",
    title: "Myndbönd + lesefni",
    text: "Hver lexía er með ítarlegu lesefni og stór hluti með myndbandi sem fer yfir efnið.",
  },
  {
    icon: "🇮🇸",
    title: "Á íslensku og ensku",
    text: "Allt lesefni er til á báðum tungumálum — þú skiptir á milli með einum smelli.",
  },
  {
    icon: "🛠️",
    title: "Verklegt, ekki bara fræði",
    text: "Hverjum kafla lýkur á verklegu verkefni: raunhæfar aðstæður úr hóptíma sem þú leysir og skilar í kerfinu. Þjálfari getur gefið þér endurgjöf.",
  },
  {
    icon: "🎓",
    title: "Lokaverkefni og skírteini",
    text: "Í lokin setur þú saman heila æfingaviku fyrir eitt MB-stig og rökstyður hana. Yfirþjálfari fer yfir verkefnið og þegar það er samþykkt sækirðu skírteinið.",
  },
  {
    icon: "📈",
    title: "Reynsla síðan 2011",
    text: "Kerfið hefur verið þróað og prófað í hópþjálfun á Íslandi í meira en áratug.",
  },
];

const AUDIENCE = [
  "Verðandi Metabolic þjálfara sem vilja kenna í Metabolic stöð",
  "Einkaþjálfara og hópþjálfara sem vilja traustan ramma fyrir sína tíma",
  "Styrktarþjálfara og sjúkraþjálfara sem vilja skilja orkukerfin og programming",
  "Alla sem vilja dýpri skilning á því hvernig góð þjálfun er byggð upp",
];

const STEPS = [
  { n: "1", title: "Skráðu þig", text: "Fylltu út formið hér að neðan — tekur innan við mínútu." },
  { n: "2", title: "Greiðsluseðill", text: "Þú færð greiðsluseðil í heimabankann þinn." },
  { n: "3", title: "Byrjaðu", text: "Þegar hann er greiddur færðu tölvupóst með aðgangi og byrjar strax." },
];

const FAQ = [
  {
    q: "Hvernig greiði ég fyrir námskeiðið?",
    a: "Með greiðsluseðli í heimabanka. Þú skráir þig hér á síðunni, við sendum seðilinn og opnum aðganginn um leið og hann er greiddur.",
  },
  {
    q: "Hvenær get ég byrjað?",
    a: "Strax og aðgangurinn er opnaður. Námskeiðið er ekki bundið við ákveðnar dagsetningar — þú ferð í gegnum það á þínum hraða. Það er hannað fyrir um 12 vikur.",
  },
  {
    q: "Er námskeiðið á íslensku?",
    a: "Já. Allt lesefni er bæði á íslensku og ensku og þú velur tungumálið. Myndböndin eru á ensku.",
  },
  {
    q: "Fæ ég skírteini?",
    a: "Já. Þegar þú hefur lokið öllum lexíum og verkefnum og yfirþjálfari hefur samþykkt lokaverkefnið þitt sækirðu skírteini (PDF) beint úr kerfinu.",
  },
  {
    q: "Ég er nú þegar með aðgang að Metabolic appinu — þarf ég nýjan?",
    a: "Nei. Skráðu þig með sama netfangi og þú notar í appinu og námskeiðið bætist við aðganginn þinn.",
  },
];

export default async function AcademyPage() {
  const cur = await loadCurriculum();
  const price = cur?.price ?? "49.990 kr";
  const stats = [
    { value: String(cur?.modules.length || 14), label: "kaflar" },
    { value: String(cur?.lessonCount || 101), label: "lexíur" },
    { value: cur?.videoCount ? `${cur.videoCount}` : "50+", label: "myndbönd" },
    cur?.assignmentCount
      ? { value: String(cur.assignmentCount), label: "verkleg verkefni" }
      : { value: "~12", label: "vikur á eigin hraða" },
  ];

  return (
    <main className="flex-1">
      {/* Top nav */}
      <nav className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="font-mono text-sm tracking-widest uppercase hover:text-accent transition"
          >
            ← Metabolic
          </Link>
          <div className="flex items-center gap-5">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Innskráning
            </Link>
            <a
              href="#skraning"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
            >
              Skrá mig
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-grid relative">
        <div className="mx-auto max-w-4xl px-6 py-20 sm:py-28 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1 text-xs font-mono tracking-widest text-accent uppercase mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Netnámskeið · Opið fyrir skráningu
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">
            Metabolic
            <br />
            <span className="text-accent">þjálfaranámskeið</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            Lærðu aðferðafræðina á bak við Metabolic — orkukerfin, æfingakerfin,
            programming og þjálfun í rauntíma. Alfarið á netinu, á þínum hraða,
            og lýkur með lokaverkefni og skírteini.
          </p>

          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-muted px-4 py-4">
                <div className="text-3xl font-bold">{s.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#skraning"
              className="rounded-md bg-accent px-8 py-3.5 text-sm font-semibold text-accent-foreground hover:opacity-90 transition"
            >
              Skrá mig — {price}
            </a>
            <a
              href="#namsskra"
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Sjá námsskrána ↓
            </a>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center">
            <div className="font-mono text-xs tracking-widest text-accent uppercase">
              Hvað færðu?
            </div>
            <h2 className="mt-3 text-3xl font-bold">Allt sem þú þarft til að þjálfa eftir Metabolic</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-lg border border-border bg-muted p-6">
                <div className="text-2xl" aria-hidden="true">{b.icon}</div>
                <h3 className="mt-3 font-semibold">{b.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <div className="font-mono text-xs tracking-widest text-accent uppercase text-center">
            Fyrir hverja?
          </div>
          <h2 className="mt-3 text-3xl font-bold text-center">Námskeiðið er fyrir…</h2>
          <ul className="mt-10 space-y-3">
            {AUDIENCE.map((a) => (
              <li key={a} className="flex gap-3 rounded-lg border border-border bg-muted px-5 py-4">
                <span className="text-accent font-bold">✓</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Curriculum */}
      {cur && cur.modules.length > 0 && (
        <section id="namsskra" className="border-t border-border scroll-mt-8">
          <div className="mx-auto max-w-4xl px-6 py-20">
            <div className="text-center">
              <div className="font-mono text-xs tracking-widest text-accent uppercase">
                Námsskrá
              </div>
              <h2 className="mt-3 text-3xl font-bold">
                {cur.modules.length} kaflar · {cur.lessonCount} lexíur
              </h2>
            </div>
            <ol className="mt-10 grid gap-3 sm:grid-cols-2">
              {cur.modules.map((m) => (
                <li
                  key={m.position}
                  className="flex items-start gap-4 rounded-lg border border-border bg-muted px-5 py-4"
                >
                  <span className="font-mono text-sm text-accent tabular-nums w-6 shrink-0">
                    {String(m.position).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium leading-snug">{m.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {m.lessons} {m.lessons === 1 ? "lexía" : "lexíur"}
                      {m.assignments > 0 && " + verkefni"}
                      {m.final && " + lokaverkefni"}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Registration */}
      <section id="skraning" className="border-t border-border bg-grid scroll-mt-8">
        <div className="mx-auto max-w-5xl px-6 py-20 grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <div className="font-mono text-xs tracking-widest text-accent uppercase">
              Skráning
            </div>
            <h2 className="mt-3 text-3xl font-bold">Tryggðu þér pláss</h2>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-4xl font-bold">{price}</span>
              <span className="text-sm text-muted-foreground">eitt verð · allt innifalið</span>
            </div>
            <ol className="mt-10 space-y-5">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent text-sm font-semibold text-accent">
                    {s.n}
                  </span>
                  <div>
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-sm text-muted-foreground">{s.text}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative rounded-xl border border-border bg-muted p-6 sm:p-8">
            <CourseRegistrationForm courseSlug={COURSE_SLUG} price={price} />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-3xl font-bold text-center">Algengar spurningar</h2>
          <div className="mt-10 divide-y divide-border rounded-lg border border-border bg-muted">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span className="text-muted-foreground transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-10 text-center">
            <a
              href="#skraning"
              className="inline-block rounded-md bg-accent px-8 py-3.5 text-sm font-semibold text-accent-foreground hover:opacity-90 transition"
            >
              Skrá mig á námskeiðið →
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 flex items-center justify-between text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} Metabolic — Helgasport ehf.</div>
          <Link href="/" className="font-mono hover:text-foreground transition">
            metabolic.is
          </Link>
        </div>
      </footer>
    </main>
  );
}
