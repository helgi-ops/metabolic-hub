import { requireProgramBuilder } from "@/lib/auth/require-staff";

export const metadata = {
  title: "Æfingasafn · Metabolic",
};

const PATTERN_LABELS: Record<string, string> = {
  squat: "Hnébeygja",
  hinge: "Mjaðmir",
  push: "Pressa",
  pull: "Tog",
  carry: "Burður",
  core: "Core",
  locomotion: "Þol",
  other: "Annað",
};

export default async function LibraryPage() {
  const { supabase } = await requireProgramBuilder();

  const { data: exercises } = await supabase
    .from("exercises")
    .select("id, name_is, category, pattern, video_url, default_unit, description")
    .order("category", { ascending: true })
    .order("name_is", { ascending: true });

  const list = exercises ?? [];
  const patterns = new Set(list.map((e) => e.pattern));

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-12">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Æfingasafn
        </div>
        <h1 className="mt-2 text-3xl font-bold">Hreyfingarbankinn</h1>
        <p className="mt-2 text-muted-foreground">
          {list.length} hreyfimynstur · {patterns.size} flokkar. Hver færsla
          tengir í myndbandasafnið með afbrigðum og leiðréttingum.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted p-8 text-muted-foreground">
          Ekkert í safninu enn.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((ex) => (
            <article
              key={ex.id}
              className="flex flex-col rounded-lg border border-border bg-muted p-6"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs tracking-widest text-accent uppercase">
                  {PATTERN_LABELS[ex.pattern] ?? ex.pattern}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ex.default_unit}
                </span>
              </div>
              <h2 className="mt-3 text-lg font-semibold">{ex.name_is}</h2>
              {ex.category && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {ex.category}
                </div>
              )}
              {ex.description && (
                <p className="mt-3 flex-1 text-sm text-muted-foreground">
                  {ex.description}
                </p>
              )}
              {ex.video_url && (
                <a
                  href={ex.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 text-sm text-accent hover:underline"
                >
                  Horfa á myndbönd →
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
