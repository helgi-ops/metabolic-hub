-- Migration 13: Program Builder structure catalog
-- Applied to project wphmeryxmfdxovvnichm on 2026-06-12.
-- Source: 752 workout structures extracted from mb-program-builder.netlify.app
-- (the `structureCatalog` array). Data lives in supabase/data/structures.json;
-- import with supabase/data/import-structures.cjs (signs in as an admin and
-- bulk-upserts via the authenticated client).

create table if not exists public.structures (
  id uuid primary key default gen_random_uuid(),
  source_id text unique not null,         -- original builder id, e.g. "base-burn-l1"
  name text not null,                     -- display name, e.g. "Base Burn L1"
  category public.program_category not null,
  group_key text,                         -- variation family, e.g. "base-burn"
  levels jsonb not null default '{}'::jsonb,  -- { l1, l2, l3 } display labels
  preview text not null,                  -- full session prescription (Icelandic)
  created_at timestamptz not null default now()
);

alter table public.structures enable row level security;

-- Catalog content: any signed-in user can read; only coaches/admins can write.
create policy structures_read on public.structures
  for select to authenticated using (true);

create policy structures_write on public.structures
  for all to authenticated
  using (public.is_coach_or_admin())
  with check (public.is_coach_or_admin());

create index structures_category_idx on public.structures (category);
create index structures_group_idx on public.structures (group_key);

-- Fix: migration 12 (revoke_public_execute) revoked EXECUTE on the RLS helper
-- functions from `authenticated`, which breaks every admin/coach-gated policy
-- (the role can't call the function the policy checks). Re-grant — the functions
-- are SECURITY DEFINER so they still run with the owner's privileges.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_coach_or_admin() to authenticated;
grant execute on function public.is_enrolled_in(uuid) to authenticated;
grant execute on function public.current_user_role() to authenticated;
