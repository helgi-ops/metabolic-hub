"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "course-media";

function slugify(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "file"}${ext}`;
}

export function LessonEditor({
  lessonId,
  modulePosition,
  initial,
}: {
  lessonId: string;
  modulePosition: number;
  initial: {
    title: string;
    video_url: string | null;
    image_urls: string[];
    body_markdown: string | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [videoUrl, setVideoUrl] = useState(initial.video_url ?? "");
  const [body, setBody] = useState(initial.body_markdown ?? "");
  const [images, setImages] = useState<string[]>(initial.image_urls ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const supabase = createClient();
  const folder = `metabolic-coach/module-${modulePosition}/uploads`;

  async function upload(file: File): Promise<string | null> {
    const path = `${folder}/${crypto.randomUUID()}-${slugify(file.name)}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) {
      setError(error.message);
      return null;
    }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function onVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy("video");
    const url = await upload(file);
    setBusy(null);
    if (url) setVideoUrl(url);
    e.target.value = "";
  }

  async function onImageFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError(null);
    setBusy("images");
    const urls: string[] = [];
    for (const f of files) {
      const u = await upload(f);
      if (u) urls.push(u);
    }
    setBusy(null);
    setImages((prev) => [...prev, ...urls]);
    e.target.value = "";
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const { error } = await supabase
        .from("lessons")
        .update({
          video_url: videoUrl.trim() || null,
          body_markdown: body.trim() || null,
          image_urls: images,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lessonId);
      if (error) {
        setError(error.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  const label = "block text-sm font-medium mb-2";
  const input =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="space-y-8">
      {/* Video */}
      <section>
        <h2 className="text-lg font-semibold">Myndband</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Límdu YouTube/Vimeo-slóð (mælt með fyrir stór myndbönd) eða hladdu upp
          skrá.
        </p>
        <div className="mt-3">
          <label className={label}>Myndbands-slóð</label>
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtu.be/…  eða  https://vimeo.com/…"
            className={input}
          />
        </div>
        <div className="mt-3">
          <label className={label}>…eða hlaða upp skrá</label>
          <input
            type="file"
            accept="video/*"
            onChange={onVideoFile}
            disabled={busy === "video"}
            className="text-sm text-muted-foreground"
          />
          {busy === "video" && (
            <span className="ml-2 text-xs text-accent">Hleð upp…</span>
          )}
        </div>
      </section>

      {/* Images */}
      <section>
        <h2 className="text-lg font-semibold">Myndir</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Skýringarmyndir sem birtast undir textanum.
        </p>
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((src, i) => (
              <div key={src} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className="aspect-video w-full rounded-md border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded bg-background/90 px-2 py-0.5 text-xs text-red-400 hover:bg-background"
                >
                  Fjarlægja
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onImageFiles}
            disabled={busy === "images"}
            className="text-sm text-muted-foreground"
          />
          {busy === "images" && (
            <span className="ml-2 text-xs text-accent">Hleð upp…</span>
          )}
        </div>
      </section>

      {/* Body */}
      <section>
        <h2 className="text-lg font-semibold">Texti (Markdown)</h2>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className={`${input} mt-3 font-mono text-xs leading-relaxed`}
        />
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3 border-t border-border pt-5">
        <button
          onClick={save}
          disabled={pending || !!busy}
          className="rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
        >
          {pending ? "Vista…" : "Vista breytingar"}
        </button>
        {saved && <span className="text-sm text-accent">✓ Vistað</span>}
      </div>
    </div>
  );
}
