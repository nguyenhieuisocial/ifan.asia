"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { kpiMonthLabel } from "@/lib/kpi";

/**
 * Bảng lương (V7, migration #167 + vá #172). Thẻ man-bang-luong.html.
 *
 * QUYỀN: không siết lại ở tầng này — `payroll_periods_rw` / `payslips_manage`
 * (owner/admin) đã là hàng rào thật. Màn hình chỉ ẩn/không hiện cho đúng vai
 * (lịch sự giao diện); quản lý gọi thẳng action vẫn bị CSDL từ chối.
 *
 * ⚠️ Mọi INSERT phải tự truyền `tenant_id` — các bảng #167 khai `tenant_id not
 * null` KHÔNG default, RLS `with check` chỉ chặn ghi sang tiệm khác chứ không
 * tự điền tiệm đúng.
 */

type ActionResult = { error: string | null };

function loiGhi(message: string): string {
  if (/payroll_locked/.test(message)) return "payroll_locked";
  if (/timesheet_not_closed/.test(message)) return "timesheet_not_closed";
  if (/payslip_lines_co_goc/.test(message)) return "line_needs_source";
  if (/row-level security/i.test(message)) return "forbidden";
  return "save_failed";
}

/** Cờ `ok` là thứ TypeScript dựa vào để tách hai nhánh — xem app/app/team/actions.ts. */
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

/** Khoảng thời gian của kỳ 'yyyy-MM-01' theo giờ VN — cùng công thức monthKeyToRangeVN. */
function khoangKy(period: string) {
  const [y, m] = period.split("-").map(Number);
  return {
    fromIso: new Date(Date.UTC(y, m - 1, 1) - 7 * 3600 * 1000).toISOString(),
    toIso: new Date(Date.UTC(y, m, 1) - 7 * 3600 * 1000).toISOString(),
    fromDate: period,
    toDate: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  };
}

const kySchema = z.string().regex(/^\d{4}-\d{2}-01$/);

/**
 * Cộng lại `gross_vnd`/`deduction_vnd` của một phiếu TỪ CÁC DÒNG của nó.
 *
 * Phải làm ở tầng web vì #167 không có trigger cộng — chỉ `net_vnd` là cột sinh
 * (gross − deduction). Gọi sau MỌI lần thêm/xoá dòng, không có ngoại lệ: bỏ một
 * lần là phiếu mang con số không khớp dòng, đúng thứ quyết định 2 của thẻ cấm.
 */
async function capNhatTongPhieu(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payslipId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("payslip_lines")
    .select("amount_vnd")
    .eq("payslip_id", payslipId)
    .limit(500);
  let gross = 0;
  let deduction = 0;
  for (const l of data ?? []) {
    const v = Number(l.amount_vnd ?? 0);
    if (v >= 0) gross += v;
    else deduction += -v;
  }
  // ⚠️ Đếm dòng, không phải cho vui. Lệnh này bị lọc/hụt thì Supabase trả
  // `error = null` và 0 dòng — im hệt lúc ghi được — và phiếu giữ nguyên con số
  // CŨ trong khi các dòng của nó đã đổi. Đó đúng là thứ khối chú thích trên
  // cấm: "phiếu mang con số không khớp dòng". Không có gì báo, và người đọc
  // bảng lương tin vào con số sai.
  const { data: daGhi } = await supabase
    .from("payslips")
    .update({ gross_vnd: gross, deduction_vnd: deduction })
    .eq("id", payslipId)
    .select("id");
  if (!daGhi?.length) return null;
  return gross - deduction;
}

// ==================== TÍNH LẠI KỲ LƯƠNG ====================

/**
 * Quyết định 1 của thẻ: bảng lương CỘNG TỪ DỮ LIỆU ĐÃ CÓ (bảng công + hoa hồng
 * đã ghi), không có ô nào gõ tay tự do.
 *
 * Chạy lại được nhiều lần: xoá sạch dòng do MÁY sinh ('timesheet'/'commission')
 * rồi sinh lại, nhưng GIỮ NGUYÊN dòng ghi tay (tạm ứng, bảo hiểm, bù trừ) —
 * xoá luôn dòng người ta ghi là làm mất việc đã làm.
 */
