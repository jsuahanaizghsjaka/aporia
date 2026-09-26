import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { roadmapRecordSchema } from "./schema.ts";

export async function readRoadmap(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("roadmaps")
    .select("id,goal_id,version,updated_at")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error("Маршрут недоступен.");
  if (!data) return null;
  const { data: items, error: itemsError } = await client
    .from("roadmap_items")
    .select("skill_id,position,reason")
    .eq("roadmap_id", data.id)
    .order("position");
  if (itemsError) throw new Error("Элементы маршрута недоступны.");
  return roadmapRecordSchema.parse({ ...data, items });
}
