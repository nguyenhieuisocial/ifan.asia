"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ARRIVABLE_STATUSES, CANCEL_REASONS, COMPLETABLE_STATUSES, EDITABLE_STATUSES } from "./types";
import type { AppointmentStatus } from "./types";

/**
 * Màn Lịch (ADR-0009 mục 7 việc 4, thẻ design man-lich-hen.html).
 *
 * QUYỀN: không siết thêm ở đây — RLS `appointments_insert`/`_update`
 * (migration #83) đã đúng luật: owner/admin/manager thao tác mọi lịch,
 * `staff` chỉ thao tác lịch có `staff_user_id = chính họ`, `viewer` bị chặn
 * cả hai chiều. Đây là 2 trong 7 ca nghiệm thu ADR mục 8 — không cần thêm
 * lớp kiểm ở Server Action vì sẽ chỉ là bản sao (D2: hai nơi enforce cùng một
 * luật là hai nơi có thể LỆCH nhau khi một bên sửa mà bên kia quên).
 */


type ActionResult = { error: string | null; appointmentId?: string };

/**
 * "23P01" = exclusion_violation. Hai ràng buộc EXCLUDE (migration #83) là
 * CHỐT CHẶN THẬT — đây chỉ dịch mã lỗi CSDL trả về thành câu người đọc được,
 * đúng khuôn thẻ design: "Khung ... vừa được giữ mất, chọn giờ khác nhé".
 * KHÔNG kiểm trùng ở tầng này trước khi insert (đó là cách làm SAI — hai
 * client cùng đọc "còn trống" trong khoảnh khắc rồi cùng ghi, kiểm ở web
 * không chặn được — ADR-0009 mục 6 + thẻ design "3 luật cứng").
 */
function mapDbError(err: { code?: string; message: string; constraint?: string }): string {
  if (err.code === "23P01") {
    if (err.constraint === "appointments_no_overlap_staff") return "conflict_staff";
    if (err.constraint === "appointments_no_overlap_resource") return "conflict_resource";
    return "conflict_time";
  }
  if (/row-level security/i.test(err.message)) return "forbidden";
  if (/violates check constraint/i.test(err.message)) return "invalid_input";
  return "save_failed";
}

async function requireAuth(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | { ok: false; error: "not_authenticated" }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  return { ok: true, supabase, userId: user.id };
}

function revalidateCalendar() {
  revalidatePath("/app/calendar");
}

/**
 * #214: từ employeeId (danh tính CHUẨN của người làm ca) suy ra user_id để ghi
 * kèm — staff_user_id vẫn cần cho phép "staff sửa ca của mình" (RLS
 * appointments_*), và null nếu thợ KHÔNG có tài khoản. Đi qua RPC bookable_staff
 * (SECURITY DEFINER, migration #230) vừa để đọc được (RLS employees chặn
 * manager) vừa để XÁC MINH employee thuộc tiệm đang mở — không tin thẳng id
 * client gửi lên. Trả { ok:false } nếu employee không thuộc tiệm ⇒ chặn ghi.
 */
async function resolveStaff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  staffEmployeeId: string,
): Promise<{ ok: true; userId: string | null } | { ok: false }> {
  const { data, error } = await supabase.rpc("bookable_staff");
  if (error || !data) return { ok: false };
  const row = (data as { id: string; user_id: string | null }[]).find((e) => e.id === staffEmployeeId);
  if (!row) return { ok: false };
  return { ok: true, userId: row.user_id };
}

/**
 * Cảnh báo đặt-ngoài-giờ (ADR-0009 mục 8: "Đặt lịch ngoài giờ mở cửa / trúng
 * ngày nghỉ -> Cảnh báo rõ, KHÔNG im lặng cho qua" — và KHÔNG chặn, đặt ngoài
 * giờ là chuyện có thật ở tiệm nhỏ). Gọi TRƯỚC khi lưu để dialog hiện cảnh
 * báo ngay khi chọn giờ, không đợi đến lúc bấm Lưu mới biết.
 */
export async function checkAppointmentHours(
  startAt: string,
  endAt: string,
): Promise<
  | { ok: true; reason?: "hours_not_set" }
  | { ok: false; reason: "crosses_midnight" | "closure" | "closure_hours" | "day_closed" | "outside_hours"; closureReason?: string; openTime?: string; closeTime?: string }
  | { ok: null }
