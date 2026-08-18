import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDaysToDateKey,
  computeFreeBlocks,
  computeOpenRanges,
  dateKeyInTimeZone,
  minutesOfDayInTimeZone,
  weekdayOfDateKey,
} from "@/lib/booking/schedule";
import type { CalendarBundle, CalendarDay, StaffOption } from "./types";

const DEFAULT_TZ = "Asia/Ho_Chi_Minh"; // khớp mặc định `tenants.timezone` (migration #80)

/**
 * Tải mọi thứ màn Lịch cần cho MỘT TUẦN (Thứ 2 → Chủ nhật chứa `focusDateKey`),
 * dùng chung cho cả view ngày (điện thoại) lẫn view tuần (máy tính) — tránh
 * fetch hai lần cho cùng dữ liệu.
 *
 * Khoảng truy vấn CSDL RỘNG HƠN 1 ngày mỗi đầu (bù mọi lệch múi giờ, tối đa
 * UTC±14) rồi LỌC LẠI CHÍNH XÁC bằng `dateKeyInTimeZone` ở tầng ứng dụng —
 * cách này không cần tính offset tay (nguồn lỗi 12/08), chấp nhận quét dư vài
 * dòng đổi lấy đúng tuyệt đối. Với quy mô tiệm 2–100 người, phí đó không đáng kể.
 */
