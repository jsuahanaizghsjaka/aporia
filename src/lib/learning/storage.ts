import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/config";
import { stateSchema, type LearningState } from "./types";
import { initialLearningState } from "./selectors";
import { validateLearningWrite } from "../ai/contracts";
export function learningConfigured() {
  return !!(
    supabaseConfig() &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}
function adminClient() {
  const config = supabaseConfig();
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key)
    throw new Error("Сохранение занятий пока не подключено.");
  return createClient(config.url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function readLearning(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("learning_states")
    .select("data, version")
    .eq("user_id", userId)
    .maybeSingle();
  if (error)
    throw new Error("Не удалось прочитать учебную память. Попробуй позже.");
  return {
    state: data ? stateSchema.parse(data.data) : initialLearningState(),
    version: Number(data?.version ?? 0),
  };
}
export async function writeLearning(
  userId: string,
  version: number,
  state: LearningState,
) {
  const { data, error } = await adminClient().rpc("commit_learning_state", {
    _user_id: userId,
    _expected_version: version,
    _data: validateLearningWrite(state),
  });
  if (error) throw new Error("Не удалось сохранить занятие. Повтори действие.");
  return Number(data);
}
