"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { khoangCachM, layHoSoCuaToi, layViTriTiem } from "./queries";

/**
 * Nhân sự · Chấm công (V7, migration #166). Thẻ man-nhan-su-cham-cong.html.
 *
 * QUYỀN: không siết lại ở tầng này — RLS của #166 đã đúng luật (hồ sơ:
 * owner/admin; bảng công + xếp ca + quyết đơn nghỉ: manager trở lên; chấm công
 * và xin nghỉ: cho CHÍNH MÌNH). Siết hai nơi là hai sự thật rồi sẽ lệch.
 * Cùng nguyên tắc app/app/cashbook/actions.ts.
 *
 * ⚠️ Mọi INSERT ở đây PHẢI tự truyền `tenant_id`: các bảng #166 khai
 * `tenant_id not null` KHÔNG default, và RLS `with check` chỉ chặn ghi SANG
 * tiệm khác chứ không tự điền tiệm đúng. Bẫy này đã dính 2 lần trong kho.
 */

type ActionResult = { error: string | null };

/**
 * Đổi lỗi CSDL thành mã màn hình hiểu được. Ba mã dưới là do TRIGGER ném ra
 * (không phải mã lỗi Postgres chuẩn) nên phải khớp chuỗi.
 */
function loiGhi(message: string): string {
  if (/timesheet_locked/.test(message)) return "timesheet_locked";
  if (/period_closed/.test(message)) return "period_closed";
  if (/attendance_ngoai_vung_phai_co_ly_do/.test(message)) return "reason_required";
  if (/shifts_mot_nguoi_mot_ngay/.test(message)) return "shift_duplicate";
  if (/timesheets_mot_ky_mot_nguoi/.test(message)) return "timesheet_duplicate";
  if (/employees_user_unique/.test(message)) return "employee_duplicate";
  // Hai mã do trigger `leave_khong_tu_quyet` ném ra (migration #204): tự duyệt
  // đơn nghỉ của chính mình, và ghi sai người duyệt. Không có dòng này thì
  // chúng rơi về `save_failed` = "Lưu thất bại, thử lại" — câu đó mời người
  // dùng bấm lại một việc sẽ KHÔNG BAO GIỜ chạy, tệ hơn là không nói gì.
  if (/leave_self_decide|leave_decider_mismatch/.test(message)) return "forbidden";
  if (/row-level security/i.test(message)) return "forbidden";
  return "save_failed";
}

/**
 * Người đăng nhập + tiệm đang mở. Cờ `ok` là thứ TypeScript dựa vào để tách hai
 * nhánh — thiếu nó thì nhánh lỗi vẫn mang kiểu `string | undefined`.
 */
type BoiCanh =
  | { ok: false; error: string }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: { id: string };
      tenantId: string;
    };

async function boiCanh(): Promise<BoiCanh> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { ok: false, error: "not_found" };
  return { ok: true, supabase, user, tenantId: tenant.id as string };
}

// ==================== CHẤM CÔNG ====================

const chamCongSchema = z.object({
  kind: z.enum(["in", "out"]),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  reason: z.string().trim().max(300).nullable(),
});

/**
 * Một nút chấm vào / tan ca (quyết định 1 của thẻ).
 *
 * ⚠️ `distance_m` TÍNH Ở ĐÂY, không nhận từ trình duyệt. Client chỉ gửi toạ độ
 * thô; nếu để client tự gửi khoảng cách thì gửi "5m" là xong, và cả quyết định
 * "gắn cờ khi ở ngoài vùng" thành trang trí. Cờ `out_of_range` thì trigger
 * `attendance_set_flag()` quyết — kể cả action này cũng không ghi đè được.
 *
 * Chưa khai toạ độ tiệm ⇒ `distance_m` null ⇒ trigger gắn cờ ⇒ BẮT BUỘC có lý
 * do. Đó là mặc định an toàn, không phải lỗi: chưa biết tiệm ở đâu thì không
 * được phép nói "đúng nơi làm việc".
 */
export async function chamCong(input: z.infer<typeof chamCongSchema>): Promise<ActionResult> {
  const parsed = chamCongSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, user, tenantId } = ctx;

  // Chấm cho CHÍNH MÌNH — id hồ sơ lấy từ máy chủ, không nhận từ client.
  const me = await layHoSoCuaToi(supabase, user.id);
  if (!me) return { error: "no_employee_profile" };
  if (me.endedOn) return { error: "employee_ended" };

  let distanceM: number | null = null;
  if (parsed.data.lat != null && parsed.data.lng != null) {
    const shop = await layViTriTiem(supabase);
    if (shop) distanceM = khoangCachM(shop, { lat: parsed.data.lat, lng: parsed.data.lng });
  }

  const { error } = await supabase.from("attendance_punches").insert({
    tenant_id: tenantId,
    employee_id: me.id,
    kind: parsed.data.kind,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    distance_m: distanceM,
    reason: parsed.data.reason,
  });
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null };
}

const viTriSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * Khai toạ độ tiệm bằng cách đứng TẠI tiệm rồi bấm. Chỉ owner/admin —
 * `tenants_update` (migration #2) đã chặn ở CSDL.
 *
 * Ghi vào `tenants.settings` bằng cách GỘP (đọc → trải → ghi), không ghi đè cả
 * ô jsonb: đây là ô dùng chung của tiệm, ghi đè là xoá mất thứ mảng khác đặt
 * vào sau này.
 */
export async function datViTriTiem(input: z.infer<typeof viTriSchema>): Promise<ActionResult> {
  const parsed = viTriSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, tenantId } = ctx;

  const { data: row } = await supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
  const settings = (row?.settings as Record<string, unknown> | null) ?? {};

  const { error } = await supabase
    .from("tenants")
    .update({
      settings: {
        ...settings,
        workLocation: { lat: parsed.data.lat, lng: parsed.data.lng },
      },
    })
    .eq("id", tenantId);
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null };
}

// ==================== HỒ SƠ NHÂN SỰ ====================

const hoSoSchema = z.object({
  id: z.uuid().nullable(),
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).nullable(),
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  baseSalaryVnd: z.number().int().min(0).max(1_000_000_000),
  overtimeRateVnd: z.number().int().min(0).max(10_000_000),
  annualLeaveDays: z.number().int().min(0).max(365),
  note: z.string().trim().max(500).nullable(),
});

export async function luuHoSoNhanSu(input: z.infer<typeof hoSoSchema>): Promise<ActionResult> {
  const parsed = hoSoSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  if (d.endedOn && d.endedOn < d.startedOn) return { error: "end_before_start" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, tenantId } = ctx;

  const cot = {
    full_name: d.fullName,
    phone: d.phone,
    started_on: d.startedOn,
    ended_on: d.endedOn,
    base_salary_vnd: d.baseSalaryVnd,
    overtime_rate_vnd: d.overtimeRateVnd,
    annual_leave_days: d.annualLeaveDays,
    note: d.note,
  };

  const { error } = d.id
    ? await supabase.from("employees").update(cot).eq("id", d.id)
    : await supabase.from("employees").insert({ tenant_id: tenantId, ...cot });
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null };
}

/**
 * Nối hồ sơ nhân sự với một tài khoản đã có trong tiệm — có nối thì người đó
 * mới tự chấm công và mới xem được phiếu lương của mình (RLS đều đi qua
 * `employees.user_id`). Truyền `userId` null để gỡ nối.
 */
export async function noiHoSoVoiTaiKhoan(input: {
  employeeId: string;
  userId: string | null;
}): Promise<ActionResult> {
  const parsed = z
    .object({ employeeId: z.uuid(), userId: z.uuid().nullable() })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  const { error } = await supabase
    .from("employees")
    .update({ user_id: parsed.data.userId })
    .eq("id", parsed.data.employeeId);
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null };
}

// ==================== BẢNG CÔNG ====================

const bangCongSchema = z.object({
  employeeId: z.uuid(),
  period: z.string().regex(/^\d{4}-\d{2}-01$/),
  workDays: z.number().min(0).max(31),
  overtimeHours: z.number().min(0).max(400),
  lateCount: z.number().int().min(0).max(100),
  flagCount: z.number().int().min(0).max(200),
});

/** Ghi (hoặc tạo) dòng bảng công của một người trong kỳ. Kỳ đã chốt ⇒ trigger từ chối. */
export async function luuBangCong(input: z.infer<typeof bangCongSchema>): Promise<ActionResult> {
  const parsed = bangCongSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, tenantId } = ctx;

  const { error } = await supabase.from("timesheets").upsert(
    {
      tenant_id: tenantId,
      employee_id: d.employeeId,
      period: d.period,
      work_days: d.workDays,
      overtime_hours: d.overtimeHours,
      late_count: d.lateCount,
      flag_count: d.flagCount,
    },
    { onConflict: "tenant_id,employee_id,period" },
  );
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null };
}

/**
 * Tính lại số công + số cờ TỪ LẦN CHẤM THẬT của kỳ.
 *
 * Chỉ tính đúng hai số máy suy được: số NGÀY có chấm vào, và số lần bị gắn cờ.
 * `overtime_hours` / `late_count` KHÔNG tự tính — muốn biết đi trễ phải có giờ
 * bắt đầu ca, mà bảng `shifts` chỉ có sáng/chiều/cả ngày chứ không có giờ. Bịa
 * ra một con số rồi tính lương theo nó là thứ tệ hơn để trống.
 */
