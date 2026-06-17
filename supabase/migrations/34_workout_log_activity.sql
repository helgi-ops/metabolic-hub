-- Let members log an alternative activity instead of the day's prescribed
-- workout (e.g. "cycled today instead of strength"). Free-text label; the log
-- is not tied to a plan structure in that case.

alter table public.workout_logs
  add column if not exists activity text;
