import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "./app-shell";

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

  // Nav items for the sidebar/drawer. Staff-only items are gated here so the
  // client shell just renders whatever it's given.
  const navItems = [
    { href: "/app", label: "Yfirlit" },
    ...(isStaff ? [{ href: "/app/programs", label: "Æfingaplön" }] : []),
    { href: "/app/videos", label: "Æfingabanki" },
    { href: "/app/personal-bests", label: "Mín met" },
    { href: "/app/log", label: "Æfingadagbók" },
    { href: "/app/naering", label: "Matardagbók" },
    { href: "/app/leaderboard", label: "Leaderboard" },
    { href: "/app/afrek", label: "Afrek" },
    { href: "/app/akademia", label: "Akademía" },
    ...(isStaff ? [{ href: "/app/station", label: "Stöðin" }] : []),
  ];

  return (
    <AppShell navItems={navItems} fullName={profile?.full_name ?? user.email ?? ""}>
      {children}
    </AppShell>
  );
}
