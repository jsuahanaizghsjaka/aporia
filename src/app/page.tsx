import { redirectSignedInUser } from "@/lib/supabase/session";
import { supabaseConfig } from "@/lib/supabase/config";
import { Landing } from "@/components/aporia/landing";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Персональный ментор по Python backend",
  description:
    "Aporia помнит твою цель, строит маршрут обучения и помогает освоить Python backend через практику и собственный проект.",
  openGraph: {
    title: "Aporia: твой следующий шаг в Python backend",
    description:
      "Знакомство, персональный маршрут, практика и собственный проект. Прогресс подтверждается решениями задач.",
    type: "website",
    locale: "ru_RU",
  },
};
export const dynamic = "force-dynamic";
export default async function Home() {
  await redirectSignedInUser();
  return <Landing configured={!!supabaseConfig()} />;
}