> {
  const auth = await requireAuth();
  if (!auth.ok) return { ok: null };
  const { data, error } = await auth.supabase.rpc("appointment_hours_warning", {
    p_start: startAt,
    p_end: endAt,
  });
  if (error || !data) return { ok: null };
  return data as never;
}

const createSchema = z.object({
  contactId: z.uuid(),
  staffEmployeeId: z.uuid(),
  resourceId: z.uuid().nullable(),
  serviceId: z.uuid().nullable(),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  priceVnd: z.number().int().min(0).max(1_000_000_000),
  note: z.string().trim().max(500).nullable(),
  // "chat" | "calendar" — cột `source` (migration #83) CHECK đúng 2 giá trị
  // này để biết lịch đến từ đâu (đo hiệu quả cửa vào chính theo ADR-0009 mục
  // 7 việc 5). Bắt buộc truyền tường minh ở MỌI nơi gọi — không đặt default
  // ngầm để tránh một nơi gọi quên truyền mà không ai biết đang ghi sai nguồn.
  source: z.enum(["chat", "calendar"]),
});

export async function createAppointment(input: z.infer<typeof createSchema>): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  if (parsed.data.endAt <= parsed.data.startAt) return { error: "invalid_time_range" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data: tenant } = await auth.supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "not_found" };

  const staff = await resolveStaff(auth.supabase, parsed.data.staffEmployeeId);
  if (!staff.ok) return { error: "invalid_input" };

  const { data, error } = await auth.supabase
    .from("appointments")
    .insert({
      tenant_id: tenant.id,
      contact_id: parsed.data.contactId,
      staff_employee_id: parsed.data.staffEmployeeId,
      staff_user_id: staff.userId, // null với thợ không tài khoản; RLS insert cho owner/admin/manager qua nhánh vai
      resource_id: parsed.data.resourceId,
      item_id: parsed.data.serviceId, // cột CSDL đổi tên ở migration #125 (ADR-0019 mục 3); giữ tên field TS "serviceId" — booking vẫn nói ngôn ngữ dịch vụ
      start_at: parsed.data.startAt,
      end_at: parsed.data.endAt,
      price_vnd: parsed.data.priceVnd,
      note: parsed.data.note,
      source: parsed.data.source,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (error) return { error: mapDbError(error) };
  revalidateCalendar();
  return { error: null, appointmentId: data.id as string };
}

const rescheduleSchema = z.object({
  id: z.uuid(),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
});

/**
 * Đổi giờ (kéo-thả trên máy tính, hoặc dialog trên điện thoại) — vẫn qua đúng 2 EXCLUDE.
 *
 * Chỉ đổi được giờ của ca CÒN SỐNG (`EDITABLE_STATUSES` = booked/arrived) và
 * chưa vào thùng rác. Ca đã xong/đã huỷ/khách không tới là lịch sử: dời giờ một
 * buổi đã xong là viết lại cái đã xảy ra, và giờ mới còn đi giữ chỗ của người
 * khác qua hai ràng buộc EXCLUDE.
 *
 * Lọc NGAY TRONG câu lệnh chứ không đọc-rồi-ghi (khuôn `updateAppointment`):
 * giữa hai lệnh là đúng khoảng người khác vừa bấm Xong/Huỷ chen vào.
 * `.select("id")` + đếm dòng để 0 dòng thành lời báo, không im lặng coi như xong.
 */
export async function rescheduleAppointment(input: z.infer<typeof rescheduleSchema>): Promise<ActionResult> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  if (parsed.data.endAt <= parsed.data.startAt) return { error: "invalid_time_range" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("appointments")
    .update({ start_at: parsed.data.startAt, end_at: parsed.data.endAt })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .in("status", EDITABLE_STATUSES)
    .select("id");

  if (error) return { error: mapDbError(error) };
  if (!data || data.length === 0) return { error: "requires_active" };
  revalidateCalendar();
  return { error: null };
}

const updateSchema = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  staffEmployeeId: z.uuid(),
  resourceId: z.uuid().nullable(),
  serviceId: z.uuid().nullable(),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  priceVnd: z.number().int().min(0).max(1_000_000_000),
  note: z.string().trim().max(500).nullable(),
});

