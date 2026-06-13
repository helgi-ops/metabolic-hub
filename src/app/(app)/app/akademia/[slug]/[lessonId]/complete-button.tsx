"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CompleteButton({
  lessonId,
  done,
  nextHref,
}: {
  lessonId: string;
  done: boolean;
  nextHref?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
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
      const now = new Date().toISOString();
      const { error } = await supabase.from("lesson_progress").upsert(
        {
          user_id: user.id,
          lesson_id: lessonId,
          completed_at: done ? null : now,
          last_watched_at: now,
        },
        { onConflict: "user_id,lesson_id" },
      );
      if (error) {
        setError(error.message);
        return;
      }
      // Marking complete advances to the next lesson; un-marking just refreshes.
      if (!done && nextHref) router.push(nextHref);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={toggle}
        disabled={pending}
        className={`rounded-md px-5 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
          done
            ? "border border-border text-muted-foreground hover:text-foreground"
            : "bg-accent text-accent-foreground hover:opacity-90"
        }`}
      >
        {pending
          ? "Vista…"
          : done
            ? "✓ Klárað — afmerkja"
            : "Merkja sem klárað"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
