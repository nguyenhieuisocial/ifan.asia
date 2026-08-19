"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Màn Tuyển dụng (V8, migration #170).
 *
 * QUYỀN: chốt chặn thật là RLS + RPC `candidate_hire`. Ở đây KHÔNG dựng thêm
 * một bảng quyền song song (hai nơi kiểm là hai nơi lệch nhau khi một bên sửa
 * mà bên kia quên) — việc của tầng này là DỊCH lỗi kỹ thuật của Postgres thành
 * câu người thường hiểu, và không bao giờ báo "đã lưu" khi chưa lưu được gì.
 *
 * BẪY ĐÃ DÍNH HAI LẦN TRONG DỰ ÁN, không được quên: mọi bảng ở đây có
 * `tenant_id` NOT NULL và KHÔNG có default. RLS `with check` chỉ chặn SAI tiệm,
 * nó KHÔNG tự điền tiệm đúng — thiếu `tenant_id` là mọi lần bấm đều rơi vào
 * thông báo chung chung "chưa lưu được".
 */

export type KetQua = { error: string | null };
export type KetQuaNhanViec =
  | { error: null; link: string }
  | { error: string; link?: undefined };

/** Người đang đăng nhập + tiệm đang mở. null = chưa đăng nhập / chưa có tiệm. */
async function boiCanh() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return null;
  return { supabase, userId: user.id, tenantId: tenant.id as string };
}

/**
 * Lỗi Postgres → khoá dịch. Mọi khoá trả về ở đây PHẢI có mặt trong
 * `messages/vi.json` và `messages/en.json` nhánh `recruitment.errors`, nếu không
 * người dùng nhận được một chuỗi khoá thô thay vì lời giải thích.
 */
function loiGhi(message: string): string {
  // `employees.candidate_id` là `on delete restrict` — xoá hồ sơ ứng viên đã
  // thành nhân viên phải BÁO RÕ chứ không nuốt thành "chưa xoá được".
  if (/violates foreign key|employees_candidate_id_fkey/i.test(message))
    return "da_thanh_nhan_su_khong_xoa";
  if (/row-level security/i.test(message)) return "khong_du_quyen";
  if (/candidates_khoang_luong_hop_le/i.test(message)) return "khoang_luong_nguoc";
  if (/interviews_ket_qua_di_kem_moc/i.test(message)) return "loi_ky_thuat";
  return "chua_luu_duoc";
}

/**
 * Lỗi riêng của RPC `candidate_hire` — hàm này raise exception bằng chuỗi mã,
 * và mỗi mã cần một câu giải thích khác nhau. Gộp chung vào `loiGhi` thì
 * "không đủ quyền" và "ứng viên chưa có email" cùng ra một câu vô nghĩa.
 */
function loiNhanViec(message: string): string {
  if (/forbidden/i.test(message)) return "chi_chu_tiem_nhan_viec";
  if (/candidate_email_required/i.test(message)) return "thieu_email_ung_vien";
  if (/candidate_not_found/i.test(message)) return "khong_thay_ung_vien";
  if (/employees_candidate_unique/i.test(message)) return "da_nhan_viec_roi";
  if (/seat_limit_reached/i.test(message)) return "het_ghe";
  if (/no_tenant_context/i.test(message)) return "no_tenant";
  if (/invalid_token_hash/i.test(message)) return "loi_ky_thuat";
  return loiGhi(message);
}

// ════════════════════════════════════════════════════════════════════
// TIN TUYỂN
// ════════════════════════════════════════════════════════════════════

const tinSchema = z.object({
  title: z.string().trim().min(1, "thieu_ten_tin").max(160, "ten_tin_qua_dai"),
  headcount: z.number().int().min(1, "so_luong_it_nhat_1").max(999, "so_luong_qua_lon"),
  note: z.string().trim().max(500).nullable(),
});

export async function taoTinTuyen(input: z.infer<typeof tinSchema>): Promise<KetQua> {
  const parsed = tinSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { error } = await ctx.supabase.from("job_openings").insert({
    tenant_id: ctx.tenantId, // BẮT BUỘC — xem khối chú thích đầu file.
    title: parsed.data.title,
    headcount: parsed.data.headcount,
    note: parsed.data.note,
    created_by: ctx.userId,
  });
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/recruitment");
  return { error: null };
}