/**
 * Sửa một lịch ĐÃ ĐẶT — đủ trường như lúc tạo (khách, người làm, dịch vụ, tài
 * nguyên, giờ, giá, ghi chú). Trước việc này chỉ đổi được GIỜ
 * (`rescheduleAppointment`), nên đặt nhầm dịch vụ / nhầm người / nhầm phòng /
 * gõ sai giá chỉ còn đường huỷ-rồi-đặt-lại — mà huỷ ghi hẳn một phiếu huỷ có lý
 * do vào lịch sử rồi chảy thẳng vào báo cáo. Sửa được tại chỗ là để KHÔNG phải
 * bịa ra một lần huỷ không có thật.
 *
 * KHÔNG đụng `status` / `source` / `cancel_reason`: mỗi thứ đã có đường riêng
 * (markArrived/markDone/markNoShow, cancelAppointment) — sửa thêm ở đây là mở
 * đường thứ hai cho cùng một việc (D2).
 *
 * Lọc `status` NGAY TRONG câu lệnh chứ không đọc-rồi-ghi: giữa lúc màn vẽ nút
 * Sửa và lúc bấm Lưu, người khác có thể vừa bấm Xong/Huỷ — kiểm ở hai bước tách
 * rời là để lọt đúng khoảng đó. `.select("id")` để BIẾT có dòng nào đổi thật
 * không; 0 dòng ⇒ ca không còn sửa được (hoặc đã vào thùng rác / RLS chặn), phải
 * báo ra chứ không im lặng coi như đã lưu.
 *
 * Giờ/người/tài nguyên mới vẫn đi qua đúng 2 ràng buộc EXCLUDE (migration #83):
 * chúng phủ cả UPDATE chứ không riêng INSERT, nên `mapDbError` dịch 23P01 thành
 * câu người đọc được y như lúc tạo.
 */
