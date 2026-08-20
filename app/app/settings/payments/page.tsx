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

  const [{ data: tenant }, member, { data: vat }] = await Promise.all([
    supabase.from("tenants").select("id, bank_code, bank_account_no, bank_account_name").maybeSingle(),
    getCurrentMembership(supabase, user.id),
    supabase.from("tax_settings").select("enabled, rate").maybeSingle(),
  ]);
  if (!tenant) redirect("/onboarding");

  const canManage = member?.role === "owner" || member?.role === "admin";

  // SePay (migration #243) — chỉ owner/admin đọc được cả trạng thái lẫn sổ nhận
  // (RLS `bank_transactions_select`). Vai khác thì không hỏi, đỡ một lượt gọi.
  const [sepayRes, txRes] = canManage
    ? await Promise.all([
        supabase.rpc("sepay_status"),
        supabase
          .from("bank_transactions")
          .select("id, amount_vnd, content, transaction_date, order_code, order_id, match_status, transfer_type, reference_code")
          .order("received_at", { ascending: false })
          .limit(20),
      ])
    : [{ data: null }, { data: null }];

  return (
    <PaymentsSettingsView
      canManage={canManage}
      initial={{
        bankBin: tenant.bank_code,
        accountNo: tenant.bank_account_no,
        accountName: tenant.bank_account_name,
      }}
      vat={{ enabled: vat?.enabled ?? false, rate: vat?.rate != null ? Number(vat.rate) : 0 }}
      sepay={{
        tenantId: tenant.id as string,
        connected: sepayRes.data === true,
        transactions: (txRes.data ?? []).map((r) => ({
          id: r.id as string,
          amountVnd: Number(r.amount_vnd),
          content: (r.content as string | null) ?? null,
          transactionDate: r.transaction_date as string,
          orderCode: (r.order_code as string | null) ?? null,
          orderId: (r.order_id as string | null) ?? null,
          matchStatus: r.match_status as string,
          transferType: r.transfer_type as string,
          referenceCode: (r.reference_code as string | null) ?? null,
        })),
      }}
    />
  );
}
