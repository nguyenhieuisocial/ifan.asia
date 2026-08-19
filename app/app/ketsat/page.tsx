import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
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

  // ⚠️ KHÔNG tự viết `.from("tenant_members").select("role").maybeSingle()`.
  // Truy vấn đó KHÔNG lọc user_id, mà RLS cho một thành viên thấy TẤT CẢ thành
  // viên cùng tiệm ⇒ tiệm từ 2 người trở lên thì maybeSingle() trả LỖI, `member`
  // thành null, và màn này chặn luôn CẢ CHỦ TIỆM. Đo trên dữ liệu thật 19/08:
  // đã có một tiệm 3 thành viên, tức lỗi đang xảy ra chứ không phải giả định.
  // Helper còn lọc `status='active'` + hạn phiên hỗ trợ (mục 69, ADR-0006).
  const member = await getCurrentMembership(supabase, user.id);

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
