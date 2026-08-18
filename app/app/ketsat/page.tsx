import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import KetsatView from "./ketsat-view";
import { layDanhSachChot, layCongNoNCC, layActualCashCaTruoc } from "./queries";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

export async function generateMetadata() {
  const t = await getTranslations("ketsat");
  return { title: t("title") };
}

export default async function KetsatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .maybeSingle();

  if (!MANAGE_ROLES.includes(member?.role ?? "")) redirect("/app");

  let loadFailed = false;
  let closings: Awaited<ReturnType<typeof layDanhSachChot>> = [];
  let debts: Awaited<ReturnType<typeof layCongNoNCC>> = [];
  let suggestedOpening = 0;

  try {
    [closings, debts, suggestedOpening] = await Promise.all([
      layDanhSachChot(supabase),
      layCongNoNCC(supabase),
      layActualCashCaTruoc(supabase).then((v) => v ?? 0),
    ]);
  } catch {
    loadFailed = true;
  }

  return (
    <KetsatView
      closings={closings}
      debts={debts}
      suggestedOpening={suggestedOpening}
      loadFailed={loadFailed}
    />
  );
}