/**
 * Sửa tin tuyển: tiêu đề · số lượng · ghi chú. ĐÚNG 3 trường của form đăng tin.
 *
 * KHÔNG đụng `status`: đóng/mở đi bằng `doiTrangThaiTinTuyen`. Hai đường ghi
 * vào cùng một cột là chỗ hai thao tác ghi đè lẫn nhau mà không ai thấy.
 *
 * Tin ĐÃ ĐÓNG vẫn sửa được — đo trên CSDL thật 19/08: RLS cho phép, đóng tin là
 * việc đảo ngược được bằng nút "Mở lại", và không có gì phái sinh từ ba trường
 * này (hồ sơ ứng viên chỉ giữ `job_opening_id`, không chép tiêu đề sang).
 */
export async function suaTinTuyen(
  id: string,
  input: z.infer<typeof tinSchema>,
): Promise<KetQua> {
  const dinhDanh = z.uuid().safeParse(id);
  if (!dinhDanh.success) return { error: "du_lieu_khong_hop_le" };
  const parsed = tinSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { data, error } = await ctx.supabase
    .from("job_openings")
    .update({
      title: parsed.data.title,
      headcount: parsed.data.headcount,
      note: parsed.data.note,
    })
    .eq("id", dinhDanh.data)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // Cùng cái bẫy của `doiTrangThaiTinTuyen`: RLS lọc hết thì Postgres KHÔNG
  // báo lỗi, chỉ chạm 0 dòng. Đếm dòng, không tin `error === null`.
  // (Đo 19/08: vai Chỉ xem chạy đúng lệnh này — không lỗi, rowCount 0.)
  if (!data || data.length === 0) return { error: "khong_du_quyen" };

  revalidatePath("/app/recruitment");
  return { error: null };
}

export async function doiTrangThaiTinTuyen(
  id: string,
  status: "open" | "closed",
): Promise<KetQua> {
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(["open", "closed"]) })
    .safeParse({ id, status });
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { data, error } = await ctx.supabase
    .from("job_openings")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // RLS chặn UPDATE thì Postgres KHÔNG báo lỗi, chỉ chạm 0 dòng. Không tự nhận
  // ra thì màn hình báo "đã lưu" trong khi chẳng lưu gì (bẫy đã dính 18/08).
  if (!data || data.length === 0) return { error: "khong_du_quyen" };

  revalidatePath("/app/recruitment");
  return { error: null };
}

// ════════════════════════════════════════════════════════════════════
// ỨNG VIÊN
// ════════════════════════════════════════════════════════════════════

const ungVienSchema = z
  .object({
    jobOpeningId: z.uuid().nullable(),
    fullName: z.string().trim().min(1, "thieu_ten_ung_vien").max(120, "ten_qua_dai"),
    phone: z.string().trim().max(30).nullable(),
    // Email nullable CÓ CHỦ ĐÍCH (migration #170): ứng viên nộp qua điện thoại
    // vẫn phải vào được bảng. Nhưng thiếu email thì bước "Nhận việc" không gửi
    // được lời mời — màn hình nói trước chuyện đó, không đợi tới lúc bấm.
    email: z.email("email_khong_hop_le").max(160).nullable(),
    dob: z.string().nullable(),
    experienceYears: z.number().min(0, "kinh_nghiem_am").max(80, "kinh_nghiem_qua_lon").nullable(),
    expectedSalaryMinVnd: z.number().int().min(0).nullable(),
    expectedSalaryMaxVnd: z.number().int().min(0).nullable(),
    availableFrom: z.string().nullable(),
    source: z.string().trim().max(120).nullable(),
    note: z.string().trim().max(1000).nullable(),
  })
  .refine(
    (v) =>
      v.expectedSalaryMinVnd === null ||
      v.expectedSalaryMaxVnd === null ||
      v.expectedSalaryMaxVnd >= v.expectedSalaryMinVnd,
    { message: "khoang_luong_nguoc" },
  );

