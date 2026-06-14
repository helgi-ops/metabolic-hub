import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCertificatePdf } from "@/lib/pdf/certificate-pdf";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", _request.url));

  const { data: course } = await supabase
    .from("courses")
    .select("id, slug")
    .eq("slug", slug)
    .single();
  if (!course) return NextResponse.redirect(new URL("/app/akademia", _request.url));

  // Issues (or fetches) the certificate — returns nothing if not completed.
  const { data: cert } = await supabase.rpc("issue_certificate", {
    p_course: course.id,
  });
  const row = cert?.[0];
  if (!row) {
    return NextResponse.redirect(
      new URL(`/app/akademia/${slug}`, _request.url),
    );
  }

  const dateStr = new Date(row.issued_at).toLocaleDateString("is-IS");
  const pdf = await generateCertificatePdf({
    name: row.full_name ?? "—",
    courseTitle: row.course_title,
    dateStr,
    number: row.certificate_number,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Metabolic-skirteini-${slug}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
