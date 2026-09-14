import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/auth/request";
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  try {
    const client = await createClient();
    if (client) {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    }
  } catch {
    return new Response(
      "Не удалось подтвердить выход на сервере. Вход в этом браузере мог завершиться. Вернись на страницу входа.",
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
    headers: { "Cache-Control": "private, no-store" },
  });
}
