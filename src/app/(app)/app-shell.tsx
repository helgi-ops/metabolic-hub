"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = { href: string; label: string };

// App chrome: a fixed left sidebar on desktop, a hamburger drawer on mobile.
// The layout (server) does the auth/gating and hands us the nav items + name.
export function AppShell({
  navItems,
  fullName,
  children,
}: {
  navItems: NavItem[];
  fullName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever we navigate.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) =>
    href === "/app"
      ? pathname === "/app"
      : pathname === href || pathname.startsWith(href + "/");

  const linkCls = (href: string) =>
    `block rounded-md px-3 py-2 text-sm transition ${
      isActive(href)
        ? "border border-accent bg-accent/10 text-foreground"
        : "border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  const nav = (
    <nav className="flex flex-col gap-1">
      {navItems.map((it) => (
        <Link key={it.href} href={it.href} className={linkCls(it.href)}>
          {it.label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="mt-auto border-t border-border pt-4 text-sm">
      <div className="mb-2 truncate text-muted-foreground">{fullName}</div>
      <div className="flex flex-col gap-1">
        <Link
          href="/breyta-lykilord"
          className="text-muted-foreground transition hover:text-foreground"
        >
          Lykilorð
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-muted-foreground transition hover:text-foreground"
          >
            Skrá út
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-1">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-border px-4 py-5 sm:flex">
        <Link
          href="/app"
          className="mb-6 font-mono text-sm tracking-widest uppercase"
        >
          Metabolic
        </Link>
        {nav}
        {footer}
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background px-4 py-3 sm:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Opna valmynd"
            className="rounded-md border border-border px-2.5 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            ☰
          </button>
          <Link href="/app" className="font-mono text-sm tracking-widest uppercase">
            Metabolic
          </Link>
        </header>

        {/* Mobile drawer */}
        {open && (
          <div
            className="no-print fixed inset-0 z-40 sm:hidden"
            role="dialog"
            aria-modal="true"
          >
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-64 flex-col overflow-y-auto border-r border-border bg-background px-4 py-5">
              <div className="mb-6 flex items-center justify-between">
                <Link
                  href="/app"
                  className="font-mono text-sm tracking-widest uppercase"
                >
                  Metabolic
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Loka valmynd"
                  className="text-muted-foreground transition hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              {nav}
              {footer}
            </aside>
          </div>
        )}

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
