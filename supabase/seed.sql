-- Metabolic Hub — seed data
-- Applied to Supabase project wphmeryxmfdxovvnichm on 2026-06-12.
-- Source: course structure from ../../metabolic-hub-plan.md (section 3).
-- Re-runnable on an empty DB. Inserts the two course tracks, their modules,
-- and one intro lesson per module. Prices are in whole ISK (Stripe treats ISK
-- as zero-decimal, so price_cents holds the krona amount directly).

begin;

-- 1) Two course tracks
insert into courses (slug, title, subtitle, description, track, price_cents, currency, estimated_hours, is_published)
values
 ('metabolic-coach', 'Metabolic Coach Certification',
  'Fyrir verdandi Metabolic thjalfara',
  'Fyrir verdandi Metabolic thjalfara sem aetla ad kenna i eigin studio eda undir Metabolic merki. 8 modules, ~12 vikur, verkleg verkefni i kerfinu, lokaverkefni og vottun.',
  'metabolic_coach', 249000, 'ISK', 40, false),
 ('foundations', 'Foundations of Strength Programming',
  'Fyrir styrktarthjalfara, sjukrathjalfara og PT-a',
  'Laerdu Metabolic adferdafraedina an thess ad gerast Metabolic thjalfari. 5 modules, sjalfshradi, eitt 4ra vikna plan fyrir eigin vidskiptavin.',
  'foundations', 49000, 'ISK', 12, false);

-- 2) Modules
insert into modules (course_id, position, title, description)
select c.id, v.position, v.title, v.description
from courses c
join (values
  ('metabolic-coach', 1, 'Heimspekin',        'Saga Metabolic, hvers vegna MB1/MB2/MB3, og hverjir saekja timana.'),
  ('metabolic-coach', 2, 'Hreyfingarbankinn',  'Allar aefingar med myndbandi, regression og progression fyrir hverja hreyfingu.'),
  ('metabolic-coach', 3, 'Programming I',      'Struktur a einum tima: warm-up, bulk og finisher.'),
  ('metabolic-coach', 4, 'Programming II',     'Periodization, 4ra vikna cyclar og hvernig MB1 verdur ad MB2.'),
  ('metabolic-coach', 5, 'Vikuplanning',       'Hvernig 6 timar i viku falla saman i heildstaeda viku.'),
  ('metabolic-coach', 6, 'Coaching cues',      'Malfar, raddstyrkur, lagfaeringar og scaling i rauntima.'),
  ('metabolic-coach', 7, 'Reksturinn',         'Verdlagning, namsfrihelgar, retention og onboarding nyrra kennara.'),
  ('metabolic-coach', 8, 'Lokaverkefni',       'Semja heila aefingaviku fyrir nytt studio og kynna hana live.'),
  ('foundations',     1, 'Hvers vegna periodization virkar', 'Visindin a bak vid periodization og hvers vegna hun skilar arangri.'),
  ('foundations',     2, 'Movement patterns',  'Sex storu hreyfimynstrin og hvernig thau mynda grunninn.'),
  ('foundations',     3, 'Programming basics', 'Hvernig a ad rada saman einum tima fra grunni.'),
  ('foundations',     4, 'Adjusting on the fly','Hvernig a ad adlaga aefingu fyrir mismunandi einstaklinga.'),
  ('foundations',     5, 'Putting it together','Settu saman eitt 4ra vikna plan fyrir thinn eigin vidskiptavin.')
) as v(slug, position, title, description) on v.slug = c.slug;

-- 3) One intro lesson per module (free preview on the first module of each track)
insert into lessons (module_id, position, title, body_markdown, is_free_preview)
select m.id, 1, 'Inngangur: ' || m.title, m.description, (m.position = 1)
from modules m;

-- 4) Exercise library — movement-pattern families from ../../Metabolic Æfingabanki.docx.
--    video_url points at the per-family Vimeo folder. Individual variations can be
--    expanded later from the Exercise Library PDFs / Program Builder structures.
insert into exercises (name_is, category, pattern, video_url, default_unit, description) values
('Mjaðmaréttur',         'Mjaðmir',        'hinge',      'https://vimeo.com/user/16731185/folder/1762659', 'reps',     'Mjaðmaréttur — grunn hinge hreyfing.'),
('Stífur og Swing',      'Mjaðmir',        'hinge',      'https://vimeo.com/user/16731185/folder/1764870', 'reps',     'Stífur réttstöðulyfta og kettlebell swing.'),
('Hnébeygjur',           'Framan á læri',  'squat',      'https://vimeo.com/user/16731185/folder/1761465', 'reps',     'Hnébeygju-afbrigði.'),
('Afturstig / Framstig', 'Framan á læri',  'squat',      'https://vimeo.com/user/16731185/folder/1764863', 'reps',     'Útfall aftur og fram (lunges).'),
('Armbeygjur',           'Lárétt pressa',  'push',       'https://vimeo.com/user/16731185/folder/1761530', 'reps',     'Lárétt pressa — armbeygjur og afbrigði.'),
('Róður',                'Lárétt tog',     'pull',       'https://vimeo.com/user/16731185/folder/1761553', 'reps',     'Lárétt tog — róðrarafbrigði.'),
('Axlapressa',           'Lóðrétt pressa', 'push',       'https://vimeo.com/user/16731185/folder/1761563', 'reps',     'Lóðrétt pressa yfir höfuð.'),
('Þolæfingar',           'Þol',            'locomotion', 'https://vimeo.com/user/16731185/folder/1764931', 'calories', 'Þolæfingar á tækjum og í hreyfingu.'),
('Burpees',              'Þol',            'locomotion', 'https://vimeo.com/user/16731185/folder/1765156', 'reps',     'Burpee-afbrigði.'),
('Coreæfingar',          'Core',           'core',       'https://vimeo.com/user/16731185/folder/1764953', 'seconds',  'Kviður og miðja.'),
('Power Slams',          'Power',          'other',      'https://vimeo.com/user/16731185/folder/1764925', 'reps',     'Sprengikraftur — boltaslamm.'),
('Power Jumps',          'Power',          'squat',      'https://vimeo.com/user/16731185/folder/1764912', 'reps',     'Sprengikraftur — stökk.');

commit;
