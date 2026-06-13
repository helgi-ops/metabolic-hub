"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MemberActions({
  memberId,
  status,
  canDelete = false,
}: {
  memberId: string;
  status: string;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function setStatus(newStatus: string) {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("set_member_status", {
        member: memberId,
        new_status: newStatus,
      });
      if (!error) router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("delete_member", { member: memberId });
      if (!error) router.refresh();
    });
  }

  const base =
    "rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-50";

  if (confirmingDelete) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-400">Eyða öllum gögnum?</span>
        <button
          onClick={remove}
          disabled={pending}
          className={`${base} border-red-400 bg-red-500/15 text-red-400 hover:bg-red-500/25`}
        >
          Já, eyða
        </button>
        <button
          onClick={() => setConfirmingDelete(false)}
          disabled={pending}
          className={`${base} border-border text-muted-foreground hover:text-foreground`}
        >
          Hætta við
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {status === "pending" && (
        <button
          onClick={() => setStatus("active")}
          disabled={pending}
          className={`${base} border-accent bg-accent text-accent-foreground hover:opacity-90`}
        >
          Samþykkja
        </button>
      )}
      {status === "active" && (
        <button
          onClick={() => setStatus("suspended")}
          disabled={pending}
          className={`${base} border-border text-muted-foreground hover:border-red-400 hover:text-red-400`}
        >
          Loka aðgangi
        </button>
      )}
      {status === "suspended" && (
        <button
          onClick={() => setStatus("active")}
          disabled={pending}
          className={`${base} border-border text-muted-foreground hover:text-foreground`}
        >
          Opna aftur
        </button>
      )}
      {canDelete && (
        <button
          onClick={() => setConfirmingDelete(true)}
          disabled={pending}
          title="Eyða iðkanda og öllum gögnum varanlega"
          className={`${base} border-transparent text-muted-foreground hover:text-red-400`}
        >
          Eyða
        </button>
      )}
    </div>
  );
}
