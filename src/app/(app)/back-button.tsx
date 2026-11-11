"use client";

import { useRouter, usePathname } from "next/navigation";

// Pages that exist, so the fallback never lands on a route without a page
// (e.g. /app/station/member/[id] has none).
const KNOWN_PAGES = [
  /^\/app$/,
  /^\/app\/[^/]+$/,
  /^\/app\/akademia\/[^/]+$/,
  /^\/app\/akademia\/[^/]+\/[^/]+$/,
  /^\/app\/programs\/weeks\/[^/]+$/,
  /^\/app\/station\/timetable$/,
];

// Nearest existing ancestor page: /app/station/timetable → /app/station,
// /app/akademia/x/y → /app/akademia/x, /app/log → /app.
function parentOf(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  for (let n = parts.length - 1; n >= 1; n--) {
    const p = "/" + parts.slice(0, n).join("/");
    if (KNOWN_PAGES.some((re) => re.test(p))) return p;
  }
  return "/app";
}

// Back affordance for the mobile app bar (no browser back button in the
// installed PWA). Hidden on the /app overview — nothing to go back to. Steps
// back in history; with no in-app history (opened from a link or the home
// screen) it goes to the parent page instead.
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/app") return null;

  function goBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(parentOf(pathname));
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Til baka"
      className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
    >
      <span aria-hidden>←</span>
      <span className="hidden text-sm min-[380px]:inline">Til baka</span>
    </button>
  );
}
