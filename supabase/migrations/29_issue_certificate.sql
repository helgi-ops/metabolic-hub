-- Issues (or returns the existing) certificate for a course IF the caller has
-- completed every lesson. SECURITY DEFINER; idempotent per (user, course).
create or replace function public.issue_certificate(p_course uuid)
returns table (
  certificate_number text,
  issued_at timestamptz,
  full_name text,
  course_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_total int;
  v_done int;
  v_num text;
begin
  if v_uid is null then return; end if;

  select count(*) into v_total
  from lessons l join modules m on m.id = l.module_id
  where m.course_id = p_course;

  select count(*) into v_done
  from lessons l
  join modules m on m.id = l.module_id
  join lesson_progress lp
    on lp.lesson_id = l.id and lp.user_id = v_uid and lp.completed_at is not null
  where m.course_id = p_course;

  if v_total = 0 or v_done < v_total then
    return;
  end if;

  v_num := 'MB-' || to_char(now(), 'YYYY') || '-' ||
           upper(substr(md5(v_uid::text || p_course::text), 1, 6));

  insert into certificates (user_id, course_id, certificate_number)
  values (v_uid, p_course, v_num)
  on conflict (user_id, course_id) do nothing;

  return query
  select c.certificate_number, c.issued_at, p.full_name, co.title
  from certificates c
  join profiles p on p.id = c.user_id
  join courses co on co.id = c.course_id
  where c.user_id = v_uid and c.course_id = p_course;
end;
$$;

grant execute on function public.issue_certificate(uuid) to authenticated;
