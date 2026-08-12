import type { SupabaseClient } from "@supabase/supabase-js";
import { dateKeyInTimeZone, startOfWeekKey } from "@/lib/booking/schedule";
import { freeBlocksOfDay, getCalendarBundle } from "../calendar/queries";
import type { CalendarBundle } from "../calendar/types";

const DEFAULT_TZ = "Asia/Ho_Chi_Minh"; // khớp mặc định `tenants.timezone` (migration #80)

export type QuickBookingContext = {
  timezone: string;
  todayKey: string;
  hasHours: boolean;
  services: CalendarBundle["services"];
  resources: CalendarBundle["resources"];
  staff: CalendarBundle["staff"];
  freeBlocksToday: { startMin: number; endMin: number }[];
};

/**
 * Dữ liệu tối thiểu cho dialog "Đặt lịch từ chat" (ADR-0009 mục 7 việc 5, thẻ
 * design man-dat-lich-tu-chat.html) — CHỈ HÔM NAY, dùng lại nguyên
 * `getCalendarBundle`/`freeBlocksOfDay` của màn Lịch (D1: một nơi tính
 * "trống", không viết lại lần hai cho khung chat).
 *
 * Lấy timezone tiệm TRƯỚC rồi mới tính `todayKey` (không đoán tuần bằng giờ
 * máy khách) — nếu đoán sai tuần thì "hôm nay" có thể rơi ra ngoài 7 ngày mà
 * `getCalendarBundle` trả về.
 */
export async function fetchQuickBookingContext(supabase: SupabaseClient): Promise<QuickBookingContext> {
  const { data: tenant } = await supabase.from("tenants").select("timezone").maybeSingle();
  const timezone = (tenant?.timezone as string | null) ?? DEFAULT_TZ;
  const todayKey = dateKeyInTimeZone(new Date().toISOString(), timezone);

  const bundle = await getCalendarBundle(supabase, startOfWeekKey(todayKey));
  const today = bundle.days.find((d) => d.dateKey === todayKey);
  const freeBlocksToday = today ? freeBlocksOfDay(today, bundle.timezone) : [];

  return {
    timezone: bundle.timezone,
    todayKey,
    hasHours: bundle.hasBusinessHours,
    services: bundle.services,
    resources: bundle.resources,
    staff: bundle.staff,
    freeBlocksToday,
  };
}
