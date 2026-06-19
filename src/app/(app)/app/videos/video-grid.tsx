"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncVimeoLibrary } from "./actions";

type Video = {
  id: string;
  name: string;
  category: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  link: string | null;
  duration: number | null;
};

function fmt(d: number | null) {
  if (!d) return "";
  const m = Math.floor(d / 60);
  const s = d % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoGrid({
  videos,
  isAdmin,
}: {
  videos: Video[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [active, setActive] = useState<Video | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const categories = useMemo(
    () =>
      [...new Set(videos.map((v) => v.category).filter(Boolean))].sort() as string[],
    [videos],
  );

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return videos.filter(
      (v) =>
        (!cat || v.category === cat) &&
        (!t || v.name.toLowerCase().includes(t)),
    );
  }, [videos, q, cat]);

  function sync() {
    setMsg(null);
    startTransition(async () => {
      const res = await syncVimeoLibrary();
      if (!res.ok) {
        setMsg(res.error ?? "Samstilling mistókst.");
        return;
      }
      setMsg(`Samstillt — ${res.count ?? 0} myndbönd.`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Leita að æfingu…"
          className="w-full max-w-sm rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <span className="text-sm text-muted-foreground">
          {filtered.length} myndbönd
        </span>
        {isAdmin && (
          <button
            onClick={sync}
            disabled={pending}
            className="ml-auto rounded-md border border-border bg-muted px-3 py-2 text-sm hover:border-accent transition disabled:opacity-50"
          >
            {pending ? "Samstilli…" : "↻ Samstilla við Vimeo"}
          </button>
        )}
      </div>
      {categories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setCat("")}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              !cat
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Allir flokkar
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                cat === c
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {msg && <div className="mb-4 text-sm text-muted-foreground">{msg}</div>}

      {videos.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted p-6 text-sm text-muted-foreground">
          Engin myndbönd enn.{" "}
          {isAdmin
            ? "Smelltu á „Samstilla við Vimeo“ til að sækja safnið (þarf VIMEO_ACCESS_TOKEN)."
            : "Þjálfari þarf að samstilla Vimeo-safnið."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <button
              key={v.id}
              onClick={() => v.embed_url && setActive(v)}
              className="group flex flex-col overflow-hidden rounded-lg border border-border bg-muted text-left transition hover:border-accent"
            >
              <div className="relative aspect-video w-full bg-background">
                {v.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.thumbnail_url}
                    alt={v.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl">
                    🎬
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 text-3xl opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                  ▶
                </div>
                {v.duration ? (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                    {fmt(v.duration)}
                  </span>
                ) : null}
              </div>
              <div className="p-3 text-sm font-medium">{v.name}</div>
            </button>
          ))}
        </div>
      )}

      {active?.embed_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setActive(null)}
        >
          <div
            className="w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-white">{active.name}</h2>
              <button
                onClick={() => setActive(null)}
                className="text-sm text-white/70 hover:text-white"
              >
                Loka ✕
              </button>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <iframe
                src={active.embed_url}
                title={active.name}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
