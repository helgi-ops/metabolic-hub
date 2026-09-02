import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackButton } from "./back-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, status, can_build_programs, station:stations(name)")
    .eq("id", user.id)
    .single();

  const isStaff = profile?.role === "coach" || profile?.role === "admin";

  // Members must be approved by a coach before they can use the system, and lose
  // access if suspended. Staff are never gated.
  if (profile?.role === "student" && profile.status !== "active") {
    const stationName =
      (profile.station as { name: string } | null)?.name ?? "stöðina þína";
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md text-center">
          <div className="font-mono text-xs tracking-widest text-accent uppercase">
            Metabolic
          </div>
          {profile.status === "pending" ? (
            <>
              <h1 className="mt-4 text-2xl font-bold">Aðgangur í bið</h1>
              <p className="mt-3 text-muted-foreground">
                Þú færð aðgang um leið og þjálfari hjá {stationName} hefur
                samþykkt skráninguna þína.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-2xl font-bold">Aðgangi lokað</h1>
              <p className="mt-3 text-muted-foreground">
                Aðgangurinn þinn er ekki virkur. Hafðu samband við þjálfara hjá{" "}
                {stationName} ef þú telur þetta vera mistök.
              </p>
            </>
          )}
          <form action="/auth/signout" method="post" className="mt-8">
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Skrá út
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="no-print border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-8">
            <BackButton />
            <Link
              href="/app"
              className="font-mono text-sm tracking-widest uppercase"
            >
              Metabolic
            </Link>
            <nav className="hidden flex-wrap items-center gap-2 text-sm sm:flex">
              <Link
                href="/app"
                className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
              >
                Yfirlit
              </Link>
              {/* All staff can view the week; only builders see the builder UI. */}
              {isStaff && (
                <Link
                  href="/app/programs"
                  className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
                >
                  Æfingaplön
                </Link>
              )}
              <Link
                href="/app/videos"
                className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
              >
                Æfingabanki
              </Link>
              <Link
                href="/app/personal-bests"
                className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
              >
                Mín met
              </Link>
              <Link
                href="/app/log"
                className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
              >
                Æfingadagbók
              </Link>
              <Link
                href="/app/naering"
                className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
              >
                Næringardagbók
              </Link>
              <Link
                href="/app/leaderboard"
                className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
              >
                Leaderboard
              </Link>
              <Link
                href="/app/afrek"
                className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
              >
                Afrek
              </Link>
              <Link
                href="/app/akademia"
                className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
              >
                Akademía
              </Link>
              {isStaff && (
                <Link
                  href="/app/station"
                  className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition hover:border-accent hover:text-foreground"
                >
                  Stöðin
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="hidden sm:block text-muted-foreground">
              {profile?.full_name ?? user.email}
            </div>
            <Link
              href="/breyta-lykilord"
              className="hidden sm:block text-muted-foreground hover:text-foreground transition"
            >
              Lykilorð
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-muted-foreground hover:text-foreground transition"
              >
                Skrá út
              </button>
            </form>
          </div>
        </div>
        {/* Mobile nav — the desktop nav above is hidden on phones, so the same
            links live here as a horizontally scrollable strip. */}
        <nav className="flex gap-2 overflow-x-auto border-t border-border px-6 py-3 text-sm sm:hidden">
          <Link
            href="/app"
            className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            Yfirlit
          </Link>
          {isStaff && (
            <Link
              href="/app/programs"
              className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-muted-foreground transition hover:border-accent hover:text-foreground"
            >
              Æfingaplön
            </Link>
          )}
          <Link
            href="/app/videos"
            className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            Æfingabanki
          </Link>
          <Link
            href="/app/personal-bests"
            className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            Mín met
          </Link>
          <Link
            href="/app/log"
            className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            Æfingadagbók
          </Link>
          <Link
            href="/app/naering"
            className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            Næringardagbók
          </Link>
          <Link
            href="/app/leaderboard"
            className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            Leaderboard
          </Link>
          <Link
            href="/app/afrek"
            className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            Afrek
          </Link>
          <Link
            href="/app/akademia"
            className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-muted-foreground transition hover:border-accent hover:text-foreground"
          >
            Akademía
          </Link>
          {isStaff && (
            <Link
              href="/app/station"
              className="whitespace-nowrap rounded-md border border-border px-3 py-2 text-muted-foreground transition hover:border-accent hover:text-foreground"
            >
              Stöðin
            </Link>
          )}
        </nav>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
