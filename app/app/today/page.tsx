import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchTodayQueue } from "./types";
import { TodayView } from "./today-view";

export const dynamic = "force-dynamic";

/** Vai được xem việc của CẢ TIỆM (khớp policy activities/deals/contacts_select). */
const SEE_ALL_ROLES = ["owner", "admin", "manager"];

/**
 * `/app/today` — "Hôm nay gọi ai": hàng đợi việc trong ngày của người bán
 * (US-S4 spec CRM §3). Toàn bộ 4 khối lấy 1 lần qua RPC today_queue()
 * (SECURITY INVOKER — RLS khoanh tenant + vai, migration #16).
 */
export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .maybeSingle();
  if (!tenant) redirect("/onboarding");

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const canSeeAll = SEE_ALL_ROLES.includes(member?.role ?? "");

  // Staff luôn ở chế độ "của tôi": RLS đã khoanh activities/deals/contacts theo
  // người phụ trách, nhưng hộp thư dùng chung cả tiệm nên phải lọc thêm ở RPC.
  const [initialQueue, liveChannelsRes, contactsRes] = await Promise.all([
    fetchTodayQueue(supabase, !canSeeAll),
    // Tiệm chưa mở cửa = chưa kênh CHẠY THẬT + chưa khách nào — CÙNG định nghĩa
    // isBrandNew của màn Tổng quan (app/app/page.tsx): kênh Live Chat mới bấm
    // Lưu chưa tính, phải có tin thật từ website (last_event_at, #23/#55);
    // các kênh khác (Zalo OA…) qua OAuth thật mới 'active' nên tính ngay.
    supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .or("type.neq.livechat,last_event_at.not.is.null"),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
  ]);
  // Chỉ chủ/quản lý thấy nhánh "tiệm chưa mở cửa": hai nút dẫn đi (cắm Live
  // Chat / thêm khách) là việc dựng tiệm — staff không có quyền vào Cài đặt
  // kênh, và contacts của staff bị RLS khoanh riêng nên đếm 0 không có nghĩa
  // là tiệm chưa có khách.
  const isBrandNew =
    canSeeAll &&
    (liveChannelsRes.count ?? 0) === 0 &&
    (contactsRes.count ?? 0) === 0;

  return (
    <TodayView
      canSeeAll={canSeeAll}
      isBrandNew={isBrandNew}
      initialQueue={initialQueue}
      now={new Date().toISOString()}
    />
  );
}
