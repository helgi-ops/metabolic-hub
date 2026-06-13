import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LessonEditor } from "./lesson-editor";

export const metadata = { title: "Breyta lexíu · Akademía" };

export default async function EditLessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;
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
  // Course authoring is admin-only.
  if (profile?.role !== "admin") redirect(`/app/akademia/${slug}/${lessonId}`);

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, module_id, title, video_url, image_urls, body_markdown")
    .eq("id", lessonId)
    .single();
  if (!lesson) notFound();

  const { data: mod } = await supabase
    .from("modules")
    .select("position")
    .eq("id", lesson.module_id)
    .single();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href={`/app/akademia/${slug}/${lessonId}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Til baka í lexíuna
      </Link>
      <div className="mt-4 mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Breyta lexíu
        </div>
        <h1 className="mt-2 text-2xl font-bold">{lesson.title}</h1>
      </div>

      <LessonEditor
        lessonId={lesson.id}
        modulePosition={mod?.position ?? 0}
        initial={{
          title: lesson.title,
          video_url: lesson.video_url,
          image_urls: lesson.image_urls ?? [],
          body_markdown: lesson.body_markdown,
        }}
      />
    </main>
  );
}
