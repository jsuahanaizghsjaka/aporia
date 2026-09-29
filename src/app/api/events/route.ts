import { z } from "zod";
import { getSession } from "@/lib/supabase/session";
import { isSameOrigin } from "@/lib/auth/request";
const schema = z.strictObject({
  name: z.enum(["onboarding_started", "weekly_review_opened"]),
  reviewId: z.uuid().optional(),
});
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  try {
    const text = await request.text();
    if (text.length > 300) return new Response(null, { status: 400 });
    const input = schema.parse(JSON.parse(text));
    const { error } = await session.client.rpc("observe_product_event", {
      _name: input.name,
      _review_id: input.reviewId ?? null,
    });
    return new Response(null, {
      status: error ? 503 : 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(null, { status: 400 });
  }
}
