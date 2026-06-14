import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata = {
  title: "Gleymt lykilorð · Metabolic",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link
            href="/login"
            className="font-mono text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground"
          >
            ← Innskráning
          </Link>
          <h1 className="mt-6 text-2xl font-semibold">Gleymt lykilorð</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sláðu inn netfangið þitt og við sendum þér hlekk til að velja nýtt
            lykilorð.
          </p>
        </div>
        <ForgotForm />
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Manstu lykilorðið?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Innskráning
          </Link>
        </div>
      </div>
    </main>
  );
}
