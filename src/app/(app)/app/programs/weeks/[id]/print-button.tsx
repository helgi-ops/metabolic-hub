"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print h-10 rounded-lg border border-border bg-muted px-3.5 text-sm hover:border-accent"
    >
      Prenta
    </button>
  );
}
