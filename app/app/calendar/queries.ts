import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDaysToDateKey,
  computeFreeBlocks,
  computeOpenRanges,
  dateKeyInTimeZone,
  minutesOfDayInTimeZone,
  weekdayOfDateKey,
} from "@/lib/booking/schedule";
import type { Appointment, CalendarBundle, CalendarDay, StaffOption } from "./types";

const DEFAULT_TZ = "Asia/Ho_Chi_Minh"; // khớp mặc định `tenants.timezone` (migration #80)

/**
 * Tải mọi thứ màn Lịch cần cho MỘT DẢI NGÀY bất kỳ (`fromKey` → `toKey`, tính
 * cả hai đầu), dùng chung cho mọi chế độ xem — Ngày, Tuần, Tháng, Danh sách.
 *
 * Trước 21/08 hàm này khoá cứng đúng 7 ngày. Chế độ Tháng cần tới 42 ô lưới và
 * chế độ Danh sách cần 30 ngày tới, nên dải phải mở ra. Vẫn CHỈ MỘT lượt đọc:
 * nhận thêm dải rộng còn hơn gọi hai lần cho cùng một thứ.
 *
 * Khoảng truy vấn CSDL RỘNG HƠN 1 ngày mỗi đầu (bù mọi lệch múi giờ, tối đa
 * UTC±14) rồi LỌC LẠI CHÍNH XÁC bằng `dateKeyInTimeZone` ở tầng ứng dụng —
 * cách này không cần tính offset tay (nguồn lỗi 12/08), chấp nhận quét dư vài
 * dòng đổi lấy đúng tuyệt đối. Với quy mô tiệm 2–100 người, phí đó không đáng kể.
 */
export async function getCalendarBundle(
  supabase: SupabaseClient,
  fromKey: string,
  toKey: string,
): Promise<CalendarBundle> {
  const soNgay = Math.max(1, Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000) + 1);
  const weekDateKeys = Array.from({ length: soNgay }, (_, i) => addDaysToDateKey(fromKey, i));
  const queryFromUtc = `${addDaysToDateKey(fromKey, -1)}T00:00:00Z`;
  const queryToUtc = `${addDaysToDateKey(toKey, 2)}T00:00:00Z`;

  const [tenantRes, hoursRes, closuresRes, staffRes, resourcesRes, servicesRes, apptRes] =
    await Promise.all([
      supabase.from("tenants").select("id, timezone").maybeSingle(),
      supabase.from("business_hours").select("weekday, is_closed, open_time, close_time"),
      supabase
        .from("business_closures")
        .select("date_from, date_to, reason, is_full_day, open_time, close_time")
        .lte("date_from", weekDateKeys[weekDateKeys.length - 1])
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

/**
 * TÌM BUỔI HẸN theo tên khách · tên dịch vụ · ghi chú — trên TOÀN BỘ lịch sử,
 * không giới hạn trong dải đang xem.
 *
 * "Chị Lan hẹn hôm nào ấy nhỉ" là câu hỏi có thật, và câu trả lời có thể nằm ở
 * tháng trước. Lọc trong dải đang xem thì tìm kiếm chỉ là bộ lọc, không phải
 * tìm kiếm — và người dùng sẽ tin là "không có" trong khi có.
 *
 * ⚠️ Ba lượt đọc riêng chứ không một câu `.or()`: PostgREST không lọc OR vắt
 *   qua nhiều bảng nhúng được. Ba lượt rồi gộp lại đúng hơn là một câu khéo mà
 *   âm thầm bỏ sót một nhánh.
 *
 * ⚠️ KHÔNG tìm theo tên THỢ. Thợ đến từ `employees` qua RPC nên không nối vào
 *   câu này được, và lọc theo thợ đã có chỗ đúng của nó là dãy bật/tắt bên trái.
 *   Thà thiếu một nhánh và nói rõ, còn hơn nối tạm rồi ra kết quả nửa vời.
 *
 * Ký tự đặc biệt của LIKE (`%` `_` `\`) được thoát trước khi ghép — không thì
 * gõ "50%" ra toàn bộ lịch hẹn của tiệm.
 */
export async function timLichHen(supabase: SupabaseClient, tuKhoa: string) {
  const q = `%${tuKhoa.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const CHON = `id, contact_id, staff_user_id, staff_employee_id, resource_id, item_id, start_at, end_at, status, price_vnd, note, cancel_reason,
     contacts(full_name), resources(name), items(name)`;

  const [theoKhach, theoDichVu, theoGhiChu] = await Promise.all([
    supabase.from("appointments").select(`${CHON.replace("contacts(full_name)", "contacts!inner(full_name)")}`)
      .is("deleted_at", null).ilike("contacts.full_name", q).order("start_at", { ascending: false }).limit(40),
    supabase.from("appointments").select(`${CHON.replace("items(name)", "items!inner(name)")}`)
      .is("deleted_at", null).ilike("items.name", q).order("start_at", { ascending: false }).limit(40),
    supabase.from("appointments").select(CHON)
      .is("deleted_at", null).ilike("note", q).order("start_at", { ascending: false }).limit(40),
  ]);

  for (const [ten, res] of [
    ["theo tên khách", theoKhach], ["theo dịch vụ", theoDichVu], ["theo ghi chú", theoGhiChu],
  ] as const) {
    if (res.error) throw new Error(`Không tìm được ${ten}: ${res.error.message}`);
  }

  const theoId = new Map<string, Record<string, unknown>>();
  for (const res of [theoKhach, theoDichVu, theoGhiChu]) {
    for (const h of (res.data ?? []) as unknown as Record<string, unknown>[]) {
      theoId.set(h.id as string, h);
    }
  }
  return [...theoId.values()]
    .sort((a, b) => String(b.start_at).localeCompare(String(a.start_at)))
    .slice(0, 50)
    .map(hangThanhAppointment);
}

/** Một hàng `appointments` (đã nhúng contacts/resources/items) → kiểu dùng ở giao diện. */
function hangThanhAppointment(a: Record<string, unknown>): Appointment {
  const nhung = (k: string, f: string) => {
    const v = a[k] as Record<string, unknown> | Record<string, unknown>[] | null;
    const o = Array.isArray(v) ? v[0] : v;
    return (o?.[f] as string | undefined) ?? null;
  };
  return {
    id: a.id as string,
    contactId: a.contact_id as string,
    contactName: nhung("contacts", "full_name") ?? "Khách",
    staffEmployeeId: (a.staff_employee_id as string | null) ?? null,
    staffUserId: (a.staff_user_id as string | null) ?? null,
    // Tên thợ điền ở tầng giao diện (danh sách thợ đã có sẵn ở đó) — câu tìm
    // này không nối được bảng employees, xem ghi chú của `timLichHen`.
    staffName: "—",
    resourceId: (a.resource_id as string | null) ?? null,
    resourceName: nhung("resources", "name"),
    serviceId: (a.item_id as string | null) ?? null,
    serviceName: nhung("items", "name"),
    startAt: a.start_at as string,
    endAt: a.end_at as string,
    status: a.status as Appointment["status"],
    priceVnd: Number(a.price_vnd ?? 0),
    note: (a.note as string | null) ?? null,
    cancelReason: (a.cancel_reason as string | null) ?? null,
  };
}
