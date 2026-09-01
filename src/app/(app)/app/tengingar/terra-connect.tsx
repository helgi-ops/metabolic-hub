"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function TerraConnect({
  connected,
  configured,
  userId,
}: {
  connected: boolean;
  configured: boolean;
  userId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("terra_connections").delete().eq("user_id", userId);
    setBusy(false);
    router.refresh();
  }

  if (connected) {
    return (
      <button
        type="button"
        onClick={disconnect}
        disabled={busy}
        className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition hover:border-red-400 hover:text-red-400 disabled:opacity-50"
      >
        {busy ? "Aftengi…" : "Aftengja"}
      </button>
    );
  }

  if (!configured) {
    return (
      <button
        type="button"
        disabled
        title="Tenging er í uppsetningu"
        className="cursor-not-allowed rounded-md border border-border px-4 py-2 text-sm text-muted-foreground opacity-60"
      >
        Tengja úr (í uppsetningu)
      </button>
    );
  }

  return (
    <a
      href="/api/terra/connect"
      className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90"
    >
      Tengja úr
    </a>
  );
}
