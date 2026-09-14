import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { goalRecordSchema } from "./schema";
export async function readGoal(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("goals")
    .select("id,summary,success_criteria,target_date,version,updated_at")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error("Цель недоступна.");
  return data ? goalRecordSchema.parse(data) : null;
}
