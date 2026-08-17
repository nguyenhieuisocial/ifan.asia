"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CANCEL_REASONS } from "./types";

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

export type AppointmentStatus = "booked" | "arrived" | "done" | "cancelled" | "no_show";

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
  staffUserId: z.uuid(),
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

  const { data, error } = await auth.supabase
    .from("appointments")
    .insert({
      tenant_id: tenant.id,
      contact_id: parsed.data.contactId,
      staff_user_id: parsed.data.staffUserId,
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

/** Đổi giờ (kéo-thả trên máy tính, hoặc dialog trên điện thoại) — vẫn qua đúng 2 EXCLUDE. */
export async function rescheduleAppointment(input: z.infer<typeof rescheduleSchema>): Promise<ActionResult> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  if (parsed.data.endAt <= parsed.data.startAt) return { error: "invalid_time_range" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from("appointments")
    .update({ start_at: parsed.data.startAt, end_at: parsed.data.endAt })
    .eq("id", parsed.data.id);

  if (error) return { error: mapDbError(error) };
  revalidateCalendar();
  return { error: null };
}

/** Khách tới: chuyển sang "đang làm". */
export async function markArrived(id: string): Promise<ActionResult> {
  return updateStatus(id, "arrived");
}

/** Xong việc: chuyển sang "hoàn tất". */
export async function markDone(id: string): Promise<ActionResult> {
  return updateStatus(id, "done");
}

/**
 * Khách không tới KHÔNG báo trước — tách khỏi "huỷ" (thẻ design "3 luật
 * cứng"): mất tiền thật, khác hẳn huỷ chủ động còn kịp lấp chỗ.
 */
export async function markNoShow(id: string): Promise<ActionResult> {
  return updateStatus(id, "no_show");
}

async function updateStatus(id: string, status: "arrived" | "done" | "no_show"): Promise<ActionResult> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { error: "invalid_input" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase.from("appointments").update({ status }).eq("id", parsedId.data);
  if (error) return { error: mapDbError(error) };
  revalidateCalendar();
  return { error: null };
}

const cancelSchema = z.object({
  id: z.uuid(),
  reason: z.enum(CANCEL_REASONS),
});

/** Huỷ BẮT BUỘC chọn lý do (thẻ design "3 luật cứng") — không có lý do thì sau này không biết vì sao mất khách. */
export async function cancelAppointment(input: z.infer<typeof cancelSchema>): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from("appointments")
    .update({ status: "cancelled", cancel_reason: parsed.data.reason })
    .eq("id", parsed.data.id);

  if (error) return { error: mapDbError(error) };
  revalidateCalendar();
  return { error: null };
}
