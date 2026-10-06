import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { FLEXIBLE_DIET_MD } from "./flexible-diet";

export const metadata = {
  title: "Fræðsla · Metabolic",
};

export default function FraedslaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-widest text-accent uppercase">
          Fræðsla
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Praktísk næringarfræðsla fyrir iðkendur — byggð á Flexible Diet
          aðferðinni og tengd beint við{" "}
          <Link href="/app/naering" className="text-accent hover:underline">
            Matardagbók
          </Link>
          .
        </p>
      </div>

      <article className="rounded-lg border border-border bg-muted p-6 sm:p-8">
        <Markdown source={FLEXIBLE_DIET_MD} />
      </article>
    </main>
  );
}
