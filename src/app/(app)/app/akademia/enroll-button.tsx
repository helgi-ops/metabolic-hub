"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function EnrollButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function enroll() {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Þú þarft að vera skráð/ur inn.");
        return;
      }
      const { error } = await supabase.from("enrollments").insert({
        user_id: user.id,
        course_id: courseId,
        source: "admin",
      });
      if (error) {
        setError(error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={enroll}
        disabled={pending}
        className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
      >
        {pending ? "Skrái…" : "Skrá mig →"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
