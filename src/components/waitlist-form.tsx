"use client";

import { useState } from "react";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState<"track_1" | "track_2" | "newsletter">(
    "newsletter",
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, interest, source: "landing" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Eitthvað fór úrskeiðis.");
      }

      setStatus("success");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Villa kom upp.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 p-6 text-center">
        <div className="text-accent font-semibold">Takk fyrir!</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Þú færð tilkynningu þegar opnað er fyrir skráningu.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="netfangið þitt"
          className="flex-1 rounded-md border border-border bg-muted px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          disabled={status === "loading"}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-md bg-accent px-6 py-3 text-sm font-medium text-accent-foreground hover:opacity-90 transition disabled:opacity-50"
        >
          {status === "loading" ? "Sendi…" : "Skrá mig"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 justify-center text-xs">
        {(
          [
            { value: "track_1", label: "Metabolic Coach" },
            { value: "track_2", label: "Foundations" },
            { value: "newsletter", label: "Almennar fréttir" },
          ] as const
        ).map((opt) => (
          <label
            key={opt.value}
            className={`cursor-pointer rounded-full border px-3 py-1 transition ${
              interest === opt.value
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <input
              type="radio"
              name="interest"
              value={opt.value}
              checked={interest === opt.value}
              onChange={() => setInterest(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>

      {status === "error" && (
        <div className="text-sm text-red-400 text-center">{errorMessage}</div>
      )}
    </form>
  );
}
