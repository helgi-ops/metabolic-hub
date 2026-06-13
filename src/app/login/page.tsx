import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Innskráning · Metabolic",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="font-mono text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground"
          >
            ← Metabolic
          </Link>
          <h1 className="mt-6 text-2xl font-semibold">Innskráning</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Skráðu þig inn til að halda áfram.
          </p>
        </div>
        <LoginForm searchParams={searchParams} />
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Engan aðgang?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Búa til aðgang
          </Link>
        </div>
      </div>
    </main>
  );
}
