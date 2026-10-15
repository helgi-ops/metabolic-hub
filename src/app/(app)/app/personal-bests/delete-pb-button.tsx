"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Lets a member delete one of their own PBs (e.g. a mistyped value). RLS
// (pb_delete_own) already restricts deletes to the owner, so this is a plain
// client delete + refresh.
export function DeletePbButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function remove() {
    setError(false);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("personal_bests")
        .delete()
        .eq("id", id);
      if (error) {
        setError(true);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <span className="flex items-center justify-end gap-2 text-xs">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded border border-red-400 bg-red-500/15 px-2 py-0.5 text-red-400 hover:bg-red-500/25 disabled:opacity-50"
        >
          {pending ? "Eyði…" : "Já, eyða"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground"
        >
          Hætta við
        </button>
        {error && <span className="text-red-400">Mistókst</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title="Eyða þessu meti"
      className="text-xs text-muted-foreground hover:text-red-400"
    >
      Eyða
    </button>
  );
}
