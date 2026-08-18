import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { dateKeyInTimeZone, startOfWeekKey } from "@/lib/booking/schedule";
import { getCalendarBundle } from "./queries";
import { CalendarView } from "./calendar-view";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];
const DEFAULT_TZ = "Asia/Ho_Chi_Minh";

/** Server component: Màn Lịch (ADR-0009 mục 7 việc 4, thẻ design man-lich-hen.html). */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id, timezone").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  const role = member?.role ?? "";

  // "Hôm nay" PHẢI theo múi giờ TIỆM, không phải giờ máy chủ (Vercel chạy UTC)
  // — dùng `toISOString()` trần ở đây là ĐÚNG loại lỗi đã cắn mặt tiền 12/08:
  // từ 0h–7h giờ VN, server UTC vẫn đang ở "hôm qua".
  const todayKey = dateKeyInTimeZone(new Date().toISOString(), tenant.timezone ?? DEFAULT_TZ);
  const rawDate = typeof sp.date === "string" ? sp.date : todayKey;
  const focusDateKey = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayKey;
  const weekStartKey = startOfWeekKey(focusDateKey);

  const bundle = await getCalendarBundle(supabase, weekStartKey);

  return (
    <CalendarView
      bundle={bundle}
      focusDateKey={focusDateKey}
      todayKey={todayKey}
      currentUserId={user.id}
      canAssignOthers={MANAGE_ROLES.includes(role)}
      canManageAll={MANAGE_ROLES.includes(role)}
      // Khớp RLS appointments_insert (migration #83 v2_lich_hen_nen): mọi vai
      // TRỪ viewer — gate nút "+ Thêm lịch" (cùng lớp lỗi đã vá ở deals-board.tsx).
      canWrite={role !== "viewer"}
    />
  );
}
