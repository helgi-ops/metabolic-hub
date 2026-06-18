"use client";

import { useRouter, usePathname } from "next/navigation";

// Back affordance for the app header. Hidden on the /app overview (nothing to go
// back to inside the app); on every sub-page it steps back in history, falling
// back to the overview when there is no in-app history (e.g. opened via a direct
// link). Mobile especially had no nav at all once inside a sub-page.
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/app") return null;

  function goBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/app");
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Til baka"
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition"
    >
      <span aria-hidden>←</span>
      <span>Til baka</span>
    </button>
  );
}
