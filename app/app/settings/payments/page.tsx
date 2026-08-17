import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { PaymentsSettingsView } from "./payments-view";

export const dynamic = "force-dynamic";

/** Cài đặt → Nhận thanh toán (ADR-0019 mục 6) — chỉ owner/admin sửa (RLS tenants_update). */
export default async function PaymentsSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: tenant }, member] = await Promise.all([
    supabase.from("tenants").select("bank_code, bank_account_no, bank_account_name").maybeSingle(),
    getCurrentMembership(supabase, user.id),
  ]);
  if (!tenant) redirect("/onboarding");

  const canManage = member?.role === "owner" || member?.role === "admin";

  return (
    <PaymentsSettingsView
      canManage={canManage}
      initial={{
        bankBin: tenant.bank_code,
        accountNo: tenant.bank_account_no,
        accountName: tenant.bank_account_name,
      }}
    />
  );
}