export async function taoUngVien(input: z.infer<typeof ungVienSchema>): Promise<KetQua> {
  const parsed = ungVienSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const d = parsed.data;
  const { error } = await ctx.supabase.from("candidates").insert({
    tenant_id: ctx.tenantId,
    job_opening_id: d.jobOpeningId,
    full_name: d.fullName,
    phone: d.phone,
    email: d.email,
    dob: d.dob,
    experience_years: d.experienceYears,
    expected_salary_min_vnd: d.expectedSalaryMinVnd,
    expected_salary_max_vnd: d.expectedSalaryMaxVnd,
    available_from: d.availableFrom,
    source: d.source,
    note: d.note,
    created_by: ctx.userId,
  });
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/recruitment");
  return { error: null };
}

/**
 * Sửa hồ sơ ứng viên — ĐÚNG 11 trường của form thêm hồ sơ, không hơn.
 *
 * KHÔNG đụng `stage` (đi bằng `doiCotUngVien` / nút Nhận việc) và KHÔNG đụng
 * `rejected_at` / `reject_reason` (đi bằng `loaiUngVien`). `rejected_at` là
 * đồng hồ đếm hạn giữ 12 tháng theo Nghị định 13 — để một lệnh sửa tên chạm vào
 * nó là âm thầm kéo dài hạn giữ dữ liệu cá nhân của một người ngoài tiệm.
 *
 * ⛔ HỒ SƠ ĐÃ NHẬN VIỆC KHÔNG SỬA ĐƯỢC, và `.neq("stage", "hired")` mới là chốt
 * chặn — nút bị ẩn ngoài màn hình không chặn được một request gõ tay.
 * Căn cứ ĐO ĐƯỢC trên CSDL thật (19/08): `candidate_hire` CHÉP họ tên · điện
 * thoại · ngày sinh sang `employees` và email sang `invitations`; trên bảng
 * `candidates` chỉ có đúng MỘT trigger là `touch_updated_at`, và hàm duy nhất
 * nhắc cả `candidates` lẫn `employees` cũng chỉ là `candidate_hire`. Tức là
 * KHÔNG có đường nào đẩy sửa đổi sang hồ sơ nhân sự: sửa ở đây sau khi đã nhận
 * việc chỉ đẻ ra sự thật thứ hai, trong khi lời mời mang email cũ thì đã gửi đi
 * mất rồi. Muốn sửa người đang đi làm thì sửa ở hồ sơ nhân sự.
 *
 * Hồ sơ ĐÃ LOẠI thì VẪN sửa được: chưa có gì phát đi (lý do loại cố ý ứng viên
 * không thấy), hồ sơ được giữ lại chính là để đối chiếu/liên hệ về sau, nên gõ
 * nhầm số điện thoại ở đó vẫn phải chữa được.
 */
export async function suaUngVien(
  id: string,
  input: z.infer<typeof ungVienSchema>,
): Promise<KetQua> {
  const dinhDanh = z.uuid().safeParse(id);
  if (!dinhDanh.success) return { error: "du_lieu_khong_hop_le" };
  const parsed = ungVienSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const d = parsed.data;
  const { data, error } = await ctx.supabase
    .from("candidates")
    .update({
      job_opening_id: d.jobOpeningId,
      full_name: d.fullName,
      phone: d.phone,
      email: d.email,
      dob: d.dob,
      experience_years: d.experienceYears,
      expected_salary_min_vnd: d.expectedSalaryMinVnd,
      expected_salary_max_vnd: d.expectedSalaryMaxVnd,
      available_from: d.availableFrom,
      source: d.source,
      note: d.note,
    })
    .eq("id", dinhDanh.data)
    .neq("stage", "hired")
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) {
    // 0 dòng ở đây có ĐÚNG hai nguyên nhân, và chúng cần hai câu khác hẳn nhau:
    // bị RLS chặn, hay hồ sơ đã nhận việc. Nên hỏi thêm một câu đọc. Câu đọc đó
    // cũng đi qua RLS, nên người không đủ quyền đọc ra 0 dòng và nhận đúng câu
    // "không đủ quyền" (đo 19/08: vai Chỉ xem đọc hồ sơ = 0 dòng).
    const { data: hienTrang } = await ctx.supabase
      .from("candidates")
      .select("stage")
      .eq("id", dinhDanh.data)
      .maybeSingle();
    return {
      error: hienTrang?.stage === "hired" ? "da_nhan_viec_khong_sua" : "khong_du_quyen",
    };
  }

  revalidatePath("/app/recruitment");
  return { error: null };
}

