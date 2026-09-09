import type { LearnerProfile } from "@/lib/profile/schema";
export type ProfileRecord = {
  id: string;
  data: LearnerProfile;
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
};
export const DATABASE_MODULE_STATUS =
  "Profiles, messages, private avatars and RLS migration prepared; apply to Supabase before use.";
