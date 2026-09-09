import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/auth/request";
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const client = await createClient();
  if (client) {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error)
      return new Response("Не удалось выйти. Попробуй ещё раз.", {
        status: 503,
      });
  }
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