export async function tinhLaiBangCong(input: {
  employeeId: string;
  period: string;
}): Promise<ActionResult & { workDays?: number; flagCount?: number }> {
  const parsed = z
    .object({ employeeId: z.uuid(), period: z.string().regex(/^\d{4}-\d{2}-01$/) })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const { employeeId, period } = parsed.data;

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, tenantId } = ctx;

  const [y, m] = period.split("-").map(Number);
  const fromIso = new Date(Date.UTC(y, m - 1, 1) - 7 * 3600 * 1000).toISOString();
  const toIso = new Date(Date.UTC(y, m, 1) - 7 * 3600 * 1000).toISOString();

  const { data, error: loiDoc } = await supabase
    .from("attendance_punches")
    .select("punched_at, kind, out_of_range")
    .eq("employee_id", employeeId)
    .gte("punched_at", fromIso)
    .lt("punched_at", toIso)
    .limit(2000);
  if (loiDoc) return { error: loiGhi(loiDoc.message) };

  const ngayCoCham = new Set<string>();
  let flagCount = 0;
  for (const p of data ?? []) {
    if (p.out_of_range === true) flagCount++;
    if (p.kind !== "in") continue;
    ngayCoCham.add(
      new Date(new Date(p.punched_at as string).getTime() + 7 * 3600 * 1000)
        .toISOString()
        .slice(0, 10),
    );
  }
  const workDays = ngayCoCham.size;

  const { error } = await supabase.from("timesheets").upsert(
    {
      tenant_id: tenantId,
      employee_id: employeeId,
      period,
      work_days: workDays,
      flag_count: Math.min(flagCount, 200),
    },
    { onConflict: "tenant_id,employee_id,period" },
  );
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null, workDays, flagCount };
}

export async function chotBangCong(input: { timesheetId: string }): Promise<ActionResult> {
  const parsed = z.object({ timesheetId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, user } = ctx;

  const { error } = await supabase
    .from("timesheets")
    .update({ status: "closed", closed_by: user.id, closed_at: new Date().toISOString() })
    .eq("id", parsed.data.timesheetId);
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null };
}

/**
 * Mở khoá BẮT BUỘC kèm lý do — đó là điều kiện DUY NHẤT trigger
 * `timesheets_lock_guard()` cho phép sửa lại. Giữ nguyên `closed_by`/`closed_at`
 * (dấu vết ai từng chốt), đúng bản vá #173.
 */
export async function moKhoaBangCong(input: {
  timesheetId: string;
  reason: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ timesheetId: z.uuid(), reason: z.string().trim().min(1).max(300) })
    .safeParse(input);
  if (!parsed.success) return { error: "unlock_reason_required" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  const { error } = await supabase
    .from("timesheets")
    .update({ status: "draft", unlock_reason: parsed.data.reason })
    .eq("id", parsed.data.timesheetId);
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null };
}

// ==================== XẾP CA ====================

const xepCaSchema = z.object({
  employeeId: z.uuid(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["morning", "afternoon", "full", "off"]).nullable(),
});

/** `kind` null = gỡ ca khỏi ô đó. Một người một ngày một ca (unique index #166). */
export async function xepCa(input: z.infer<typeof xepCaSchema>): Promise<ActionResult> {
  const parsed = xepCaSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, tenantId } = ctx;

  const { error } = d.kind
    ? await supabase.from("shifts").upsert(
        { tenant_id: tenantId, employee_id: d.employeeId, work_date: d.workDate, kind: d.kind },
        { onConflict: "tenant_id,employee_id,work_date" },
      )
    : await supabase
        .from("shifts")
        .delete()
        .eq("employee_id", d.employeeId)
        .eq("work_date", d.workDate);
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null };
}

// ==================== NGHỈ PHÉP ====================

const xinNghiSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["paid", "unpaid", "sick"]),
  reason: z.string().trim().max(300).nullable(),
});

/** Xin nghỉ cho CHÍNH MÌNH — hồ sơ lấy ở máy chủ, không nhận employee_id từ client. */
export async function xinNghi(input: z.infer<typeof xinNghiSchema>): Promise<ActionResult> {
  const parsed = xinNghiSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;
  if (d.toDate < d.fromDate) return { error: "end_before_start" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, user, tenantId } = ctx;

  const me = await layHoSoCuaToi(supabase, user.id);
  if (!me) return { error: "no_employee_profile" };

  const { error } = await supabase.from("leave_requests").insert({
    tenant_id: tenantId,
    employee_id: me.id,
    from_date: d.fromDate,
    to_date: d.toDate,
    kind: d.kind,
    reason: d.reason,
  });
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null };
}

export async function quyetDonNghi(input: {
  leaveId: string;
  approve: boolean;
}): Promise<ActionResult> {
  const parsed = z.object({ leaveId: z.uuid(), approve: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, user } = ctx;

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: parsed.data.approve ? "approved" : "rejected",
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.leaveId);
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null };
}
