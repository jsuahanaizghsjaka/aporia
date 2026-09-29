import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinationForUser } from "@/lib/auth/flow";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  try {
    const client = await createClient();
    if (code && client) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (!error && data.user && data.session) {
        if ("redirectType" in data && data.redirectType === "recovery")
          return NextResponse.redirect(new URL("/reset-password", url.origin), {
            headers: {
              "Cache-Control": "private, no-store",
              "Referrer-Policy": "no-referrer",
            },
          });
        const next = await destinationForUser(
          client,
          data.user.id,
          url.searchParams.get("next"),
        );
        return NextResponse.redirect(new URL(next, url.origin), {
          headers: { "Cache-Control": "private, no-store" },
        });
      }
    }
  } catch {
    return NextResponse.redirect(new URL("/login?error=service", url.origin), {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  return NextResponse.redirect(
    new URL("/login?error=confirmation", url.origin),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
