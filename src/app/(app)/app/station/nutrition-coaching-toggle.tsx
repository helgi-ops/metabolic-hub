"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Admin/coach switch for the paid nutrition-coaching service. When on, the coach
// can view this member's nutrition.
export function NutritionCoachingToggle({
  memberId,
  enabled,
}: {
  memberId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("set_nutrition_coaching", {
        member: memberId,
        enabled: !enabled,
      });
      if (!error) router.refresh();
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      title={
        enabled
          ? "Næringar-þjónusta virk — smelltu til að slökkva"
          : "Kveiktu á næringar-þjónustu fyrir þennan iðkanda"
      }
      className={`rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
        enabled
          ? "border-accent bg-accent/15 text-accent hover:bg-accent/25"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {enabled ? "Næring ✓" : "Næring"}
    </button>
  );
}
