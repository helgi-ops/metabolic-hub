-- Migration 19: three signature timed Metabolic workouts added to Personal Best.
-- Record the time to finish — lower is better (higher_is_better=false). Stored in
-- seconds (unit 'sek'); the UI formats/parses as mm:ss (src/lib/format.ts).
-- Applied 2026-06-12.
insert into public.benchmarks (slug, name, category, unit, higher_is_better, position) values
  ('barbarian',          'Barbarian (tími)',          'timataka', 'sek', false, 130),
  ('crazy-twins',        'Crazy Twins (tími)',        'timataka', 'sek', false, 140),
  ('ultimate-barbarian', 'Ultimate Barbarian (tími)', 'timataka', 'sek', false, 150);