/**
 * Chuyển hồ sơ sang cột khác. KHÔNG nhận 'hired': cột đó chỉ tới được bằng nút
 * "Nhận việc" (xem chú thích `MOVABLE_STAGES` trong types.ts).
 */
export async function doiCotUngVien(id: string, stage: string): Promise<KetQua> {
  if (stage === "hired") return { error: "phai_dung_nut_nhan_viec" };
  const parsed = z
    .object({
      id: z.uuid(),
      stage: z.enum(["applied", "interview_scheduled", "probation"]),
    })
    .safeParse({ id, stage });
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { data, error } = await ctx.supabase
    .from("candidates")
    .update({ stage: parsed.data.stage })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "khong_du_quyen" };

  revalidatePath("/app/recruitment");
  return { error: null };
}

/**
 * Loại hồ sơ. Đóng dấu `rejected_at` — đây là mốc để đếm hạn giữ 12 tháng
 * (Nghị định 13). Không có mốc thì không ai biết hồ sơ nằm đó bao lâu rồi.
 */
export async function loaiUngVien(id: string, reason: string): Promise<KetQua> {
  const parsed = z
    .object({ id: z.uuid(), reason: z.string().trim().max(300) })
    .safeParse({ id, reason });
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { data, error } = await ctx.supabase
    .from("candidates")
    .update({
      rejected_at: new Date().toISOString(),
      reject_reason: parsed.data.reason || null,
    })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "khong_du_quyen" };

  revalidatePath("/app/recruitment");
  return { error: null };
}

/**
 * Xoá một hồ sơ đã quá hạn giữ 12 tháng.
 *
 * CSDL cố ý KHÔNG có cron dọn (quyết định 5 của thẻ design: máy hỏi, người
 * quyết) — nên đây là đúng một cú bấm của con người, cho đúng một hồ sơ.
 */
export async function xoaHoSoHetHan(id: string): Promise<KetQua> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { data, error } = await ctx.supabase
    .from("candidates")
    .delete()
    .eq("id", parsed.data)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "khong_du_quyen" };

  revalidatePath("/app/recruitment");
  return { error: null };
}

// ════════════════════════════════════════════════════════════════════
// PHỎNG VẤN
// ════════════════════════════════════════════════════════════════════

const lichSchema = z.object({
  candidateId: z.uuid(),
  scheduledAt: z.string().min(1, "thieu_gio_hen"),
  interviewerUserId: z.uuid().nullable(),
});

export async function datLichPhongVan(input: z.infer<typeof lichSchema>): Promise<KetQua> {
  const parsed = lichSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { data, error } = await ctx.supabase
    .from("interviews")
    .insert({
      tenant_id: ctx.tenantId,
      candidate_id: parsed.data.candidateId,
      scheduled_at: parsed.data.scheduledAt,
      interviewer_user_id: parsed.data.interviewerUserId,
    })
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "khong_du_quyen" };

  // Hẹn xong thì hồ sơ phải sang cột "Đã hẹn phỏng vấn", nếu không cờ đỏ quá hạn
  // sẽ bật cho một hồ sơ vẫn nằm ở cột "Mới nộp" — người dùng không hiểu vì sao.
  // Chỉ nâng từ 'applied' lên: hồ sơ đang thử việc mà hẹn thêm buổi nữa thì
  // KHÔNG được kéo ngược về.
  await ctx.supabase
    .from("candidates")
    .update({ stage: "interview_scheduled" })
    .eq("id", parsed.data.candidateId)
    .eq("stage", "applied");

  revalidatePath("/app/recruitment");
  return { error: null };
}

