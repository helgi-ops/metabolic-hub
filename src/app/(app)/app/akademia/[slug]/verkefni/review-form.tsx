"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewSubmission } from "./actions";

export function ReviewForm({
  submissionId,
  isFinal,
  initialFeedback,
}: {
  submissionId: string;
  isFinal: boolean;
  initialFeedback: string;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState(initialFeedback);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run(decision: "approved" | "needs_revision") {
    setMsg(null);
    startTransition(async () => {
      const r = await reviewSubmission(submissionId, decision, feedback);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={4}
        disabled={pending}
        placeholder={
          isFinal
            ? "Endurgjöf til nemandans (nauðsynleg ef þú biður um lagfæringu)…"
            : "Endurgjöf til nemandans (valfrjálst)…"
        }
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => run("approved")}
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {isFinal ? "Samþykkja lokaverkefni" : feedback.trim() ? "Senda endurgjöf" : "Merkja yfirfarið"}
        </button>
        <button
          onClick={() => run("needs_revision")}
          disabled={pending || !feedback.trim()}
          title={feedback.trim() ? "" : "Skrifaðu fyrst hvað þarf að laga"}
          className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-50"
        >
          Biðja um lagfæringu
        </button>
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-accent" : "text-red-400"}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