export async function updateAppointment(input: z.infer<typeof updateSchema>): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  if (parsed.data.endAt <= parsed.data.startAt) return { error: "invalid_time_range" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const staff = await resolveStaff(auth.supabase, parsed.data.staffEmployeeId);
  if (!staff.ok) return { error: "invalid_input" };

  const { data, error } = await auth.supabase
    .from("appointments")
    .update({
      contact_id: parsed.data.contactId,
      staff_employee_id: parsed.data.staffEmployeeId,
      staff_user_id: staff.userId,
      resource_id: parsed.data.resourceId,
      item_id: parsed.data.serviceId, // cột đổi tên ở migration #125 — xem chú thích createAppointment
      start_at: parsed.data.startAt,
      end_at: parsed.data.endAt,
      price_vnd: parsed.data.priceVnd,
      note: parsed.data.note,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .in("status", EDITABLE_STATUSES)
    .select("id");

  if (error) return { error: mapDbError(error) };
  if (!data || data.length === 0) return { error: "not_editable" };
  revalidateCalendar();
  return { error: null };
}

/** Khách tới: chuyển sang "đang làm". */
export async function markArrived(id: string): Promise<ActionResult> {
  return updateStatus(id, "arrived");
}

/**
 * Xong việc: chuyển sang "hoàn tất" — VÀ phát một phiếu hỏi khách hài lòng
 * (mảng csatQc). Phiếu là việc PHỤ: phát hỏng thì buổi hẹn vẫn phải được ghi
 * nhận là xong, nhưng lỗi phải vào log chứ không nuốt trong im lặng (mục #169).
 */
export async function markDone(id: string): Promise<ActionResult> {
  const ket_qua = await updateStatus(id, "done");
  if (ket_qua.error) return ket_qua;
  await phatPhieuDanhGia(id);
  return ket_qua;
}

/**
 * Tạo phiếu đánh giá cho lịch vừa xong.
 *
 * - `tenant_id` lấy từ chính dòng lịch hẹn (RLS chỉ trả lịch của tiệm đang mở),
 *   không đoán từ claim.
 * - `on conflict do nothing` + index unique (migration #156): bấm "Hoàn thành"
 *   nhiều lần vẫn chỉ một phiếu, không sinh link thừa gửi cho khách.
 * - KHÔNG gọi `.select()` sau insert: vai `staff` được GHI phiếu nhưng không
 *   được ĐỌC (policy select chỉ cho owner/admin/manager) — xin trả về dòng vừa
 *   ghi sẽ làm cả lệnh hỏng dù đã ghi xong.
 */
async function phatPhieuDanhGia(appointmentId: string): Promise<void> {
  const auth = await requireAuth();
  if (!auth.ok) return;

  const { data: lich } = await auth.supabase
    .from("appointments")
    .select("tenant_id")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!lich?.tenant_id) return;

  const { error } = await auth.supabase
    .from("satisfaction_surveys")
    .upsert(
      { tenant_id: lich.tenant_id, appointment_id: appointmentId },
      { onConflict: "appointment_id", ignoreDuplicates: true },
    );
  if (error) {
    console.error("[csat] không phát được phiếu đánh giá:", error.message);
  }
}

/**
 * Khách không tới KHÔNG báo trước — tách khỏi "huỷ" (thẻ design "3 luật
 * cứng"): mất tiền thật, khác hẳn huỷ chủ động còn kịp lấp chỗ.
 */
export async function markNoShow(id: string): Promise<ActionResult> {
  return updateStatus(id, "no_show");
}

/**
 * MÁY TRẠNG THÁI — mỗi phép chuyển đi được từ tập trạng thái RIÊNG của nó, chứ
 * không dùng chung một hằng số cho tất cả: "khách tới"/"không tới" trả lời câu
 * hỏi của giờ hẹn nên chỉ đi từ `booked`; "xong" là kết của buổi khách ĐÃ tới
 * nên chỉ đi từ `arrived` (xem lý do từng tập ở `types.ts`).
 *
 * Mã lỗi nằm NGAY CẠNH tập trạng thái: đổi luật mà quên đổi câu báo cho người
 * dùng thì thành báo sai chỗ, để hai thứ cạnh nhau là để không quên.
 */
const CHUYEN_TRANG_THAI: Record<"arrived" | "done" | "no_show", { tu: AppointmentStatus[]; loi: string }> = {
  arrived: { tu: ARRIVABLE_STATUSES, loi: "requires_booked" },
  done: { tu: COMPLETABLE_STATUSES, loi: "requires_arrived" },
  no_show: { tu: ARRIVABLE_STATUSES, loi: "requires_booked" },
};

/**
 * Lọc trạng thái + thùng rác NGAY TRONG câu UPDATE (khuôn `updateAppointment`),
 * không đọc-rồi-ghi: khoảng hở giữa hai lệnh là chỗ người khác vừa bấm
 * Xong/Huỷ chen vào. `.select("id")` + đếm dòng: 0 dòng ⇒ phép chuyển không hợp
 * lệ (hoặc ca đã vào thùng rác / RLS chặn) ⇒ BÁO RA, không im lặng coi như xong
 * — `markDone` còn phát phiếu đánh giá gửi khách ngay sau đó.
 */
async function updateStatus(id: string, status: "arrived" | "done" | "no_show"): Promise<ActionResult> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { error: "invalid_input" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const luat = CHUYEN_TRANG_THAI[status];
  const { data, error } = await auth.supabase
    .from("appointments")
    .update({ status })
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .in("status", luat.tu)
    .select("id");

  if (error) return { error: mapDbError(error) };
  if (!data || data.length === 0) return { error: luat.loi };
  revalidateCalendar();
  return { error: null };
}

const cancelSchema = z.object({
  id: z.uuid(),
  reason: z.enum(CANCEL_REASONS),
});

/**
 * Huỷ BẮT BUỘC chọn lý do (thẻ design "3 luật cứng") — không có lý do thì sau
 * này không biết vì sao mất khách.
 *
 * Chỉ huỷ được ca CÒN SỐNG (`EDITABLE_STATUSES` = booked/arrived) và chưa vào
 * thùng rác. Huỷ một ca ĐÃ XONG là ghi đè lịch sử: đơn hàng đã trỏ vào buổi hẹn
 * đó và phiếu đánh giá đã phát (#178) — báo cáo doanh thu sẽ nói một đằng, màn
 * Lịch nói một nẻo. Huỷ lại ca đã huỷ thì chỉ ghi đè lý do huỷ cũ.
 *
 * Lọc trong câu lệnh + đếm dòng, cùng khuôn `updateAppointment`.
 */
export async function cancelAppointment(input: z.infer<typeof cancelSchema>): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("appointments")
    .update({ status: "cancelled", cancel_reason: parsed.data.reason })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .in("status", EDITABLE_STATUSES)
    .select("id");

  if (error) return { error: mapDbError(error) };
  if (!data || data.length === 0) return { error: "requires_active" };
  revalidateCalendar();
  return { error: null };
}
