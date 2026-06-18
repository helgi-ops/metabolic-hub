"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

type VimeoVideo = {
  uri: string;
  name: string | null;
  description: string | null;
  duration: number | null;
  link: string | null;
  player_embed_url: string | null;
  pictures?: { sizes?: { width: number; link: string }[] };
};

// Pull the whole Vimeo library (paginated) and upsert it into exercise_videos.
// Admin-only; writes go through the service-role client so no public write
// policy is needed. Re-running updates existing rows (matched on vimeo_id).
export async function syncVimeoLibrary(): Promise<{
  ok: boolean;
  count?: number;
  error?: string;
}> {
  const { supabase, user } = await requireStaff();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false, error: "Aðeins admin getur samstillt myndbönd." };
  }

  const token = process.env.VIMEO_ACCESS_TOKEN?.trim();
  if (!token) {
    return { ok: false, error: "VIMEO_ACCESS_TOKEN vantar á þjóninn." };
  }

  const fields =
    "uri,name,description,duration,link,player_embed_url,pictures.sizes";
  let next: string | null = `/me/videos?per_page=100&fields=${encodeURIComponent(
    fields,
  )}`;

  const rows: {
    vimeo_id: string;
    name: string;
    description: string | null;
    thumbnail_url: string | null;
    embed_url: string | null;
    link: string | null;
    duration: number | null;
    updated_at: string;
  }[] = [];

  let guard = 0;
  while (next && guard < 60) {
    guard++;
    const res = await fetch(`https://api.vimeo.com${next}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 401
            ? "Vimeo hafnaði token (401) — athugaðu lykilinn og scope."
            : `Vimeo API villa (${res.status}).`,
      };
    }
    const json = (await res.json()) as {
      data?: VimeoVideo[];
      paging?: { next?: string | null };
    };
    for (const v of json.data ?? []) {
      const vimeoId = v.uri?.split("/").pop() ?? "";
      if (!vimeoId) continue;
      const sizes = v.pictures?.sizes ?? [];
      const thumb =
        (sizes.find((s) => s.width >= 480) ?? sizes[sizes.length - 1])?.link ??
        null;
      rows.push({
        vimeo_id: vimeoId,
        name: v.name?.trim() || "Án nafns",
        description: v.description,
        thumbnail_url: thumb,
        embed_url: v.player_embed_url,
        link: v.link,
        duration: v.duration,
        updated_at: new Date().toISOString(),
      });
    }
    next = json.paging?.next ?? null;
  }

  if (rows.length) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("exercise_videos")
      .upsert(rows, { onConflict: "vimeo_id" });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/app/videos");
  return { ok: true, count: rows.length };
}
