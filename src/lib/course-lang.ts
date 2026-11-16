import { cookies } from "next/headers";
import { COURSE_LANG_COOKIE, type CourseLang } from "./course-lang-shared";

export { pick, type CourseLang } from "./course-lang-shared";

// The learner's chosen course language, remembered in a cookie by the EN/IS
// toggle. English (the original) is the default.
export async function getCourseLang(): Promise<CourseLang> {
  const v = (await cookies()).get(COURSE_LANG_COOKIE)?.value;
  return v === "is" ? "is" : "en";
}