export async function ghiKetQuaPhongVan(
  interviewId: string,
  result: "pass" | "fail" | "hold",
): Promise<KetQua> {
  const parsed = z
    .object({ interviewId: z.uuid(), result: z.enum(["pass", "fail", "hold"]) })
    .safeParse({ interviewId, result });
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  // `result` và `result_at` đi CẶP — check constraint `interviews_ket_qua_di_kem_moc`
  // từ chối nếu ghi một mà thiếu cái kia.
  const { data, error } = await ctx.supabase
    .from("interviews")
    .update({ result: parsed.data.result, result_at: new Date().toISOString() })
    .eq("id", parsed.data.interviewId)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "khong_du_quyen_ghi_ket_qua" };

  revalidatePath("/app/recruitment");
  return { error: null };
}

/**
 * Thêm ghi chú phỏng vấn.
 *
 * RLS `interview_notes_nguoi_pv_va_chu_tiem` chỉ cho NGƯỜI PHỎNG VẤN và CHỦ
 * TIỆM — quản trị viên cũng bị chặn, cố ý (điểm 2 của migration #170). Đây là
 * nhận xét về một con người, không phải dữ liệu vận hành.
 */
export async function themGhiChuPhongVan(
  interviewId: string,
  body: string,
): Promise<KetQua> {
  const parsed = z
    .object({
      interviewId: z.uuid(),
      body: z.string().trim().min(1, "ghi_chu_rong").max(2000, "ghi_chu_qua_dai"),
    })
    .safeParse({ interviewId, body });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { data, error } = await ctx.supabase
    .from("interview_notes")
    .insert({
      tenant_id: ctx.tenantId,
      interview_id: parsed.data.interviewId,
      interviewer_user_id: ctx.userId,
      body: parsed.data.body,
    })
    .select("id");
  // RLS ở bảng này hẹp hơn cả kho (chỉ người phỏng vấn + chủ tiệm) nên lý do bị
  // chặn phải nói đúng chuyện đó, không dùng câu "không đủ quyền" chung chung.
  if (error) {
    return {
      error: /row-level security/i.test(error.message)
        ? "khong_du_quyen_ghi_chu"
        : loiGhi(error.message),
    };
  }
  if (!data || data.length === 0) return { error: "khong_du_quyen_ghi_chu" };

  revalidatePath("/app/recruitment");
  return { error: null };
}

// ════════════════════════════════════════════════════════════════════
// NHẬN VIỆC
// ════════════════════════════════════════════════════════════════════

/**
 * "Nhận việc": hồ sơ ứng viên → hồ sơ nhân sự + lời mời, trong MỘT transaction
 * (RPC `candidate_hire`).
 *
 * BA ĐIỀU KHÔNG ĐƯỢC ĐỔI:
 *  · KHÔNG truyền vai vào RPC. Vai `'staff'` đóng cứng trong thân hàm — tham số
 *    vai ở đây là một đường leo thang quyền trọn vẹn (chú thích migration #170).
 *  · CHỈ gửi SHA-256 của token; token gốc chỉ xuất hiện đúng một lần, trong
 *    đường link trả về cho người bấm (cùng khuôn `inviteMember`).
 *  · KHÔNG tự chặn vai ở tầng này. RPC từ chối vai không đủ quyền và ta DỊCH lý
 *    do đó ra tiếng người — nút phải phản hồi, không được là nút chết.
 */
export async function nhanViec(
  candidateId: string,
  startedOn: string | null,
): Promise<KetQuaNhanViec> {
  const parsed = z
    .object({ candidateId: z.uuid(), startedOn: z.string().nullable() })
    .safeParse({ candidateId, startedOn });
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { error } = await ctx.supabase.rpc("candidate_hire", {
    p_candidate_id: parsed.data.candidateId,
    p_token_hash: tokenHash,
    ...(parsed.data.startedOn ? { p_started_on: parsed.data.startedOn } : {}),
  });
  if (error) return { error: loiNhanViec(error.message) };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  revalidatePath("/app/recruitment");
  revalidatePath("/app/settings/team");
  return { error: null, link: `${proto}://${host}/invite/${token}` };
}
