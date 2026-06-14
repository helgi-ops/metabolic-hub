import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    .select("full_name, role, status, station:stations(name)")
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
          <div className="flex items-center gap-8">
            <Link
              href="/app"
              className="font-mono text-sm tracking-widest uppercase"
            >
              Metabolic
            </Link>
            <nav className="hidden sm:flex items-center gap-6 text-sm">
              <Link
                href="/app"
                className="text-muted-foreground hover:text-foreground"
              >
                Yfirlit
              </Link>
              {isStaff && (
                <>
                  <Link
                    href="/app/programs"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Æfingaplön
                  </Link>
                  <Link
                    href="/app/library"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Æfingasafn
                  </Link>
                </>
              )}
              <Link
                href="/app/personal-bests"
                className="text-muted-foreground hover:text-foreground"
              >
                Mín met
              </Link>
              <Link
                href="/app/log"
                className="text-muted-foreground hover:text-foreground"
              >
                Dagbók
              </Link>
              <Link
                href="/app/leaderboard"
                className="text-muted-foreground hover:text-foreground"
              >
                Leaderboard
              </Link>
              <Link
                href="/app/afrek"
                className="text-muted-foreground hover:text-foreground"
              >
                Afrek
              </Link>
              <Link
                href="/app/akademia"
                className="text-muted-foreground hover:text-foreground"
              >
                Akademía
              </Link>
              {isStaff && (
                <Link
                  href="/app/station"
                  className="text-muted-foreground hover:text-foreground"
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
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
