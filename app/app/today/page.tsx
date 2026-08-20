import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { currentMonthVN, fetchKpiProgress } from "@/lib/kpi";
import { fetchTodayQueue } from "./types";
import { TodayView } from "./today-view";

export const dynamic = "force-dynamic";

/**
 * Vai được xem việc của CẢ TIỆM thay vì chỉ "của tôi" (khớp policy
 * activities/deals_select đã mở cho viewer từ migration #65 — "Chỉ xem" đọc
 * hết, không lọc theo người phụ trách). Tách riêng khỏi CAN_SETUP_ROLES bên
 * dưới: viewer xem được toàn tiệm nhưng KHÔNG có quyền bấm nút dựng tiệm.
 */
const SEE_ALL_ROLES = ["owner", "admin", "manager", "viewer"];
/** Vai có quyền dùng 2 nút "dựng tiệm" (cắm kênh/thêm khách) khi tiệm rỗng. */
const CAN_SETUP_ROLES = ["owner", "admin", "manager"];

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

  const member = await getCurrentMembership(supabase, user.id);
  const canSeeAll = SEE_ALL_ROLES.includes(member?.role ?? "");

  // KPI mục tiêu tháng (#59): tháng HIỆN TẠI giờ VN, tính ở server để render thuần
  const kpiMonth = currentMonthVN();

  // Staff luôn ở chế độ "của tôi": RLS đã khoanh activities/deals/contacts theo
  // người phụ trách, nhưng hộp thư dùng chung cả tiệm nên phải lọc thêm ở RPC.
  const [initialQueue, liveChannelsRes, contactsRes, kpiProgress] = await Promise.all([
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
    // Lọc `deleted_at`: số này chỉ dùng để hỏi "tiệm đã có khách nào chưa" —
    // đếm cả khách ĐÃ XOÁ thì tiệm thêm một khách thử rồi xoá đi sẽ không bao
    // giờ thấy lại khối hướng dẫn khởi động, dù danh sách khách đang trống.
    supabase.from("contacts").select("id", { count: "exact", head: true }).is("deleted_at", null),
    // Khối phụ — lỗi thì ẩn khối, KHÔNG kéo sập màn chính (hàng đợi việc)
    fetchKpiProgress(supabase, kpiMonth).catch(() => null),
  ]);
  // Chỉ chủ/quản lý thấy nhánh "tiệm chưa mở cửa": hai nút dẫn đi (cắm Live
  // Chat / thêm khách) là việc dựng tiệm — staff không có quyền vào Cài đặt
  // kênh, và contacts của staff bị RLS khoanh riêng nên đếm 0 không có nghĩa
  // là tiệm chưa có khách.
  const isBrandNew =
    CAN_SETUP_ROLES.includes(member?.role ?? "") &&
    (liveChannelsRes.count ?? 0) === 0 &&
    (contactsRes.count ?? 0) === 0;

  // Hồ sơ KPI mục 9, kết cục 4: CHƯA đặt mục tiêu cho mình → khối ẩn hẳn
  // (không hiện 0/0) — không mount card thì cũng khỏi poll vô ích.
  const myKpi =
    kpiProgress && kpiProgress.targets.some((t) => t.user_id === user.id)
      ? kpiProgress
      : null;

  return (
    <TodayView
      canSeeAll={canSeeAll}
      isBrandNew={isBrandNew}
      initialQueue={initialQueue}
      now={new Date().toISOString()}
      userId={user.id}
      kpiMonth={kpiMonth}
      myKpi={myKpi}
    />
  );
}