export async function tinhLaiKyLuong(input: { period: string }): Promise<ActionResult> {
  const parsed = z.object({ period: kySchema }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const { period } = parsed.data;

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, tenantId } = ctx;
  const t = await getTranslations("payroll");
  const nhanKy = kpiMonthLabel(period);
  const ky = khoangKy(period);

  // 1. Kỳ lương — có thì dùng, chưa có thì mở kỳ nháp.
  const { data: kyCu } = await supabase
    .from("payroll_periods")
    .select("id, status")
    .eq("period", period)
    .maybeSingle();
  let periodId = kyCu?.id as string | undefined;
  if (kyCu?.status === "closed") return { error: "payroll_locked" };
  if (!periodId) {
    const { data, error } = await supabase
      .from("payroll_periods")
      .insert({ tenant_id: tenantId, period })
      .select("id")
      .single();
    if (error) return { error: loiGhi(error.message) };
    periodId = data.id as string;
  }

  // 2. Người còn làm trong kỳ + bảng công + hoa hồng của kỳ.
  const [{ data: emps }, { data: sheets }, { data: hoaHong }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, base_salary_vnd, overtime_rate_vnd, ended_on")
      .or(`ended_on.is.null,ended_on.gte.${ky.fromDate}`)
      .limit(200),
    supabase
      .from("timesheets")
      .select("id, employee_id, work_days, overtime_hours, status")
      .eq("period", period)
      .limit(200),
    supabase
      .from("commission_entries")
      .select("id, employee_id, amount_vnd, earned_on, note")
      .gte("earned_on", ky.fromDate)
      .lte("earned_on", ky.toDate)
      .limit(1000),
  ]);

  if (!emps || emps.length === 0) return { error: "no_employees" };

  const sheetTheoNguoi = new Map((sheets ?? []).map((s) => [s.employee_id as string, s]));
  const hhTheoNguoi = new Map<string, typeof hoaHong>();
  for (const h of hoaHong ?? []) {
    const arr = hhTheoNguoi.get(h.employee_id as string) ?? [];
    arr!.push(h);
    hhTheoNguoi.set(h.employee_id as string, arr);
  }

  let tongKy = 0;
  for (const e of emps) {
    const empId = e.id as string;

    const { data: phieu, error: loiPhieu } = await supabase
      .from("payslips")
      .upsert(
        { tenant_id: tenantId, period_id: periodId, employee_id: empId },
        { onConflict: "period_id,employee_id" },
      )
      .select("id")
      .single();
    if (loiPhieu || !phieu) return { error: loiGhi(loiPhieu?.message ?? "") };
    const phieuId = phieu.id as string;

    // Dọn dòng MÁY sinh, giữ dòng ghi tay.
    const { error: loiXoa } = await supabase
      .from("payslip_lines")
      .delete()
      .eq("payslip_id", phieuId)
      .in("source_type", ["timesheet", "commission"]);
    if (loiXoa) return { error: loiGhi(loiXoa.message) };

    const dongMoi: Record<string, unknown>[] = [];
    const sheet = sheetTheoNguoi.get(empId);
    const luongCung = Number(e.base_salary_vnd ?? 0);
    const giaTangCa = Number(e.overtime_rate_vnd ?? 0);

    if (sheet && luongCung > 0) {
      dongMoi.push({
        tenant_id: tenantId,
        payslip_id: phieuId,
        kind: "base",
        amount_vnd: luongCung,
        source_type: "timesheet",
        source_id: sheet.id as string,
        label: t("lines.baseLabel", { period: nhanKy, days: Number(sheet.work_days ?? 0) }),
      });
    }
    const gioTangCa = Number(sheet?.overtime_hours ?? 0);
    if (sheet && gioTangCa > 0 && giaTangCa > 0) {
      dongMoi.push({
        tenant_id: tenantId,
        payslip_id: phieuId,
        kind: "overtime",
        amount_vnd: Math.round(gioTangCa * giaTangCa),
        source_type: "timesheet",
        source_id: sheet.id as string,
        label: t("lines.overtimeLabel", { period: nhanKy, hours: gioTangCa }),
      });
    }
    // Mỗi khoản hoa hồng MỘT DÒNG, giữ `source_id` về đúng khoản gốc — quyết
    // định 2 của thẻ: bấm được để về tận nơi. Gộp thành một dòng tổng là mất
    // đường về, và số 3.240.000 lại thành con số không giải thích được.
    for (const h of hhTheoNguoi.get(empId) ?? []) {
      dongMoi.push({
        tenant_id: tenantId,
        payslip_id: phieuId,
        kind: "commission",
        amount_vnd: Number(h.amount_vnd ?? 0),
        source_type: "commission",
        source_id: h.id as string,
        label: (h.note as string | null) ?? t("lines.commissionLabel", { date: h.earned_on as string }),
      });
    }

    if (dongMoi.length > 0) {
      const { error } = await supabase.from("payslip_lines").insert(dongMoi);
      if (error) return { error: loiGhi(error.message) };
    }
    const tongPhieu = await capNhatTongPhieu(supabase, phieuId);
    if (tongPhieu === null) return { error: "save_failed" };
    tongKy += tongPhieu;
  }

  // Tổng kỳ ghi hụt thì màn Bảng lương hiện con số CŨ bên cạnh các phiếu MỚI —
  // hai số đá nhau ngay trên một màn hình, không có gì báo. Đếm dòng.
  const { data: daGhiTong } = await supabase
    .from("payroll_periods")
    .update({ total_vnd: Math.max(0, tongKy) })
    .eq("id", periodId)
    .select("id");
  if (!daGhiTong?.length) return { error: "save_failed" };

  revalidatePath("/app/payroll");
  return { error: null };
}

