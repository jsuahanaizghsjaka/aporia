import { redirectSignedInUser } from "@/lib/supabase/session";
import { supabaseConfig } from "@/lib/supabase/config";
import { Landing } from "@/components/aporia/landing";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Aporia: ментор для твоей учебной цели",
  description:
    "Aporia помогает определить и сохранить учебную цель. Первый доступный практический трек — Python backend.",
  openGraph: {
    title: "Aporia: начни со своей цели",
    description:
      "Выбери направление и сохрани цель. Первый практический трек — Python backend; прогресс подтверждается решениями задач.",
    type: "website",
    locale: "ru_RU",
  },
};
export const dynamic = "force-dynamic";
export default async function Home() {
  await redirectSignedInUser();
  return <Landing configured={!!supabaseConfig()} />;
}
