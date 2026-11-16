"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitAssignment } from "./assignment-actions";

export type AssignmentView = {
  id: string;
  requiresApproval: boolean;
  template: string;
  submission: {
    text: string;
    status: "submitted" | "approved" | "needs_revision";
    feedback: string | null;
    submittedAt: string;
    reviewedAt: string | null;
  } | null;
};

const STATUS = {
  submitted: { label: "Skilað", cls: "border-sky-400/50 text-sky-400" },
  approved: { label: "Samþykkt", cls: "border-accent/50 text-accent" },
  needs_revision: { label: "Þarf lagfæringu", cls: "border-amber-400/50 text-amber-400" },
} as const;

export function AssignmentPanel({
  assignment,
  nextHref,
}: {
  assignment: AssignmentView;
  nextHref?: string;
}) {
  const router = useRouter();
  const sub = assignment.submission;
  const [text, setText] = useState(sub?.text ?? assignment.template);
  const [editing, setEditing] = useState(!sub || sub.status === "needs_revision");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const locked = sub?.status === "approved";
  const pendingReview = assignment.requiresApproval && sub?.status === "submitted";

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const r = await submitAssignment(assignment.id, text);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  const date = (s: string) => new Date(s).toLocaleDateString("is-IS");

  return (
    <section className="mt-10 rounded-lg border border-accent/40 bg-muted p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-xs tracking-widest text-accent uppercase">
            {assignment.requiresApproval ? "Lokaverkefni" : "Verkefni"}
          </div>
          <h2 className="mt-1 text-lg font-semibold">Þitt svar</h2>
        </div>
        {sub && (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS[sub.status].cls}`}
          >
            {STATUS[sub.status].label} · {date(sub.submittedAt)}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {assignment.requiresApproval
          ? "Yfirþjálfari fer yfir lokaverkefnið. Skírteinið opnast þegar það hefur verið samþykkt."
          : "Skrifaðu svarið hér og skilaðu. Verkefnið telst klárað um leið og þú skilar — þjálfari getur gefið þér endurgjöf."}
      </p>

      {sub?.feedback && (
        <div className="mt-4 rounded-md border border-border bg-background p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Endurgjöf þjálfara{sub.reviewedAt ? ` · ${date(sub.reviewedAt)}` : ""}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{sub.feedback}</p>
        </div>
      )}

      {editing && !locked ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={assignment.requiresApproval ? 24 : 14}
            disabled={pending}
            placeholder="Skrifaðu svarið þitt hér…"
            className="mt-4 w-full rounded-md border border-border bg-background px-4 py-3 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Markdown virkar: ## fyrirsagnir, - punktar, | töflur |.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={submit}
              disabled={pending || text.trim().length < 20}
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Skila…" : sub ? "Skila aftur" : "Skila verkefni"}
            </button>
            {sub && (
              <button
                onClick={() => {
                  setText(sub.text);
                  setEditing(false);
                }}
                disabled={pending}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Hætta við
              </button>
            )}
          </div>
        </>
      ) : (
        sub && (
          <>
            <div className="mt-4 max-h-96 overflow-auto rounded-md border border-border bg-background p-4">
              <p className="whitespace-pre-wrap text-sm">{sub.text}</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!locked && (
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  Breyta svari
                </button>
              )}
              {!pendingReview && nextHref && (
                <a
                  href={nextHref}
                  className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition hover:opacity-90"
                >
                  Næsta lexía →
                </a>
              )}
            </div>
          </>
        )
      )}

      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? "text-accent" : "text-red-400"}`}>{msg.text}</p>
      )}
    </section>
  );
}
