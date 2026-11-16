"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { COURSE_LANG_COOKIE, type CourseLang } from "@/lib/course-lang-shared";

// EN / IS switch for course content. The choice is kept in a cookie (one year)
// so it follows the learner across lessons; the server re-renders in place.
export function CourseLangToggle({ lang }: { lang: CourseLang }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: CourseLang) {
    if (next === lang) return;
    document.cookie = `${COURSE_LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label="Tungumál námsefnis"
      className={`inline-flex rounded-md border border-border p-0.5 text-xs font-medium ${
        pending ? "opacity-60" : ""
      }`}
    >
      {(["en", "is"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          aria-pressed={lang === l}
          className={`rounded px-2.5 py-1 transition ${
            lang === l
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {l === "en" ? "EN" : "IS"}
        </button>
      ))}
    </div>
  );
}
