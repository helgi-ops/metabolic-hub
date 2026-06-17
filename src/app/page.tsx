import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Metabolic — þjálfunarkerfið þróað á Íslandi síðan 2011",
  description:
    "Metabolic er hópþjálfunarkerfi sem sameinar kraft, styrk, þol og brennslu á þremur stigum (MB1, MB2, MB3). Æfðu á einni af stöðvunum okkar.",
};

const PILLARS = [
  {
    title: "Kraftur & styrkur",
    body: "Power og strength í hverri viku — frá hraða og sprengikrafti yfir í hreinan styrk.",
  },
  {
    title: "Þol",
    body: "Markviss þolvinna með stýrðum vinnu- og hvíldartíma sem byggir upp úthald.",
  },
  {
    title: "Brennsla",
    body: "Work capacity dagar sem hækka brennslu og þol undir álagi.",
  },
  {
    title: "Markviss uppbygging",
    body: "Periodization — vikurnar byggja hver á annarri svo þú heldur áfram að bæta þig.",
  },
];

const LEVELS = [
  { tag: "MB1", title: "Grunnur", body: "Fyrir þá sem eru að byrja eða vilja styrkja grunninn. Tækni og uppbygging í fyrirrúmi.", img: "/level-mb1.jpg" },
  { tag: "MB2", title: "Lengra komnir", body: "Meira álag og flóknari uppsetningar fyrir þá sem hafa náð grunntækni.", img: "/level-mb2.jpg" },
  { tag: "MB3", title: "Krefjandi", body: "Hámarks álag og afkastageta fyrir vana iðkendur sem vilja meira.", img: "/level-mb3.jpg" },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: stations } = await supabase
    .from("stations")
    .select("id, slug, name, city")
    .order("name", { ascending: true });

  return (
    <main className="flex-1">
      {/* Top nav */}
      <nav className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="font-mono text-sm tracking-widest uppercase">
            Metabolic
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link
              href="/akademia"
              className="text-muted-foreground hover:text-foreground transition"
            >
              Þjálfaranámskeið
            </Link>
            <Link
              href="/login"
              className="rounded-md bg-accent px-4 py-1.5 font-medium text-accent-foreground hover:opacity-90 transition"
            >
              Innskráning
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background photo + dark overlay for legible text */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/hero-metabolic.jpg)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
        <div className="relative mx-auto max-w-4xl px-6 py-28 sm:py-36 text-center">
          <div className="inline-block rounded-full border border-border bg-muted px-4 py-1 text-xs font-mono tracking-widest text-muted-foreground uppercase mb-8">
            Þróað á Íslandi síðan 2011
          </div>
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight">
            Þetta er <span className="text-accent">Metabolic</span>
          </h1>
          <p className="mt-8 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            Hópþjálfunarkerfi sem sameinar kraft, styrk, þol og brennslu í eina
            heild — á þremur stigum svo allir finna sitt. Markviss uppbygging,
            alvöru árangur.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-md bg-accent px-6 py-3 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
            >
              Innskráning iðkenda
            </Link>
            <a
              href="#stodvar"
              className="rounded-md border border-border px-6 py-3 text-sm text-muted-foreground hover:text-foreground transition"
            >
              Sjá stöðvarnar
            </a>
          </div>
        </div>
      </section>

      {/* What is Metabolic */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="font-mono text-xs tracking-widest text-accent uppercase">
            Hvað er Metabolic?
          </div>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold">
            Eitt kerfi sem þjálfar allan líkamann
          </h2>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Metabolic byggir á yfir áratug af þróun á Íslandi. Hver vika blandar
            saman kraft- og styrktarvinnu, þoli og brennslu eftir markvissri
            uppbyggingu — svo þú færð fjölbreytta og árangursríka þjálfun í hvert
            sinn sem þú mætir.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p) => (
              <div
                key={p.title}
                className="rounded-lg border border-border bg-muted p-6"
              >
                <h3 className="font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Levels */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="font-mono text-xs tracking-widest text-accent uppercase">
            Þrjú stig
          </div>
          <h2 className="mt-3 text-3xl font-bold">MB1 · MB2 · MB3</h2>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Sama æfing, þrjár útgáfur. Hvert stig er aðlagað að getu þinni svo þú
            æfir á réttu álagi — hvort sem þú ert að byrja eða lengra kominn.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {LEVELS.map((l) => (
              <div
                key={l.tag}
                className="overflow-hidden rounded-lg border border-border bg-muted"
              >
                <div
                  className="h-40 bg-cover bg-center"
                  style={{ backgroundImage: `url(${l.img})` }}
                />
                <div className="p-6">
                  <div className="font-mono text-xs tracking-widest text-accent">
                    {l.tag}
                  </div>
                  <h3 className="mt-3 text-xl font-bold">{l.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{l.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stations */}
      <section id="stodvar" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="font-mono text-xs tracking-widest text-accent uppercase">
            Stöðvarnar
          </div>
          <h2 className="mt-3 text-3xl font-bold">Æfðu hjá Metabolic</h2>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Metabolic er á fjórum stöðum á Íslandi. Ert þú þegar iðkandi?{" "}
            <span className="text-foreground">
              Skráðu þig inn með einni innskráningu
            </span>{" "}
            — kerfið veit á hvaða stöð þú æfir og opnar þitt svæði.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(stations ?? []).map((s) => (
              <Link
                key={s.id}
                href={`/stod/${s.slug}`}
                className="group rounded-lg border border-border bg-muted p-6 transition hover:border-accent"
              >
                <h3 className="font-semibold">{s.name}</h3>
                {s.city && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    {s.city}
                  </div>
                )}
                <div className="mt-3 text-sm text-accent opacity-0 transition group-hover:opacity-100">
                  Tímatafla &amp; staðsetning →
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-8">
            <Link
              href="/login"
              className="rounded-md bg-accent px-6 py-3 text-sm font-medium text-accent-foreground hover:opacity-90 transition"
            >
              Innskráning iðkenda →
            </Link>
          </div>
        </div>
      </section>

      {/* Coach academy teaser */}
      <section className="relative overflow-hidden border-t border-border">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/metabolic-community.jpg)" }}
        />
        <div className="absolute inset-0 bg-background/80" />
        <div className="relative mx-auto max-w-6xl px-6 py-16 flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="font-mono text-xs tracking-widest text-accent uppercase">
              Fyrir þjálfara
            </div>
            <h2 className="mt-3 text-2xl font-bold">
              Lærðu Metabolic aðferðafræðina
            </h2>
            <p className="mt-2 text-muted-foreground">
              Metabolic Coach Academy kennir þér kerfið frá grunni — heimspekina,
              programming og verkleg verkefni í okkar eigin verkfærum.
            </p>
          </div>
          <Link
            href="/akademia"
            className="shrink-0 rounded-md border border-accent px-6 py-3 text-sm font-medium text-accent hover:bg-accent hover:text-accent-foreground transition"
          >
            Skoða þjálfaranámskeiðið →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 flex items-center justify-between text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} Metabolic — Helgasport ehf.</div>
          <div className="font-mono">metabolic.is</div>
        </div>
      </footer>
    </main>
  );
}
