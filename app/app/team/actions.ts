"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  khoangCachM,
  layHoSoCuaToi,
  layViTriTiem,
  layCa,
  layCauHinhChamCong,
  layDonNghiDaDuyetTrongKy,
  gioCuaCa,
  phutTrongNgay,
} from "./queries";

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

// ==================== TRA ĐỊA CHỈ TỪ TOẠ ĐỘ ====================

const diaChiSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * #219 — đổi toạ độ GPS thô thành ĐỊA CHỈ CHỮ (tên đường / phường-xã) để chèn
 * lên ảnh chấm công. Founder chốt: dùng dịch vụ MIỄN PHÍ (OpenStreetMap
 * Nominatim), chấp nhận độ chính xác tới tên đường/phường — ÍT khi có số nhà.
 *
 * Gọi Ở MÁY CHỦ, không ở trình duyệt: (1) Nominatim yêu cầu User-Agent định
 * danh app — trình duyệt không đặt được header đó; (2) không biến app thành
 * cửa proxy tra toạ độ ẩn danh nên chặn bằng đăng nhập. Host CỐ ĐỊNH
 * nominatim.openstreetmap.org (không nhận URL từ client) — không có cửa SSRF.
 *
 * Hỏng bất cứ khâu nào (mạng, quá giờ, dịch vụ chặn) ⇒ trả `address: null`,
 * KHÔNG ném: thiếu địa chỉ thì ảnh ghi "chưa lấy được vị trí", chấm công vẫn
 * chạy. Địa chỉ chỉ là nhãn đọc cho người, không phải chốt chặn.
 */
