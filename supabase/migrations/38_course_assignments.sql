-- Applied via MCP as "course_assignments".
-- Practical assignments for Akademía courses: one per lesson, answered in the
-- app. Chapter assignments count as done on submission; the final project
-- (requires_approval) must be approved by an admin before the certificate.
alter table public.assignments
  add column if not exists requires_approval boolean not null default false;

alter table public.assignments
  add constraint assignments_lesson_id_key unique (lesson_id);
alter table public.submissions
  add constraint submissions_assignment_user_key unique (assignment_id, user_id);

-- Learners write submissions only through the server action (service role),
-- which checks enrollment and keeps status/feedback out of their hands. The
-- old own-update policy let a learner set status = 'approved' themselves.
drop policy if exists submissions_insert_own on public.submissions;
drop policy if exists submissions_update_own_unreviewed on public.submissions;

-- issue_certificate: additionally requires every is_required assignment to be
-- submitted, and approved where requires_approval (see migration in MCP log).
create or replace function public.issue_certificate(p_course uuid)
 returns table(certificate_number text, issued_at timestamptz, full_name text, course_title text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_total int;
  v_done int;
  v_missing int;
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

  select count(*) into v_missing
  from assignments a
  join lessons l on l.id = a.lesson_id
  join modules m on m.id = l.module_id
  left join submissions s on s.assignment_id = a.id and s.user_id = v_uid
  where m.course_id = p_course
    and a.is_required
    and (s.id is null or (a.requires_approval and s.status <> 'approved'));

  if v_missing > 0 then
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
$function$;
