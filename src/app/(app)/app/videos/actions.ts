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

type Project = { uri: string; name: string };

type Row = {
  vimeo_id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  link: string | null;
  duration: number | null;
  category: string | null;
  updated_at: string;
};

// Only folders whose name starts with this prefix are treated as the exercise
// bank; the rest of the Vimeo account (P.L.A.I, WFH, football …) is ignored.
const FOLDER_PREFIX = "Metabolic - ";

const VIMEO_ACCEPT = "application/vnd.vimeo.*+json;version=3.4";

async function vimeoGet(
  path: string,
  token: string,
): Promise<{ ok: true; json: unknown } | { ok: false; status: number }> {
  const res = await fetch(`https://api.vimeo.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: VIMEO_ACCEPT },
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, json: await res.json() };
}

// Pull exercise videos from the "Metabolic - …" Vimeo folders, tagging each
// with its folder name as the category. Admin-only; replaces the bank so it
// always mirrors those folders (adds new, updates changed, removes the rest).
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

  // 1. List folders, keep the "Metabolic - …" ones.
  const folders: Project[] = [];
  let fnext: string | null = "/me/projects?per_page=100&fields=uri,name";
  let guard = 0;
  while (fnext && guard < 30) {
    guard++;
    const r = await vimeoGet(fnext, token);
    if (!r.ok) {
      return {
        ok: false,
        error:
          r.status === 401
            ? "Vimeo hafnaði token (401) — athugaðu lykilinn og scope."
            : `Vimeo API villa (${r.status}).`,
      };
    }
    const j = r.json as { data?: Project[]; paging?: { next?: string | null } };
    for (const p of j.data ?? [])
      if (p.name?.startsWith(FOLDER_PREFIX)) folders.push(p);
    fnext = j.paging?.next ?? null;
  }

  if (!folders.length) {
    return {
      ok: false,
      error: `Engar „${FOLDER_PREFIX}…" möppur fundust á Vimeo.`,
    };
  }

  // 2. Pull each folder's videos, tagged with the folder category.
  const fields =
    "uri,name,description,duration,link,player_embed_url,pictures.sizes";
  const byId = new Map<string, Row>();
  for (const folder of folders) {
    const category = folder.name.slice(FOLDER_PREFIX.length).trim();
    let vnext: string | null = `${folder.uri}/videos?per_page=100&fields=${encodeURIComponent(
      fields,
    )}`;
    let vguard = 0;
    while (vnext && vguard < 30) {
      vguard++;
      const r = await vimeoGet(vnext, token);
      if (!r.ok) return { ok: false, error: `Vimeo API villa (${r.status}).` };
      const j = r.json as {
        data?: VimeoVideo[];
        paging?: { next?: string | null };
      };
      for (const v of j.data ?? []) {
        const vimeoId = v.uri?.split("/").pop() ?? "";
        if (!vimeoId) continue;
        const sizes = v.pictures?.sizes ?? [];
        const thumb =
          (sizes.find((s) => s.width >= 480) ?? sizes[sizes.length - 1])
            ?.link ?? null;
        // A video can sit in two folders — first category wins, stable.
        if (byId.has(vimeoId)) continue;
        byId.set(vimeoId, {
          vimeo_id: vimeoId,
          name: v.name?.trim() || "Án nafns",
          description: v.description,
          thumbnail_url: thumb,
          embed_url: v.player_embed_url,
          link: v.link,
          duration: v.duration,
          category,
          updated_at: new Date().toISOString(),
        });
      }
      vnext = j.paging?.next ?? null;
    }
  }

  const rows = [...byId.values()];
  const admin = createAdminClient();
  if (rows.length) {
    const { error } = await admin
      .from("exercise_videos")
      .upsert(rows, { onConflict: "vimeo_id" });
    if (error) return { ok: false, error: error.message };
    // Drop anything no longer in the Metabolic folders.
    await admin
      .from("exercise_videos")
      .delete()
      .not("vimeo_id", "in", `(${rows.map((r) => r.vimeo_id).join(",")})`);
  }

  revalidatePath("/app/videos");
  return { ok: true, count: rows.length };
}
