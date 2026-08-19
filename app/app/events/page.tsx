import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import EventsView from "./events-view";
import { layDuLieuSuKien } from "./queries";
import type { EventsData } from "./types";

export const dynamic = "force-dynamic";

/**
 * Ai VÀO được màn Sự kiện marketing.
 *
 * ĐỌC: cả tiệm — khớp `campaigns_select` (migration #171), vì nhân viên đứng
 * quầy phải biết đang chạy ưu đãi gì mà trả lời khách.
 * SỬA / GỬI TIN: quản lý trở lên — đây là chỗ cho đi tiền và chạm vào toàn bộ
 * tệp khách.
 */
const MANAGE_ROLES = ["owner", "admin", "manager"];

export async function generateMetadata() {
  const t = await getTranslations("events");
  return { title: t("title") };
}

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const member = await getCurrentMembership(supabase, user.id);
  const role = member?.role ?? "";
  if (!role) redirect("/app");
  const canManage = MANAGE_ROLES.includes(role);

  let loadFailed = false;
  let data: EventsData = {
    campaigns: [],
    vouchers: [],
    sends: [],
    summaries: [],
    contacts: [],
    consentTally: { granted: 0, unknown: 0, withdrawn: 0 },
  };
  try {
    data = await layDuLieuSuKien(supabase, { canManage });
  } catch {
    // Danh sách rỗng nghĩa là "chưa chạy đợt nào". Để lỗi mạng đội lốt câu đó là
    // đẩy chủ tiệm đi dựng lại một chiến dịch đang chạy sẵn.
    loadFailed = true;
  }

  return (
    <EventsView
      campaigns={data.campaigns}
      vouchers={data.vouchers}
      sends={data.sends}
      summaries={data.summaries}
      contacts={data.contacts}
      consentTally={data.consentTally}
      canManage={canManage}
      loadFailed={loadFailed}
    />
  );
}
