import Link from "next/link";
import { WaitlistForm } from "@/components/waitlist-form";

export const metadata = {
  title: "Metabolic Coach Academy — þjálfaranámskeið",
  description:
    "Lærðu Metabolic aðferðafræðina frá grunni: heimspekin, programming, periodization og verkleg verkefni í okkar eigin verkfærum. Vottun fyrir verðandi Metabolic þjálfara.",
};

const TRACKS = [
  {
    tag: "Track 01",
    title: "Metabolic Coach Certification",
    summary:
      "Fyrir verðandi Metabolic þjálfara. 8 modules, ~12 vikur, verkleg verkefni í kerfinu, lokaverkefni og vottun.",
    points: [
      "Heimspekin og MB1/MB2/MB3",
      "Programming + periodization",
      "Coaching cues og scaling í rauntíma",
      "Vottun + leyfi til að nota merkið",
    ],
  },
  {
    tag: "Track 02",
    title: "Foundations of Strength Programming",
    summary:
      "Fyrir styrktarþjálfara, PT-a og sjúkraþjálfara sem vilja læra aðferðafræðina. 5 modules, sjálfshraði.",
    points: [
      "Periodization fyrir alvöru",
      "Sex hreyfimynstur",
      "Aðlögun í rauntíma",
      "Eitt 4ra vikna plan fyrir þinn skjólstæðing",
    ],
  },
];

export default function AcademyPage() {
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
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition"
          >
            Innskráning
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-grid relative">
        <div className="mx-auto max-w-4xl px-6 py-28 sm:py-36 text-center">
          <div className="inline-block rounded-full border border-border bg-muted px-4 py-1 text-xs font-mono tracking-widest text-muted-foreground uppercase mb-8">
            Coming soon · Sumar 2026
          </div>
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight">
            Metabolic
            <br />
            <span className="text-accent">Coach Academy</span>
          </h1>
          <p className="mt-8 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            Þjálfunarkerfið sem hefur verið þróað á Íslandi síðan 2011 — núna sem
            fræðsluvettvangur fyrir þjálfara. Lærðu aðferðafræðina, smíðaðu
            æfingaplön í kerfinu, fáðu vottun.
          </p>
          <div className="mt-12 max-w-md mx-auto">
            <WaitlistForm />
          </div>
          <div className="mt-6 text-xs text-muted-foreground">
            Engin spam. Tilkynning þegar opnað er fyrir skráningu.
          </div>
        </div>
      </section>

      {/* What makes it different */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <div className="font-mono text-xs tracking-widest text-accent uppercase">
            Af hverju Metabolic Academy?
          </div>
          <h2 className="mt-3 text-3xl font-bold">
            Ekki bara fræði — verklegt í okkar eigin kerfi
          </h2>
          <p className="mt-4 text-muted-foreground">
            Þú lærir ekki bara hvernig Metabolic virkar, heldur smíðar alvöru
            æfingavikur í sama Program Builder og við notum, með sömu 750+
            æfingaeiningum. Þú útskrifast tilbúin/n til að þjálfa.
          </p>
        </div>
      </section>

      {/* Tracks */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 grid md:grid-cols-2 gap-8">
          {TRACKS.map((t) => (
            <div
              key={t.tag}
              className="rounded-lg border border-border bg-muted p-8"
            >
              <div className="font-mono text-xs tracking-widest text-accent uppercase">
                {t.tag}
              </div>
              <h2 className="mt-4 text-2xl font-bold">{t.title}</h2>
              <p className="mt-4 text-muted-foreground">{t.summary}</p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                {t.points.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            </div>
          ))}
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
