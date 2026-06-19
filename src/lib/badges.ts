// Achievements are derived from the member's own data (no extra writes) — each
// badge is "earned" when the matching stat reaches its target.

export type BadgeStats = {
  workouts: number; // workout_logs entries
  kcal: number; // total kcal on cardio machines
  activeWeeks: number; // distinct weeks with a logged workout
  pbCount: number; // personal_bests entries
  pbBenchmarks: number; // distinct exercises with a PB
  pbImprovements: number; // exercises improved at least once
  exerciseBests: number; // distinct exercises with an auto-tracked weight best
  lessonsDone: number; // completed course lessons
  coursesDone: number; // fully completed courses
};

export type BadgeDef = {
  id: string;
  group: string;
  icon: string;
  title: string;
  desc: string;
  metric: keyof BadgeStats;
  target: number;
};

export const BADGES: BadgeDef[] = [
  { id: "first_log", group: "Mæting", icon: "🔥", title: "Komin/n af stað", desc: "Skráðu fyrstu æfinguna", metric: "workouts", target: 1 },
  { id: "log10", group: "Mæting", icon: "💪", title: "10 æfingar", desc: "Skráðu 10 æfingar", metric: "workouts", target: 10 },
  { id: "log50", group: "Mæting", icon: "🏋️", title: "50 æfingar", desc: "Skráðu 50 æfingar", metric: "workouts", target: 50 },
  { id: "log100", group: "Mæting", icon: "🦾", title: "Hundraðkall", desc: "Skráðu 100 æfingar", metric: "workouts", target: 100 },

  { id: "kcal1k", group: "Brennsla", icon: "⚡", title: "1.000 kcal", desc: "Brenndu 1.000 kcal á Airbike/Concept2", metric: "kcal", target: 1000 },
  { id: "kcal10k", group: "Brennsla", icon: "🔋", title: "10.000 kcal", desc: "Brenndu 10.000 kcal", metric: "kcal", target: 10000 },
  { id: "kcal50k", group: "Brennsla", icon: "🌋", title: "50.000 kcal", desc: "Brenndu 50.000 kcal", metric: "kcal", target: 50000 },

  { id: "firstpb", group: "Met", icon: "📌", title: "Fyrsta met", desc: "Skráðu fyrsta Personal Best", metric: "pbCount", target: 1 },
  { id: "pbimprove", group: "Met", icon: "📈", title: "Bætt met", desc: "Bættu met í æfingu", metric: "pbImprovements", target: 1 },
  { id: "pb5", group: "Met", icon: "🏅", title: "Fjölhæfni", desc: "Skráðu met í 5 mismunandi æfingum", metric: "pbBenchmarks", target: 5 },

  { id: "exbest1", group: "Æfingamet", icon: "🏋️", title: "Fyrsta æfingametið", desc: "Fáðu þyngdarmet í æfingu úr dagbókinni", metric: "exerciseBests", target: 1 },
  { id: "exbest5", group: "Æfingamet", icon: "💯", title: "Fimm æfingamet", desc: "Fáðu met í 5 mismunandi æfingum úr dagbókinni", metric: "exerciseBests", target: 5 },
  { id: "exbest15", group: "Æfingamet", icon: "🥇", title: "Meistari", desc: "Fáðu met í 15 mismunandi æfingum úr dagbókinni", metric: "exerciseBests", target: 15 },

  { id: "weeks4", group: "Samfellni", icon: "📅", title: "Mánuður í röð", desc: "Æfðu í 4 mismunandi vikum", metric: "activeWeeks", target: 4 },
  { id: "weeks12", group: "Samfellni", icon: "🗓️", title: "Ársfjórðungur", desc: "Æfðu í 12 mismunandi vikum", metric: "activeWeeks", target: 12 },

  { id: "lesson1", group: "Akademía", icon: "🎓", title: "Fyrsta lexía", desc: "Kláraðu fyrstu lexíuna", metric: "lessonsDone", target: 1 },
  { id: "lesson10", group: "Akademía", icon: "📖", title: "10 lexíur", desc: "Kláraðu 10 lexíur", metric: "lessonsDone", target: 10 },
  { id: "course", group: "Akademía", icon: "🏆", title: "Útskrifuð/aður", desc: "Kláraðu heilt námskeið", metric: "coursesDone", target: 1 },
];

export type EarnedBadge = BadgeDef & { current: number; earned: boolean };

export function evaluateBadges(stats: BadgeStats): EarnedBadge[] {
  return BADGES.map((b) => {
    const current = stats[b.metric];
    return { ...b, current, earned: current >= b.target };
  });
}
