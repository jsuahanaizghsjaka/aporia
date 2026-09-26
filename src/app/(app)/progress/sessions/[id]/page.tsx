import { SessionScreen } from "@/components/aporia/learning-history";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SessionScreen id={id} />;
}
