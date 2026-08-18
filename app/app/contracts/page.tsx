import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import ContractsView from "./contracts-view";
import { layDanhSachGoi, layDanhSachHopDong, layDanhSachKhach } from "./queries";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

export async function generateMetadata() {
  const t = await getTranslations("contracts");
  return { title: t("title") };
}

export default async function ContractsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .maybeSingle();

  if (!member) redirect("/app");
  const canManage = MANAGE_ROLES.includes(member.role ?? "");

  let loadFailed = false;
  let contracts: Awaited<ReturnType<typeof layDanhSachHopDong>> = [];
  let packages: Awaited<ReturnType<typeof layDanhSachGoi>> = [];
  let contacts: Awaited<ReturnType<typeof layDanhSachKhach>> = [];

  try {
    [contracts, packages, contacts] = await Promise.all([
      layDanhSachHopDong(supabase),
      layDanhSachGoi(supabase),
      layDanhSachKhach(supabase),
    ]);
  } catch {
    loadFailed = true;
  }

  return (
    <ContractsView
      contracts={contracts}
      packages={packages}
      contacts={contacts}
      canManage={canManage}
      loadFailed={loadFailed}
    />
  );
}
