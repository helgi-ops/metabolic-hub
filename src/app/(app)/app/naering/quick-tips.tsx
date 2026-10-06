import Link from "next/link";

// Compact, collapsible nutrition quick-reference for the Matardagbók — the
// practical highlights from the Flexible Diet guide (portion hand-method, golden
// habits, hunger scale). Native <details> so no client JS is needed. Links to the
// full guide at /app/fraedsla.

const PORTIONS: [string, string, string, string][] = [
  ["Prótein", "Lófi", "2", "1"],
  ["Grænmeti", "Hnefi", "2", "1"],
  ["Sterkja", "Lúka", "2", "1"],
  ["Fita", "Þumall", "2", "1"],
];

const HABITS = [
  "Borðaðu hægt — hættu við ~80% seddu.",
  "Prótein í hverri máltíð (lófastærð).",
  "Grænmeti í hverri máltíð (hnefastærð).",
  "Kolvetni frekar eftir æfingu ef þú vilt léttast.",
  "Góð fita í hverri máltíð.",
];

const HUNGER: [string, string][] = [
  ["1 klst", "Ekkert hungur"],
  ["2 klst", "Byrjar að finna fyrir hungri"],
  ["3 klst", "Tímabært að borða (7–8 af 10)"],
  ["4 klst", "Mjög svöng/svangur (8–9 af 10)"],
];

export function QuickTips() {
  const summary =
    "flex cursor-pointer list-none items-center justify-between py-2 text-sm font-medium [&::-webkit-details-marker]:hidden";

  return (
    <div className="rounded-lg border border-border bg-muted p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Fljótvísanir — næring</h2>
        <Link
          href="/app/fraedsla"
          className="shrink-0 text-xs text-accent hover:underline"
        >
          Sjá alla fræðsluna →
        </Link>
      </div>

      <div className="mt-2 divide-y divide-border">
        <details>
          <summary className={summary}>
            <span>🖐️ Skammtastærðir (lófaaðferðin)</span>
            <span className="text-muted-foreground">+</span>
          </summary>
          <div className="overflow-x-auto pb-3">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Orkuefni</th>
                  <th className="py-1 pr-3 font-medium">Mæling</th>
                  <th className="py-1 pr-3 font-medium">Karlar</th>
                  <th className="py-1 font-medium">Konur</th>
                </tr>
              </thead>
              <tbody>
                {PORTIONS.map(([macro, tool, m, f]) => (
                  <tr key={macro} className="border-t border-border">
                    <td className="py-1 pr-3 font-medium">{macro}</td>
                    <td className="py-1 pr-3 text-muted-foreground">{tool}</td>
                    <td className="py-1 pr-3 text-muted-foreground">×{m}</td>
                    <td className="py-1 text-muted-foreground">×{f}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details>
          <summary className={summary}>
            <span>✋ Fimm gullnar venjur</span>
            <span className="text-muted-foreground">+</span>
          </summary>
          <ul className="space-y-1 pb-3 text-sm text-muted-foreground">
            {HABITS.map((h) => (
              <li key={h} className="flex gap-2">
                <span className="text-accent">✓</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </details>

        <details>
          <summary className={summary}>
            <span>⏱️ Svengdarskali (ef markmið er að léttast)</span>
            <span className="text-muted-foreground">+</span>
          </summary>
          <ul className="space-y-1 pb-3 text-sm text-muted-foreground">
            {HUNGER.map(([t, feel]) => (
              <li key={t} className="flex gap-2">
                <span className="w-14 shrink-0 font-medium text-foreground/80">
                  {t}
                </span>
                <span>{feel}</span>
              </li>
            ))}
            <li className="pt-1 text-xs">
              Ekki orðin/n svöng/svangur eftir 3 klst? Þá borðaðirðu líklega of
              mikið.
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
}
