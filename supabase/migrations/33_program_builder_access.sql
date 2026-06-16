-- Per-coach Program Builder access. Building weekly plans / OptiSigns is usually
-- run by one "head coach" per station, not everyone. Admins always have access;
-- coaches only when an admin grants them this flag. Default off.

alter table public.profiles
  add column if not exists can_build_programs boolean not null default false;

-- Admin-only setter (coaches can't grant themselves access).
create or replace function public.set_program_builder(member uuid, allowed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change Program Builder access';
  end if;
  update public.profiles set can_build_programs = allowed where id = member;
end;
$$;

revoke all on function public.set_program_builder(uuid, boolean) from public;
grant execute on function public.set_program_builder(uuid, boolean) to authenticated;
