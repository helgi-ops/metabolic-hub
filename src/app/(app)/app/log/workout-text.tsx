// Renders a workout's prescription text (as the coach wrote it) in a readable
// layout: the first paragraph is the format ("Uppsetning"), later paragraphs are
// exercise blocks whose first un-numbered line is a sub-heading ("Æfing 1 x6",
// "Supersett 3 x6", "6 mín Tímarammi 1") and numbered lines (1, 1a, 2b …) are
// exercises. Free text from coaches — anything unrecognised is shown as-is.

const ENUM_LINE = /^(\d+[a-z]?)[.)]?\s+(.*)$/i;

export function WorkoutText({ text }: { text: string }) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) =>
      b
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .filter((b) => b.length > 0);
  if (blocks.length === 0) return null;

  // The intro paragraph is the format, unless the text is a single block that
  // starts straight with exercises.
  const hasIntro = blocks.length > 1 || !ENUM_LINE.test(blocks[0][0]);
  const intro = hasIntro ? blocks[0] : null;
  const rest = hasIntro ? blocks.slice(1) : blocks;

  return (
    <div className="space-y-3 text-sm">
      {intro && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <div className="text-[11px] font-medium tracking-wide text-orange-400 uppercase">
            Uppsetning
          </div>
          <p className="mt-0.5 leading-relaxed whitespace-pre-line">{intro.join("\n")}</p>
        </div>
      )}
      {rest.map((lines, i) => {
        const heading = ENUM_LINE.test(lines[0]) ? null : lines[0];
        const items = heading ? lines.slice(1) : lines;
        return (
          <div key={i}>
            {heading && <div className="mb-1 font-semibold">{heading}</div>}
            {items.length > 0 && (
              <ul className="space-y-1">
                {items.map((line, j) => {
                  const m = line.match(ENUM_LINE);
                  return (
                    <li key={j} className="flex items-baseline gap-2">
                      {m ? (
                        <>
                          <span className="w-7 shrink-0 rounded bg-background px-1 text-center font-mono text-[11px] text-muted-foreground">
                            {m[1]}
                          </span>
                          <span>{m[2]}</span>
                        </>
                      ) : (
                        <>
                          <span className="w-7 shrink-0 text-center text-muted-foreground">•</span>
                          <span>{line}</span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
