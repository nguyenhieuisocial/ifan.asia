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

  const [tenantRes, hoursRes, closuresRes, staffRes, resourcesRes, servicesRes, apptRes] =
    await Promise.all([
      supabase.from("tenants").select("id, timezone").maybeSingle(),
      supabase.from("business_hours").select("weekday, is_closed, open_time, close_time"),
      supabase
        .from("business_closures")
        .select("date_from, date_to, reason, is_full_day, open_time, close_time")
        .lte("date_from", weekDateKeys[6])
        .gte("date_to", weekDateKeys[0]),
      // #214: nguồn thợ = employees CÒN LÀM (phủ CẢ thợ KHÔNG có tài khoản),
      // qua RPC bookable_staff (SECURITY DEFINER, migration #230). Đọc thẳng
      // bảng employees không được: RLS chỉ cho owner/admin thấy cả tiệm (bảng
      // chứa lương) — manager/staff chạy lịch sẽ không thấy đồng nghiệp. RPC
      // chỉ trả id/tên/user_id, không lộ lương.
      supabase.rpc("bookable_staff"),
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
          `id, contact_id, staff_user_id, staff_employee_id, resource_id, item_id, start_at, end_at, status, price_vnd, note, cancel_reason,
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
    ["nhân viên", staffRes], ["tài nguyên", resourcesRes], ["dịch vụ", servicesRes],
  ] as const) {
    if (res.error) throw new Error(`Không đọc được ${ten}: ${res.error.message}`);
  }
  // KHÔNG ném: `tenantRes` đã có sẵn múi giờ mặc định phía dưới.

  const tenant = tenantRes.data as { id: string; timezone: string | null } | null;
  const timezone = tenant?.timezone ?? DEFAULT_TZ;

  // #214: danh sách thợ = employees CÒN LÀM (qua RPC bookable_staff), phủ CẢ
  // thợ KHÔNG có tài khoản (user_id null).
  const staff: StaffOption[] = ((staffRes.data ?? []) as { id: string; full_name: string; user_id: string | null }[]).map(
    (e) => ({
      employeeId: e.id,
      userId: e.user_id,
      displayName: e.full_name?.trim() || "Chưa đặt tên",
    }),
  );

  const staffNameByEmployeeId = new Map(staff.map((s) => [s.employeeId, s.displayName]));
  const staffNameByUserId = new Map(
    staff.filter((s) => s.userId).map((s) => [s.userId as string, s.displayName]),
  );

  type ApptRow = {
    id: string;
    contact_id: string;
    staff_user_id: string | null;
    staff_employee_id: string | null;
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
    staffEmployeeId: a.staff_employee_id,
    staffUserId: a.staff_user_id,
    staffName:
      (a.staff_employee_id ? staffNameByEmployeeId.get(a.staff_employee_id) : undefined) ??
      (a.staff_user_id ? staffNameByUserId.get(a.staff_user_id) : undefined) ??
      "—",
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
