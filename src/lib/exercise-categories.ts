// Display names for exercise categories. The raw names come from the Vimeo
// folder names ("Metabolic - Framan á læri") and stay as-is in the data so a
// re-sync never overwrites anything — members just see names they know from
// class. Listed in display order; anything not listed keeps its raw name and
// sorts after these (so new Vimeo folders keep working).
const CATEGORY_LABELS: [raw: string, label: string][] = [
  ["Framan á læri", "Hnébeygjur"],
  ["Framan á læri nr. 2", "Framstig/Afturstig"],
  ["Mjaðmir", "Mjaðmaréttur"],
  ["Mjaðmir nr. 2", "Stiffur/Swing"],
  ["Lárétt pressa", "Armbeygjur/Bekkpressa"],
  ["Lárétt tog", "Róður"],
  ["Lóðrétt pressa", "Axlapressa"],
  ["Biceps", "Biceps"],
  ["Triceps", "Triceps"],
  ["Core", "Core"],
  ["Burpees", "Burpees"],
  ["Power Jumps", "Power Jumps"],
  ["Power Slams", "Power Slams"],
  ["Þolæfingar", "Þolæfingar"],
];

const LABEL = new Map(CATEGORY_LABELS);
const ORDER = new Map(CATEGORY_LABELS.map(([raw], i) => [raw, i]));

export function categoryLabel(raw: string): string {
  return LABEL.get(raw) ?? raw;
}

export function sortCategories(list: Iterable<string>): string[] {
  return [...new Set(list)].sort((a, b) => {
    const ia = ORDER.get(a) ?? Infinity;
    const ib = ORDER.get(b) ?? Infinity;
    if (ia !== ib) return ia - ib;
    return categoryLabel(a).localeCompare(categoryLabel(b), "is");
  });
}