export async function layDiaChiTuToaDo(
  input: z.infer<typeof diaChiSchema>,
): Promise<{ address: string | null }> {
  const parsed = diaChiSchema.safeParse(input);
  if (!parsed.success) return { address: null };
  const ctx = await boiCanh();
  if (!ctx.ok) return { address: null };

  try {
    const { lat, lng } = parsed.data;
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=vi`;
    const res = await fetch(url, {
      headers: { "User-Agent": "iFan.asia attendance (https://ifan.asia)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { address: null };
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address ?? {};
    // Ghép kiểu VN gọn: [số nhà +] đường · phường/xã · quận/huyện. Bỏ tỉnh/quốc
    // gia cho ngắn — ảnh chấm công cần biết "ở đâu quanh đây", không phải địa
    // chỉ bưu chính đầy đủ.
    const duong = [a.house_number, a.road].filter(Boolean).join(" ");
    const phuong = a.suburb || a.quarter || a.neighbourhood || a.village || a.hamlet || "";
    const quan = a.city_district || a.district || a.county || a.city || a.town || "";
    const parts = [duong, phuong, quan].filter((p) => p && p.trim() !== "");
    if (parts.length === 0) return { address: null };
    return { address: parts.join(", ") };
  } catch {
    return { address: null };
  }
}

// ==================== CHẤM CÔNG ====================

const chamCongSchema = z.object({
  kind: z.enum(["in", "out"]),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  reason: z.string().trim().max(300).nullable(),
  // #219 — client đã upload ảnh selfie (đã chèn chữ vị trí+giờ+tên tiệm) vào
  // bucket tenant-files rồi truyền ĐƯỜNG DẪN lên. null = không chụp.
  selfiePath: z.string().trim().max(300).nullable(),
  selfieContentType: z.string().trim().max(100).nullable(),
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

  // #219 — tiệm bật "bắt buộc selfie" thì thiếu ảnh là CHẶN (đây là chốt tầng
  // web; ảnh do client chụp nên không có ràng buộc CSDL tương đương). Đường dẫn
  // phải nằm trong thư mục của CHÍNH tiệm (client kiểm soát path → không tin thẳng).
  const { data: cfg } = await supabase.from("attendance_settings").select("require_selfie").maybeSingle();
  if (cfg?.require_selfie && !parsed.data.selfiePath) return { error: "selfie_required" };
  if (parsed.data.selfiePath && !parsed.data.selfiePath.startsWith(`${tenantId}/`)) {
    return { error: "invalid_input" };
  }

  const { error } = await supabase.from("attendance_punches").insert({
    tenant_id: tenantId,
    employee_id: me.id,
    kind: parsed.data.kind,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    distance_m: distanceM,
    reason: parsed.data.reason,
    selfie_path: parsed.data.selfiePath,
    selfie_content_type: parsed.data.selfieContentType,
    selfie_captured_at: parsed.data.selfiePath ? new Date().toISOString() : null,
  });
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return { error: null };
}

const chamCongGiupSchema = z.object({
  employeeId: z.uuid(),
  kind: z.enum(["in", "out"]),
  // #225 — ảnh mặt người được chấm là BẮT BUỘC ở chế độ chấm giúp (bằng chứng
  // có mặt). Khác chamCong: ở đây không nullable.
  selfiePath: z.string().trim().min(1).max(300),
  selfieContentType: z.string().trim().max(100).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  // #225 lát 2 — dấu mặt (128 số) do điện thoại tính. Null = máy không thấy mặt
  // rõ ⇒ không chấm điểm khớp, chấm giúp vẫn chạy.
  faceDescriptor: z.array(z.number()).length(128).nullable(),
});

/** Kết quả chấm giúp: có thể kèm % khớp mặt (0..100), hoặc null nếu không so được. */
type ChamGiupResult = ActionResult & { faceMatchPct?: number | null };

/**
 * #225 — chấm công GIÚP đồng nghiệp (điện thoại họ hỏng). Toàn bộ chốt chặn nằm
 * trong hàm CSDL `cham_cong_giup` (SECURITY DEFINER, migration #234): bắt buộc
 * ảnh mặt, luôn gắn cờ, ghi người bấm, chặn tiệm khác. Ở đây chỉ chuyển tiếp +
 * dịch mã lỗi cho màn hình — KHÔNG tự nới quyền ở tầng web.
 */
export async function chamCongGiup(input: z.infer<typeof chamCongGiupSchema>): Promise<ChamGiupResult> {
  const parsed = chamCongGiupSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };

  const { data: punchId, error } = await ctx.supabase.rpc("cham_cong_giup", {
    p_employee_id: parsed.data.employeeId,
    p_kind: parsed.data.kind,
    p_selfie_path: parsed.data.selfiePath,
    p_selfie_content_type: parsed.data.selfieContentType,
    p_lat: parsed.data.lat,
    p_lng: parsed.data.lng,
    p_face_descriptor: parsed.data.faceDescriptor,
  });
  if (error) {
    // Ba mã do hàm RAISE (không phải lỗi Postgres chuẩn) → khớp chuỗi.
    if (/selfie_required/.test(error.message)) return { error: "selfie_required" };
    if (/forbidden/.test(error.message)) return { error: "forbidden" };
    if (/invalid_input/.test(error.message)) return { error: "invalid_input" };
    return { error: loiGhi(error.message) };
  }

  // Đọc lại điểm khớp mặt CSDL vừa chấm (0..1) để hiện % cho người bấm. Helper
  // đọc được dòng proxy của mình (RLS attendance_proxy_select). Không có điểm
  // (chưa nạp mặt / không thấy mặt) ⇒ null, màn không hiện %.
  let faceMatchPct: number | null = null;
  if (typeof punchId === "string") {
    const { data: px } = await ctx.supabase
      .from("attendance_proxy_punches")
      .select("face_match_score")
      .eq("punch_id", punchId)
      .maybeSingle();
    if (px?.face_match_score != null) faceMatchPct = Math.round(Number(px.face_match_score) * 100);
  }

  revalidatePath("/app/team");
  return { error: null, faceMatchPct };
}

const napMatSchema = z.object({
  employeeId: z.uuid(),
  descriptor: z.array(z.number()).length(128),
  // #225 — đường dẫn ảnh mặt gốc (để quản lý đối chiếu). Null = nạp không kèm ảnh.
  photoPath: z.string().trim().max(300).nullable(),
});

/**
 * #225 — nạp "mặt gốc" của một nhân viên (chụp một lần). Điện thoại tính dấu mặt
 * (128 số) rồi gửi lên; CSDL kiểm quyền (mình, hoặc owner/admin) trong hàm
 * `nap_mat` (definer, migration #235). Embedding không phơi ra client.
 */
export async function napMat(input: z.infer<typeof napMatSchema>): Promise<ActionResult> {
  const parsed = napMatSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.rpc("nap_mat", {
    p_employee_id: parsed.data.employeeId,
    p_descriptor: parsed.data.descriptor,
    p_photo_path: parsed.data.photoPath,
  });
  if (error) {
    if (/forbidden/.test(error.message)) return { error: "forbidden" };
    if (/invalid_input/.test(error.message)) return { error: "invalid_input" };
    return { error: loiGhi(error.message) };
  }

  revalidatePath("/app/team");
  return { error: null };
}

/**
 * #225/#223 — nhân viên này ĐÃ nạp mặt gốc chưa? Để màn nạp mặt biết hiện "Nạp
 * mặt" (chưa có) hay "Nạp lại" (đã có) ngay lúc mở, thay vì luôn coi như chưa
 * nạp. Hàm `face_da_nap` (definer, migration #235) chỉ trả có/không — KHÔNG lộ
 * dấu mặt. Hỏng/không quyền → coi như chưa nạp (an toàn, chỉ ảnh hưởng nhãn nút).
 */
export async function daNapMat(employeeId: string): Promise<boolean> {
  if (!z.uuid().safeParse(employeeId).success) return false;
  const ctx = await boiCanh();
  if (!ctx.ok) return false;
  const { data, error } = await ctx.supabase.rpc("face_da_nap", { p_employee_id: employeeId });
  return !error && data === true;
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

  // #232: toạ độ tiệm sang bảng attendance_settings (thay ô tenants.settings cũ).
  // Upsert giữ nguyên radius_m/require_selfie (chỉ đặt lat/lng); dòng mới lấy
  // default. RLS attendance_settings_manage chỉ mở owner/admin.
  const { data: daGhi, error } = await supabase
    .from("attendance_settings")
    .upsert(
      { tenant_id: tenantId, lat: parsed.data.lat, lng: parsed.data.lng, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" },
    )
    .select("tenant_id");
  if (error) return { error: loiGhi(error.message) };
  // Đo trên CSDL 20/08: vai quản lý / nhân viên / chỉ-xem ĐỌC được cấu hình
  // nhưng chỉ owner/admin GHI được — với dòng đã có, RLS lọc mất và lệnh ra 0
  // dòng KHÔNG lỗi. Không đếm dòng là ba vai đó bấm "Lấy toạ độ" xong thấy báo
  // xong mà toạ độ vẫn trống, rồi mọi lần chấm sau tính sai khoảng cách.
  if (!daGhi?.length) return { error: "forbidden" };

  revalidatePath("/app/team");
  return { error: null };
}

const cauHinhChamSchema = z.object({
  radiusM: z.number().int().min(20).max(5000),
  requireSelfie: z.boolean(),
  // #225 — % khớp mặt tối thiểu khi chấm giúp (dưới ngưỡng thì đánh dấu đỏ).
  faceMatchMin: z.number().int().min(0).max(100),
});

/**
 * #232 — cài bán kính "coi như tại tiệm" + công tắc bắt buộc selfie. Chỉ
 * owner/admin (RLS attendance_settings_manage chặn ở CSDL). Upsert giữ nguyên
 * toạ độ đã đặt (chỉ đổi radius_m + require_selfie); đếm dòng như datViTriTiem
 * để ba vai khác không thấy "đã lưu" giả.
 */
export async function datCauHinhCham(input: z.infer<typeof cauHinhChamSchema>): Promise<ActionResult> {
  const parsed = cauHinhChamSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, tenantId } = ctx;

  const { data: daGhi, error } = await supabase
    .from("attendance_settings")
    .upsert(
      {
        tenant_id: tenantId,
        radius_m: parsed.data.radiusM,
        require_selfie: parsed.data.requireSelfie,
        face_match_min: parsed.data.faceMatchMin,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    )
    .select("tenant_id");
  if (error) return { error: loiGhi(error.message) };
  if (!daGhi?.length) return { error: "forbidden" };

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

  // Nhánh SỬA phải đếm dòng. Đo 20/08: một nhân viên có tài khoản (cột
  // `user_id` đã nối) ĐỌC được hồ sơ của CHÍNH MÌNH qua `employees_self_or_admin`
  // nhưng `employees_manage` chỉ cho owner/admin ghi ⇒ tự sửa lương/ngày phép
  // của mình thì ra 0 dòng, KHÔNG lỗi. Không đếm thì màn báo "Đã lưu" trên một
  // hồ sơ không đổi một chữ. Nhánh THÊM không cần: RLS chặn insert thì ném lỗi.
  const { data: daGhi, error } = d.id
    ? await supabase.from("employees").update(cot).eq("id", d.id).select("id")
    : await supabase.from("employees").insert({ tenant_id: tenantId, ...cot }).select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!daGhi?.length) return { error: d.id ? "forbidden" : "save_failed" };

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

  const { data: daNoi, error } = await supabase
    .from("employees")
    .update({ user_id: parsed.data.userId })
    .eq("id", parsed.data.employeeId)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // Cùng lý do với `luuHoSo`: người tự nối hồ sơ của mình sang tài khoản khác
  // bị `employees_manage` lọc, ra 0 dòng không lỗi. Nối hụt mà báo xong là
  // nguy hiểm riêng: mọi quyền xem phiếu lương / tự chấm công đều đi qua cột
  // `user_id` này.
  if (!daNoi?.length) return { error: "forbidden" };

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

/** Ngày theo giờ VN (UTC+7) của một mốc ISO — cùng quy ước với monthKeyToRangeVN. */
function ngayVN(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Phút-trong-ngày theo giờ VN của một mốc ISO. */
function phutVN(iso: string): number {
  const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function themNgayISO(ngay: string, n: number): string {
  return new Date(new Date(`${ngay}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Tính lại bảng công TỪ LẦN CHẤM THẬT của kỳ — sáu số, tất cả do máy đếm.
 *
 * ════════════════════════════════════════════════════════════════════
 * BẢN TRƯỚC CHỈ ĐẾM ĐƯỢC HAI SỐ, VÀ ĐÃ GHI RÕ VÌ SAO
 * ════════════════════════════════════════════════════════════════════
 * Ghi chú cũ ở đúng chỗ này viết: *"`overtime_hours` / `late_count` KHÔNG tự
 * tính — muốn biết đi trễ phải có giờ bắt đầu ca, mà bảng `shifts` chỉ có sáng/
 * chiều/cả ngày chứ không có giờ. Bịa ra một con số rồi tính lương theo nó là
 * thứ tệ hơn để trống."* Câu đó ĐÚNG, và bản này không lật nó — migration #251
 * gỡ đúng cái điều kiện làm nó đúng (cho ca có giờ), nên số bây giờ **suy ra từ
 * dữ liệu thật** chứ không phải bịa.
 *
 * Thêm migration #250: ngày nghỉ CÓ LƯƠNG đã duyệt nay được cộng vào công. Bản
 * trước đếm ra 0 công cho ngày đó ⇒ phép có lương bị trả như nghỉ không lương,
 * và màn Bảng lương gắn cờ "công dưới chuẩn" cho người nghỉ đúng chế độ.
 *
 * ════════════════════════════════════════════════════════════════════
 * BA CHỖ CỐ Ý KHÔNG ĐOÁN
 * ════════════════════════════════════════════════════════════════════
 * (1) Ngày CHƯA XẾP CA hoặc xếp ca "Nghỉ" ⇒ bỏ qua cả đi muộn/về sớm/tăng ca.
 *     Không có mốc để so thì không có số. Ngày đó VẪN tính công nếu có chấm vào
 *     — đi làm thật thì phải được ghi nhận, kể cả khi lịch chưa xếp.
 * (2) Không có lần chấm RA ⇒ ngày đó không có về sớm lẫn tăng ca. Suy giờ về từ
 *     chỗ khác là đoán, và đoán ở đây ra tiền.
 * (3) Ngày vừa có chấm vừa có phép ⇒ tính MỘT lần (người đó đã đi làm). Không
 *     cộng đôi.
 */
export async function tinhLaiBangCong(input: {
  employeeId: string;
  period: string;
}): Promise<
  ActionResult & {
    workDays?: number;
    flagCount?: number;
    lateCount?: number;
    lateMinutes?: number;
    earlyLeaveMinutes?: number;
    overtimeHours?: number;
    paidLeaveDays?: number;
    unpaidLeaveDays?: number;
    /** Số ngày có chấm nhưng CHƯA XẾP CA ⇒ ba số giờ không tính được cho ngày đó. */
    daysWithoutShift?: number;
  }
> {
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
  const dauKy = period;
  const cuoiKy = themNgayISO(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), -1);

  const { data, error: loiDoc } = await supabase
    .from("attendance_punches")
    .select("punched_at, kind, out_of_range")
    .eq("employee_id", employeeId)
    .gte("punched_at", fromIso)
    .lt("punched_at", toIso)
    .limit(2000);
  if (loiDoc) return { error: loiGhi(loiDoc.message) };

  const [ca, cfg, nghi] = await Promise.all([
    layCa(supabase, dauKy, cuoiKy, employeeId),
    layCauHinhChamCong(supabase),
    layDonNghiDaDuyetTrongKy(supabase, employeeId, dauKy, cuoiKy),
  ]);

  // Gom lần chấm theo ngày: VÀO sớm nhất và RA muộn nhất của ngày đó.
  // Sớm-nhất/muộn-nhất (không phải đầu/cuối danh sách) vì thứ tự trả về không
  // được bảo đảm, và vì một ngày có thể chấm ra chấm vào nhiều lần.
  type MocNgay = { vao: number | null; ra: number | null };
  const theoNgay = new Map<string, MocNgay>();
  let flagCount = 0;
  for (const p of data ?? []) {
    if (p.out_of_range === true) flagCount++;
    const iso = p.punched_at as string;
    const ngay = ngayVN(iso);
    const phut = phutVN(iso);
    const cu = theoNgay.get(ngay) ?? { vao: null, ra: null };
    if (p.kind === "in") cu.vao = cu.vao == null ? phut : Math.min(cu.vao, phut);
    else cu.ra = cu.ra == null ? phut : Math.max(cu.ra, phut);
    theoNgay.set(ngay, cu);
  }

  const caTheoNgay = new Map(ca.map((s) => [s.workDate, s]));
  const ngayCoCham = new Set([...theoNgay].filter(([, v]) => v.vao != null).map(([k]) => k));

  let lateCount = 0;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;
  let daysWithoutShift = 0;

  for (const ngay of ngayCoCham) {
    const moc = theoNgay.get(ngay)!;
    const s = caTheoNgay.get(ngay);
    // Chỗ cố ý không đoán (1): chưa xếp ca / ca Nghỉ thì không có mốc để so.
    const gio = s ? gioCuaCa(s, cfg) : null;
    if (!gio) {
      daysWithoutShift++;
      continue;
    }
    const batDau = phutTrongNgay(gio.start);
    const ketThuc = phutTrongNgay(gio.end);

    if (moc.vao != null) {
      const muon = moc.vao - batDau - cfg.lateGraceMin;
      if (muon > 0) {
        lateCount++;
        lateMinutes += muon;
      }
    }
    // Chỗ cố ý không đoán (2): quên chấm ra ⇒ không có về sớm lẫn tăng ca.
    if (moc.ra != null) {
      if (moc.ra < ketThuc) earlyLeaveMinutes += ketThuc - moc.ra;
      const them = moc.ra - ketThuc;
      if (them >= cfg.overtimeMinMinutes) overtimeMinutes += them;
    }
  }

  // Ngày nghỉ đã duyệt, cắt về đúng trong kỳ. Ngày xếp ca "Nghỉ" không tính —
  // cùng luật với `leave_dem_ngay()` ở migration #250, để hai nơi ra cùng số.
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  for (const don of nghi) {
    const tu = don.fromDate > dauKy ? don.fromDate : dauKy;
    const den = don.toDate < cuoiKy ? don.toDate : cuoiKy;
    for (let d = tu; d <= den; d = themNgayISO(d, 1)) {
      if (caTheoNgay.get(d)?.kind === "off") continue;
      // Chỗ cố ý không đoán (3): hôm đó vẫn đi làm ⇒ đã tính công rồi.
      if (ngayCoCham.has(d)) continue;
      if (don.kind === "unpaid") unpaidLeaveDays++;
      else paidLeaveDays++;
    }
  }

  // Nghỉ CÓ LƯƠNG là ngày được trả tiền ⇒ vào tổng công. Nghỉ không lương thì
  // không. Cả hai vẫn hiện thành cột riêng trên bảng công (migration #250).
  const workDays = ngayCoCham.size + paidLeaveDays;
  const overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100;

  const { error } = await supabase.from("timesheets").upsert(
    {
      tenant_id: tenantId,
      employee_id: employeeId,
      period,
      work_days: Math.min(workDays, 31),
      flag_count: Math.min(flagCount, 200),
      late_count: Math.min(lateCount, 100),
      late_minutes: lateMinutes,
      early_leave_minutes: earlyLeaveMinutes,
      overtime_hours: Math.min(overtimeHours, 400),
      paid_leave_days: paidLeaveDays,
      unpaid_leave_days: unpaidLeaveDays,
    },
    { onConflict: "tenant_id,employee_id,period" },
  );
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/team");
  return {
    error: null,
    workDays,
    flagCount,
    lateCount,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeHours,
    paidLeaveDays,
    unpaidLeaveDays,
    daysWithoutShift,
  };
}

export async function chotBangCong(input: { timesheetId: string }): Promise<ActionResult> {
  const parsed = z.object({ timesheetId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, user } = ctx;

  const { data: daChot, error } = await supabase
    .from("timesheets")
    .update({ status: "closed", closed_by: user.id, closed_at: new Date().toISOString() })
    .eq("id", parsed.data.timesheetId)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // 0 dòng ở đây KHÔNG phải chuyện quyền: đo 20/08 cho thấy nhân viên và vai
  // chỉ-xem không ĐỌC nổi bảng công nên không tới được nút này. Cái tới được là
  // phiếu VỪA BỊ XOÁ / thuộc tiệm khác — bấm Chốt trên một phiếu không còn nữa
  // mà màn báo "Đã chốt" là sai sự thật ở đúng chỗ tính lương.
  if (!daChot?.length) return { error: "not_found" };

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

  const { data: daMo, error } = await supabase
    .from("timesheets")
    .update({ status: "draft", unlock_reason: parsed.data.reason })
    .eq("id", parsed.data.timesheetId)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // Cùng lý do với `chotBangCong` — 0 dòng = phiếu không còn. Mở khoá hụt mà
  // báo xong thì người dùng đi sửa số công trên một phiếu vẫn đang khoá, và
  // mọi lần sửa sau đó bị trigger chặn với câu "bảng công đã chốt".
  if (!daMo?.length) return { error: "not_found" };

  revalidatePath("/app/team");
  return { error: null };
}

// ==================== XẾP CA ====================

const GIO = /^([01]\d|2[0-3]):[0-5]\d$/;

const xepCaSchema = z.object({
  employeeId: z.uuid(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["morning", "afternoon", "full", "off"]).nullable(),
  /** #251 — giờ RIÊNG của ô ca. Cả hai null = dùng giờ chuẩn của tiệm. */
  startTime: z.string().regex(GIO).nullable().optional(),
  endTime: z.string().regex(GIO).nullable().optional(),
});

/** `kind` null = gỡ ca khỏi ô đó. Một người một ngày một ca (unique index #166). */
export async function xepCa(input: z.infer<typeof xepCaSchema>): Promise<ActionResult> {
  const parsed = xepCaSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;

  // Một nửa cặp giờ không dùng được, và ca qua đêm không được hỗ trợ (điểm chốt
  // 4 của migration #251). CSDL đã chặn cả hai bằng `shifts_gio_rieng_hop_le`;
  // bắt ở đây nữa để người dùng nhận câu đúng thay vì "Lưu thất bại, thử lại".
  const co = (v: string | null | undefined) => (v ? v : null);
  const bd = co(d.startTime);
  const kt = co(d.endTime);
  if ((bd === null) !== (kt === null)) return { error: "shift_time_pair" };
  if (bd && kt && phutTrongNgay(kt) <= phutTrongNgay(bd)) return { error: "shift_time_order" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, tenantId } = ctx;

  const { error } = d.kind
    ? await supabase.from("shifts").upsert(
        {
          tenant_id: tenantId,
          employee_id: d.employeeId,
          work_date: d.workDate,
          kind: d.kind,
          // Ca "Nghỉ" không có giờ — giữ giờ riêng trên một ô Nghỉ là để lại rác
          // mà lần sau đổi ô đó sang ca thật sẽ âm thầm dùng nhầm.
          start_time: d.kind === "off" ? null : bd,
          end_time: d.kind === "off" ? null : kt,
        },
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

const gioCaSchema = z
  .object({
    morningStart: z.string().regex(GIO),
    morningEnd: z.string().regex(GIO),
    afternoonStart: z.string().regex(GIO),
    afternoonEnd: z.string().regex(GIO),
    lateGraceMin: z.number().int().min(0).max(120),
    overtimeMinMinutes: z.number().int().min(0).max(240),
  })
  .refine((v) => phutTrongNgay(v.morningEnd) > phutTrongNgay(v.morningStart), {
    path: ["morningEnd"],
  })
  .refine((v) => phutTrongNgay(v.afternoonEnd) > phutTrongNgay(v.afternoonStart), {
    path: ["afternoonEnd"],
  });

/**
 * #251 — bộ giờ CHUẨN của tiệm + ân hạn + ngưỡng tăng ca.
 *
 * Không siết vai ở đây: RLS `attendance_settings_manage` (#232) đã chốt
 * owner/admin, và siết hai nơi là hai sự thật rồi sẽ lệch. Nhưng PHẢI đếm dòng
 * — `upsert` bị RLS chặn thì ném 42501 (đo ở `soat-ghi-im-lang.mjs`), còn
 * `.select()` rỗng vẫn là đường im lặng nếu tiệm biến mất giữa chừng.
 */
export async function luuGioCa(input: z.infer<typeof gioCaSchema>): Promise<ActionResult> {
  const parsed = gioCaSchema.safeParse(input);
  if (!parsed.success) return { error: "shift_time_order" };
  const d = parsed.data;

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, tenantId } = ctx;

  const { data: daLuu, error } = await supabase
    .from("attendance_settings")
    .upsert(
      {
        tenant_id: tenantId,
        shift_morning_start: d.morningStart,
        shift_morning_end: d.morningEnd,
        shift_afternoon_start: d.afternoonStart,
        shift_afternoon_end: d.afternoonEnd,
        late_grace_min: d.lateGraceMin,
        overtime_min_minutes: d.overtimeMinMinutes,
      },
      { onConflict: "tenant_id" },
    )
    .select("tenant_id");
  if (error) return { error: loiGhi(error.message) };
  if (!daLuu?.length) return { error: "not_found" };

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

  const { data: daQuyet, error } = await supabase
    .from("leave_requests")
    .update({
      status: parsed.data.approve ? "approved" : "rejected",
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.leaveId)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // Đo 20/08: nhân viên và vai chỉ-xem KHÔNG đọc được đơn nghỉ nên không tới
  // được nút này; tự-duyệt-đơn-mình thì trigger `leave_khong_tu_quyet` ném lỗi
  // rõ ràng. 0 dòng còn lại đúng một nghĩa: đơn đã bị rút / đã xoá. Không đếm
  // thì màn báo "Đã duyệt" một cái đơn không còn tồn tại.
  if (!daQuyet?.length) return { error: "not_found" };

  revalidatePath("/app/team");
  return { error: null };
}
