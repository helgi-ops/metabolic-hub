import { formatTime, isTimeUnit } from "@/lib/format";

type Point = { achieved_on: string; value: number };

function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

export function ProgressChart({
  name,
  unit,
  higherIsBetter = true,
  points,
}: {
  name: string;
  unit: string;
  higherIsBetter?: boolean;
  points: Point[];
}) {
  const time = isTimeUnit(unit);
  const fmt = (v: number) => (time ? formatTime(v) : String(v));
  // Need at least two data points to show a trend.
  if (points.length < 2) return null;

  const W = 320;
  const H = 130;
  const padL = 10;
  const padR = 10;
  const padT = 14;
  const padB = 22;

  const xs = points.map((p) => Date.parse(p.achieved_on));
  const ys = points.map((p) => p.value);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const padY = (maxY - minY) * 0.15 || 1;
  const lo = minY - padY;
  const hi = maxY + padY;

  const sx = (x: number) => padL + ((x - minX) / spanX) * (W - padL - padR);
  const sy = (y: number) =>
    padT + (1 - (y - lo) / (hi - lo || 1)) * (H - padT - padB);

  const coords = points.map((p, i) => [sx(xs[i]), sy(p.value)] as const);
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)},${c[1].toFixed(1)}`)
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.value - first.value;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const mag = Math.abs(delta);
  const deltaLabel = time
    ? `${sign}${formatTime(mag)}`
    : `${sign}${Number(mag.toFixed(1))} ${unit}`;
  // Improvement depends on direction: lower time is better, higher weight is better.
  const improved = higherIsBetter ? delta > 0 : delta < 0;

  return (
    <div className="rounded-lg border border-border bg-muted p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-xs text-muted-foreground">{name}</div>
        <div
          className={`text-xs font-medium ${
            delta !== 0 && improved ? "text-accent" : "text-muted-foreground"
          }`}
        >
          {deltaLabel}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Framvinda fyrir ${name}`}
      >
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c[0]}
            cy={c[1]}
            r="2.5"
            fill="var(--accent)"
          />
        ))}
        {/* value labels for first and last */}
        <text x={coords[0][0]} y={coords[0][1] - 6} fontSize="9" fill="var(--muted-foreground)">
          {fmt(first.value)}
        </text>
        <text
          x={coords[coords.length - 1][0]}
          y={coords[coords.length - 1][1] - 6}
          fontSize="9"
          textAnchor="end"
          fill="var(--foreground)"
        >
          {fmt(last.value)}
        </text>
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{shortDate(first.achieved_on)}</span>
        <span>{shortDate(last.achieved_on)}</span>
      </div>
    </div>
  );
}