// ==================== DÒNG GHI TAY ====================

const dongTaySchema = z.object({
  payslipId: z.uuid(),
  kind: z.enum(["advance", "insurance", "adjust"]),
  /** Số dương; `isDeduction` quyết định dấu — người dùng không phải gõ dấu trừ. */
  amountVnd: z.number().int().positive().max(1_000_000_000),
  isDeduction: z.boolean(),
  label: z.string().trim().min(1).max(200),
});

/**
 * 'manual' là đường DUY NHẤT không có gốc máy, nên #167 bắt buộc nó có nhãn
 * giải thích + người ghi. Không nới ở đây: thiếu nhãn thì chặn ngay tại form,
 * và nếu lọt xuống thì CSDL vẫn từ chối (ca 14 của bộ kiểm).
 */
export async function themDongTay(input: z.infer<typeof dongTaySchema>): Promise<ActionResult> {
  const parsed = dongTaySchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, user, tenantId } = ctx;

  const { error } = await supabase.from("payslip_lines").insert({
    tenant_id: tenantId,
    payslip_id: d.payslipId,
    kind: d.kind,
    amount_vnd: d.isDeduction ? -d.amountVnd : d.amountVnd,
    source_type: "manual",
    label: d.label,
    created_by: user.id,
  });
  if (error) return { error: loiGhi(error.message) };

  // Dòng đã ghi mà tổng phiếu không cộng lại được thì phiếu sai số ngay — nói
  // ra chứ không nuốt (xem khối ⚠️ trong `capNhatTongPhieu`).
  if ((await capNhatTongPhieu(supabase, d.payslipId)) === null) return { error: "save_failed" };
  revalidatePath("/app/payroll");
  return { error: null };
}