export async function getCalendarBundle(
  supabase: SupabaseClient,
  weekStartKey: string,
): Promise<CalendarBundle> {
  const weekDateKeys = Array.from({ length: 7 }, (_, i) => addDaysToDateKey(weekStartKey, i));
  const queryFromUtc = `${addDaysToDateKey(weekStartKey, -1)}T00:00:00Z`;
  const queryToUtc = `${addDaysToDateKey(weekStartKey, 8)}T00:00:00Z`;

  const [tenantRes, hoursRes, closuresRes, membersRes, profilesRes, resourcesRes, servicesRes, apptRes] =
    await Promise.all([
      supabase.from("tenants").select("id, timezone").maybeSingle(),
      supabase.from("business_hours").select("weekday, is_closed, open_time, close_time"),
      supabase
        .from("business_closures")
        .select("date_from, date_to, reason, is_full_day, open_time, close_time")
        .lte("date_from", weekDateKeys[6])
        .gte("date_to", weekDateKeys[0]),
      // KHÔNG embed `profiles(display_name)` ở đây: `tenant_members.user_id` có
      // FK trỏ `auth.users`, KHÔNG có FK trực tiếp tới `profiles` (khoá chính
      // của `profiles` cũng là `user_id`, nhưng PostgREST chỉ tự suy embed qua
      // FK trực tiếp). Embed như vậy khiến PostgREST trả lỗi "no relationship
      // found" mà code không kiểm `error` — kết quả: `staff` RỖNG một cách im
      // lặng, màn nhìn như đúng (không đỏ) nhưng ô chọn nhân viên trống trơn.
      // Bắt được khi tự bấm thử, không phải qua `tsc`/`eslint`. Đúng khuôn 2
      // truy vấn tách biệt của `app/app/deals/page.tsx` (`buildMemberOptions`).
      supabase.from("tenant_members").select("user_id, role, status").eq("status", "active"),
      // RLS tự giới hạn về đúng đồng nghiệp cùng tenant (khuôn deals/queries.ts) — không cần .in(ids).
      supabase.from("profiles").select("user_id, display_name"),
      supabase.from("resources").select("id, name, kind").eq("is_active", true).order("name"),
      // ADR-0019 mục 3 (migration #125): `items` chứa CẢ dịch vụ lẫn hàng hoá —
      // màn Lịch chỉ được thấy kind='service', và trạng thái tương đương
      // is_active cũ là status='active' (draft/discontinued không đặt được).
      supabase
        .from("items")
        .select("id, name, duration_minutes")
        .eq("kind", "service")
        .eq("status", "active")
        .order("sort_order"),
      supabase
        .from("appointments")
        .select(
          `id, contact_id, staff_user_id, resource_id, item_id, start_at, end_at, status, price_vnd, note, cancel_reason,
         contacts(full_name), resources(name), items(name)`,
        )
        .is("deleted_at", null)
        .gte("start_at", queryFromUtc)
        .lt("start_at", queryToUtc)
        .order("start_at"),
    ]);

  // Việc #169 — TÁCH "đọc hỏng" khỏi "không có dữ liệu". Chú thích ngay phía
  // trên đã ghi lại một lần bị đúng bệnh này: PostgREST trả lỗi, code không
  // kiểm, `staff` rỗng im lặng, "màn nhìn như đúng (không đỏ)". Lần đó chữa
  // triệu chứng (tách 2 truy vấn) chứ chưa chữa gốc (không ai kiểm lỗi).
  //
  // PHẢI ném — hỏng mà im là người dùng ra quyết định sai:
  //   · lịch hẹn: rỗng = "hôm nay không có khách" → tiệm bỏ lỡ khách thật
  //   · giờ mở cửa: rỗng = màn báo "chưa cài giờ" dù đã cài
  //   · ngày nghỉ: rỗng = ngày nghỉ hiện thành ngày mở → nhận đặt nhầm
  //   · nhân viên / tài nguyên / dịch vụ: rỗng = ô chọn trống, KHÔNG đặt được
  //     lịch mà chẳng biết vì sao — đúng ca đã xảy ra ở trên.
  // `app/error.tsx` sẽ hiện trang báo lỗi có nút thử lại.
  for (const [ten, res] of [
    ["lịch hẹn", apptRes], ["giờ mở cửa", hoursRes], ["ngày nghỉ", closuresRes],
    ["nhân viên", membersRes], ["tài nguyên", resourcesRes], ["dịch vụ", servicesRes],
  ] as const) {
    if (res.error) throw new Error(`Không đọc được ${ten}: ${res.error.message}`);
  }
  // KHÔNG ném: `profilesRes` chỉ là TÊN HIỂN THỊ (hỏng thì thiếu tên, lịch vẫn
  // dùng được — thà thiếu một nhãn còn hơn cả màn thành trang lỗi), và
  // `tenantRes` đã có sẵn múi giờ mặc định phía dưới.

  const tenant = tenantRes.data as { id: string; timezone: string | null } | null;
  const timezone = tenant?.timezone ?? DEFAULT_TZ;

  const displayNameByUserId = new Map(
    ((profilesRes.data ?? []) as { user_id: string; display_name: string | null }[]).map((p) => [
      p.user_id,
      p.display_name,
    ]),
  );
  const staff: StaffOption[] = ((membersRes.data ?? []) as { user_id: string }[]).map((m) => ({
    userId: m.user_id,
    displayName: displayNameByUserId.get(m.user_id)?.trim() || "Chưa đặt tên",
  }));

  const staffNameByUserId = new Map(staff.map((s) => [s.userId, s.displayName]));

  type ApptRow = {
    id: string;
    contact_id: string;
    staff_user_id: string;
    resource_id: string | null;
    item_id: string | null;
    start_at: string;
    end_at: string;
    status: string;
    price_vnd: number;
    note: string | null;
    cancel_reason: string | null;
    contacts: { full_name: string } | null;
    resources: { name: string } | null;
    items: { name: string } | null;
  };
  const allAppointments = ((apptRes.data ?? []) as unknown as ApptRow[]).map((a) => ({
    id: a.id,
    contactId: a.contact_id,
    contactName: a.contacts?.full_name ?? "Khách",
    staffUserId: a.staff_user_id,
    staffName: staffNameByUserId.get(a.staff_user_id) ?? "—",
    resourceId: a.resource_id,
    resourceName: a.resources?.name ?? null,
    serviceId: a.item_id,
    serviceName: a.items?.name ?? null,
    startAt: a.start_at,
    endAt: a.end_at,
    status: a.status as CalendarBundle["days"][number]["appointments"][number]["status"],
    priceVnd: Number(a.price_vnd ?? 0),
    note: a.note,
    cancelReason: a.cancel_reason,
  }));

  const hoursByWeekday = new Map<number, { is_closed: boolean; open_time: string | null; close_time: string | null }[]>();
  for (const h of hoursRes.data ?? []) {
    const list = hoursByWeekday.get(h.weekday as number) ?? [];
    list.push(h as never);
    hoursByWeekday.set(h.weekday as number, list);
  }
  const closures = (closuresRes.data ?? []) as {
    date_from: string;
    date_to: string;
    reason: string;
    is_full_day: boolean;
    open_time: string | null;
    close_time: string | null;
  }[];

  const days: CalendarDay[] = weekDateKeys.map((dateKey) => {
    const weekday = weekdayOfDateKey(dateKey);
    const closure = closures.find((c) => dateKey >= c.date_from && dateKey <= c.date_to) ?? null;
    const openRanges = computeOpenRanges(hoursByWeekday.get(weekday) ?? [], closure);
    const dayAppointments = allAppointments.filter((a) => dateKeyInTimeZone(a.startAt, timezone) === dateKey);
    return {
      dateKey,
      weekday,
      closureReason: closure?.is_full_day ? closure.reason : null,
      openRanges,
      appointments: dayAppointments,
    };
  });

  return {
    timezone,
    hasBusinessHours: (hoursRes.data ?? []).length > 0,
    staff,
    resources: (resourcesRes.data ?? []).map((r) => ({ id: r.id as string, name: r.name as string, kind: r.kind as string })),
    services: (servicesRes.data ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      durationMinutes: s.duration_minutes as number,
    })),
    days,
  };
}

/** Khoảng TRỐNG của một ngày (đơn vị "cả tiệm", xem giới hạn ở `computeFreeBlocks`) — quy về phút trong ngày theo tz tiệm. */
export function freeBlocksOfDay(day: CalendarDay, timezone: string) {
  const busy = day.appointments
    .filter((a) => a.status === "booked" || a.status === "arrived")
    .map((a) => ({
      startMin: minutesOfDayInTimeZone(a.startAt, timezone),
      endMin: minutesOfDayInTimeZone(a.endAt, timezone),
    }));
  return computeFreeBlocks(day.openRanges, busy);
}
