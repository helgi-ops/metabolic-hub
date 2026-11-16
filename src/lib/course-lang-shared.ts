// Course content language (Akademía). Shared by the server reader
// (course-lang.ts) and the client toggle — no server-only imports here.

export type CourseLang = "en" | "is";

export const COURSE_LANG_COOKIE = "course_lang";

// The Icelandic value when the Icelandic view is on and a translation exists,
// otherwise the English original.
export function pick<T extends string | null | undefined>(
  lang: CourseLang,
  en: T,
  is: string | null | undefined,
): T | string {
  return lang === "is" && is && is.trim() ? is : en;
}