export async function xoaDongTay(input: { lineId: string; payslipId: string }): Promise<ActionResult> {
  const parsed = z.object({ lineId: z.uuid(), payslipId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  // Chỉ xoá được dòng GHI TAY — dòng máy sinh phải sửa ở gốc (bảng công / hoa
  // hồng) rồi tính lại, không xoá lẻ ở đây cho khớp mắt.
  const { data: daXoa, error } = await supabase
    .from("payslip_lines")
    .delete()
    .eq("id", parsed.data.lineId)
    .eq("source_type", "manual")
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // 0 dòng KHÔNG phải chuyện quyền — đo 20/08: quản lý/nhân viên/chỉ-xem không
  // ĐỌC nổi `payslip_lines` nên không tới được nút này. Nó có nghĩa là dòng đó
  // không còn, hoặc KHÔNG PHẢI dòng ghi tay (bộ lọc `source_type = 'manual'`
  // ngay trên loại nó ra). Không đếm thì màn báo "Đã xoá" trên một dòng vẫn
  // nằm nguyên trong phiếu lương.
  if (!daXoa?.length) return { error: "not_found" };

  if ((await capNhatTongPhieu(supabase, parsed.data.payslipId)) === null) return { error: "save_failed" };
  revalidatePath("/app/payroll");
  return { error: null };
}

// ==================== CHỐT / MỞ KHOÁ ====================

const chotSchema = z.object({ period: kySchema, fund: z.enum(["cash", "bank"]) });

/**
 * Chốt kỳ lương → khoá + TỰ SINH PHIẾU CHI TRONG SỔ QUỸ (quyết định 4 của thẻ,
 * luật D1: một sự thật, một nơi ghi).
 *
 * ⛔ MỘT PHIẾU GỘP CHO CẢ KỲ — KHÔNG mỗi người một phiếu, và `note` KHÔNG ĐƯỢC
 * chứa tên người / mã nhân sự / bất cứ thứ gì suy ra được lương từng người.
 * Lý do: `cash_entries_rw` (migration #127) mở cho CẢ vai `manager`, mà cả mảng
 * này tồn tại để quản lý KHÔNG thấy lương đồng nghiệp. Ghi mỗi người một phiếu
 * kèm tên là mở đúng cái cửa vừa khoá ở #167.
 * Phương án "giấu dòng salary khỏi quản lý bằng RLS" ĐÃ BỊ LOẠI: giấu đi thì
 * tổng sổ quỹ của quản lý không khớp tiền thật — đúng lớp lỗi "số liệu đá nhau
 * giữa các màn" mà dự án đã tốn rất nhiều công dập.
 * ⇒ Ai định "cải tiến" thành ghi chi tiết từng người: đọc lại đoạn này trước.
 */
export async function chotKyLuong(
  input: z.infer<typeof chotSchema>,
): Promise<ActionResult & { cashEntryFailed?: boolean }> {
  const parsed = chotSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const { period, fund } = parsed.data;

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, user, tenantId } = ctx;
  const t = await getTranslations("payroll");

  const { data: ky } = await supabase
    .from("payroll_periods")
    .select("id, status")
    .eq("period", period)
    .maybeSingle();
  if (!ky) return { error: "period_not_found" };
  if (ky.status === "closed") return { error: "payroll_locked" };

  const { data: phieu } = await supabase
    .from("payslips")
    .select("net_vnd")
    .eq("period_id", ky.id as string)
    .limit(200);
  if (!phieu || phieu.length === 0) return { error: "no_payslips" };
  const tongChi = phieu.reduce((s, p) => s + Number(p.net_vnd ?? 0), 0);

  // Chốt TRƯỚC: đây là bước có chốt chặn liên bảng (bảng công phải chốt hết).
  const { data: daChot, error: loiChot } = await supabase
    .from("payroll_periods")
    .update({ status: "closed", closed_by: user.id, closed_at: new Date().toISOString() })
    .eq("id", ky.id as string)
    .select("id");
  if (loiChot) return { error: loiGhi(loiChot.message) };
  // Chốt hụt mà đi tiếp là hỏng NẶNG: khối bên dưới ghi một phiếu chi tiền mặt
  // cho cả kỳ. Kỳ chưa chốt + tiền đã ghi ⇒ bấm Chốt lại lần nữa là chi tiền
  // lần thứ hai. Đếm dòng và dừng ngay tại đây.
  if (!daChot?.length) return { error: "payroll_locked" };

  if (tongChi <= 0) {
    revalidatePath("/app/payroll");
    return { error: null };
  }

  // Ghi chú CHỈ nói kỳ nào — xem khối ⛔ ở trên.
  const ghiChu = t("cash.note", { period: kpiMonthLabel(period) });

  // Mở khoá rồi chốt lại không được sinh phiếu chi thứ hai: nhận diện bằng đúng
  // (loại khoản 'salary' + ghi chú của kỳ này), vì `cash_entries` không có cột
  // kỳ lương để khoá trùng ở CSDL.
  const { data: daCo } = await supabase
    .from("cash_entries")
    .select("id, amount_vnd")
    .eq("category", "salary")
    .eq("note", ghiChu)
    .is("deleted_at", null)
    .limit(1);
  if (daCo && daCo.length > 0) {
    // ⚠️ Chỉ thoát sớm khi số tiền VẪN KHỚP.
    //
    // Bản trước thoát sớm vô điều kiện. Nó chặn được phiếu chi thứ hai, nhưng
    // bỏ quên chuyện đồng bộ: luồng CHÍNH THỨC "mở khoá → tính lại → chốt lại"
    // (có nút, có ô nhập lý do) làm tổng lương đổi, còn phiếu chi thì đứng im ở
    // số cũ. Bảng lương một số, Sổ quỹ một số, không có gì đỏ.
    //
    // Đo được 20/08 trên tiệm mẫu: kỳ 06/2026 sau khi bù hoa hồng đơn cũ, lương
    // thật là 194.911.200đ trong khi phiếu chi vẫn ghi 162,6tr — **lệch 32,3tr
    // câm lặng**. Chưa ai gặp vì tới hôm đó chưa từng có ai mở khoá một kỳ
    // lương đã chốt trên dữ liệu thật. Cùng lớp bệnh với bốn lỗ tiền ở #194.
    const cu = daCo[0] as { id: string; amount_vnd: number };
    if (Number(cu.amount_vnd) === tongChi) {
      revalidatePath("/app/payroll");
      revalidatePath("/app/cashbook");
      return { error: null };
    }
    const { data: daSua, error: loiSua } = await supabase
      .from("cash_entries")
      .update({ amount_vnd: tongChi })
      .eq("id", cu.id)
      .select("id");
    revalidatePath("/app/payroll");
    revalidatePath("/app/cashbook");
    // Phải kiểm CẢ số dòng sửa được, không chỉ kiểm `error`. Nếu luật quyền lọc
    // mất dòng thì Supabase trả `error = null` kèm mảng RỖNG — báo "xong" trong
    // khi chẳng sửa được gì. Đó chính là lớp "báo Đã lưu mà không lưu" ở #193,
    // và kho này có cổng kiểm riêng canh nó (`soat-ghi-im-lang.mjs`).
    // Sửa hụt mà báo xong ở đây = để Bảng lương và Sổ quỹ lệch nhau câm lặng.
    if (loiSua || !daSua || daSua.length === 0)
      return { error: "cash_entry_failed", cashEntryFailed: true };
    return { error: null };
  }

  const { error: loiQuy } = await supabase.from("cash_entries").insert({
    tenant_id: tenantId,
    direction: "out",
    amount_vnd: tongChi,
    fund,
    category: "salary",
    note: ghiChu,
    recorded_by: user.id,
  });

  revalidatePath("/app/payroll");
  revalidatePath("/app/cashbook");
  // Kỳ ĐÃ chốt rồi — không nuốt lỗi thành "xong": báo đúng chuyện phiếu chi
  // chưa vào sổ để chủ tiệm ghi tay, thay vì để hai màn lệch nhau âm thầm.
  if (loiQuy) return { error: "cash_entry_failed", cashEntryFailed: true };
  return { error: null };
}

export async function moKhoaKyLuong(input: {
  period: string;
  reason: string;
}): Promise<ActionResult> {
  const parsed = z
    .object({ period: kySchema, reason: z.string().trim().min(1).max(300) })
    .safeParse(input);
  if (!parsed.success) return { error: "unlock_reason_required" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  const { data: daMo, error } = await supabase
    .from("payroll_periods")
    .update({ status: "draft", unlock_reason: parsed.data.reason })
    .eq("period", parsed.data.period)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // 0 dòng = kỳ lương đó không tồn tại (gõ sai tháng, hoặc kỳ đã bị xoá). Báo
  // "Đã mở khoá" rồi để người dùng đi sửa số trên một kỳ vẫn đang chốt là đẩy
  // họ vào một chuỗi thao tác bị trigger chặn mà không hiểu vì sao.
  if (!daMo?.length) return { error: "period_not_found" };

  revalidatePath("/app/payroll");
  return { error: null };
}
