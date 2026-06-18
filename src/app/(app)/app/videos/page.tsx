import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VideoGrid } from "./video-grid";

export const metadata = { title: "Æfingabanki · Metabolic" };

export default async function VideosPage() {
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

  const { data: videos } = await supabase
    .from("exercise_videos")
    .select("id, name, thumbnail_url, embed_url, link, duration")
    .order("name", { ascending: true });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Æfingabanki
        </div>
        <h1 className="mt-2 text-3xl font-bold">Æfingamyndbönd</h1>
        <p className="mt-2 text-muted-foreground">
          Myndbönd af einstökum æfingum — leitaðu og spilaðu til að sjá rétta
          tækni.
        </p>
      </div>

      <VideoGrid videos={videos ?? []} isAdmin={isAdmin} />
    </main>
  );
}
