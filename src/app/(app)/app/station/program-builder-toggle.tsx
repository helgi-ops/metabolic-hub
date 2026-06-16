"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Admin-only switch to grant/revoke a coach's access to the Program Builder.
export function ProgramBuilderToggle({
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
      const { error } = await supabase.rpc("set_program_builder", {
        member: memberId,
        allowed: !enabled,
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
          ? "Smelltu til að taka Program Builder af þessum þjálfara"
          : "Smelltu til að veita þessum þjálfara aðgang að Program Builder"
      }
      className={`rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
        enabled
          ? "border-accent bg-accent/15 text-accent hover:bg-accent/25"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {enabled ? "Builder ✓" : "Veita Builder"}
    </button>
  );
}
