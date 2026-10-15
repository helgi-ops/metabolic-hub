"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resetMemberPassword } from "./actions";

export function MemberActions({
  memberId,
  memberName,
  status,
  canDelete = false,
}: {
  memberId: string;
  memberName?: string | null;
  status: string;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function resetPassword() {
    setResetError(null);
    setResetting(true);
    startTransition(async () => {
      const res = await resetMemberPassword(memberId);
      setResetting(false);
      if (res.ok) {
        setTempPassword(res.password);
        setCopied(false);
      } else {
        setResetError(res.message);
      }
    });
  }

  async function copyPassword() {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
    } catch {
      // Clipboard blocked (e.g. insecure context) — the coach can read it off
      // the screen instead.
    }
  }

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

  if (tempPassword) {
    return (
      <div className="flex flex-col items-end gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          Nýtt bráðabirgðalykilorð
          {memberName ? ` fyrir ${memberName.split(" ")[0]}` : ""}:
        </span>
        <div className="flex items-center gap-2">
          <code className="rounded bg-background px-2 py-1 font-mono text-sm tracking-wider text-foreground">
            {tempPassword}
          </code>
          <button
            onClick={copyPassword}
            className={`${base} border-accent text-accent hover:bg-accent/15`}
          >
            {copied ? "Afritað ✓" : "Afrita"}
          </button>
          <button
            onClick={() => setTempPassword(null)}
            className={`${base} border-border text-muted-foreground hover:text-foreground`}
          >
            Loka
          </button>
        </div>
        <span className="text-muted-foreground">
          Gefðu iðkandanum þetta — hann skráir sig inn og velur svo nýtt lykilorð
          undir „Mínar upplýsingar".
        </span>
      </div>
    );
  }

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
    <div className="flex flex-wrap items-center justify-end gap-2">
      {resetError && <span className="text-xs text-red-400">{resetError}</span>}
      <button
        onClick={resetPassword}
        disabled={pending}
        title="Búa til nýtt bráðabirgðalykilorð fyrir iðkandann"
        className={`${base} border-border text-muted-foreground hover:text-foreground`}
      >
        {resetting ? "Endurstilli…" : "🔑 Endurstilla lykilorð"}
      </button>
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
