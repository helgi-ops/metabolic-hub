import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const interest = String(body?.interest ?? "newsletter");
    const source = String(body?.source ?? "landing");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Ógilt netfang." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("email_signups")
      .insert({ email, interest, source });

    if (error) {
      // Unique violation = already on the list. Treat as success.
      if (error.code === "23505") {
        return NextResponse.json({ ok: true, alreadyOnList: true });
      }
      console.error("[waitlist] insert error", error);
      return NextResponse.json(
        { error: "Gat ekki vistað netfangið. Reyndu aftur." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[waitlist] unexpected error", e);
    return NextResponse.json({ error: "Villa kom upp." }, { status: 500 });
  }
}
