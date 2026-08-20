"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { kpiMonthLabel } from "@/lib/kpi";
import { HOA_HONG_MOI_TRANG, TUI_TAM_UNG, type PayslipLine } from "./queries";

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
  //
  // ⚠️ HOA HỒNG PHẢI LẤY HẾT, KHÔNG ĐƯỢC ĐẶT TRẦN.
  // Bản trước để `.limit(1000)`. Đo 20/08 trên tiệm mẫu 20 người: **1.548 khoản
  // tháng 06 · 1.622 khoản tháng 07 · 1.132 khoản tháng 08**. Nghĩa là bảng lương
  // tính qua phần mềm sẽ **bỏ sót 548–622 khoản** — tiền thật của nhân viên —
  // và không có gì báo, vì Supabase chỉ trả về ít dòng hơn chứ không báo lỗi.
  // Đúng quả bom hẹn giờ đã ghi ở việc #21, nay đã đủ dữ liệu để nó nổ.
  //
  // Chữa bằng LẤY HẾT TRANG, không phải nâng trần: nâng trần chỉ dời quả bom
  // sang tiệm to hơn, và lần sau sẽ không ai nhớ vì sao con số đó là 5.000.
  const [{ data: emps }, { data: sheets }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, base_salary_vnd, overtime_rate_vnd, ended_on, pay_type, daily_rate_vnd, hourly_rate_vnd")
      .or(`ended_on.is.null,ended_on.gte.${ky.fromDate}`)
      .limit(200),
    supabase
      .from("timesheets")
      .select("id, employee_id, work_days, work_minutes, overtime_hours, status")
      .eq("period", period)
      .limit(200),
  ]);

  type KhoanHoaHong = {
    id: string;
    employee_id: string;
    amount_vnd: number;
    earned_on: string;
    note: string | null;
  };
  const hoaHong: KhoanHoaHong[] = [];
  const CO_TRANG = 1000;
  for (let tu = 0; ; tu += CO_TRANG) {
    const { data: trang, error: loiTrang } = await supabase
      .from("commission_entries")
      .select("id, employee_id, amount_vnd, earned_on, note")
      .gte("earned_on", ky.fromDate)
      .lte("earned_on", ky.toDate)
      .order("id")
      .range(tu, tu + CO_TRANG - 1);
    // Hụt một trang giữa chừng mà vẫn tính tiếp = trả lương thiếu trong im lặng.
    // Thà báo hỏng để chủ tiệm bấm lại còn hơn phát phiếu lương sai.
    if (loiTrang) return { error: loiGhi(loiTrang.message) };
    if (!trang?.length) break;
    hoaHong.push(...(trang as KhoanHoaHong[]));
    if (trang.length < CO_TRANG) break;
  }

  if (!emps || emps.length === 0) return { error: "no_employees" };

  // ⚠️ NGƯỜI ĐÃ NGHỈ VẪN CÓ THỂ PHÁT SINH HOA HỒNG SAU NGÀY NGHỈ.
  // Bộ lọc người ở trên chỉ lấy ai còn làm trong kỳ (`ended_on >= đầu kỳ`) —
  // đúng cho lương cứng và tăng ca, nhưng SÓT một ca thật:
  //
  //   Nhân viên nghỉ 30/06. Ngày 06/07 khách TRẢ một món chị bán hồi 27/06.
  //   Trigger đảo hoa hồng ghi một khoản ÂM mang ngày 06/07 — đúng ngày trả
  //   hàng. Kỳ lương 07 không xếp chị (đã nghỉ trước kỳ) ⇒ khoản âm ấy
  //   **không rơi vào phiếu lương nào**, tiệm đã trả dư hồi tháng 6 và không
  //   có đường thu lại.
  //
  // Đo được 20/08 trên tiệm mẫu Sắc Màu Boutique: đúng một khoản −17.750đ lọt
  // ra ngoài. Số nhỏ, nhưng là lỗ THẬT ở đường tiền, và tiệm bán online có tỉ
  // lệ trả hàng cao thì nó không còn nhỏ.
  //
  // ⇒ Kéo thêm những người ĐÃ NGHỈ mà vẫn có khoản trong kỳ. Chỉ những người
  // thật sự có khoản, không lôi cả danh sách người từng nghỉ vào — phiếu lương
  // rỗng cho người đã đi là rác, không phải sự thật.
  const coHoaHong = new Set(hoaHong.map((h) => h.employee_id));
  const daXep = new Set(emps.map((e) => e.id as string));
  const thieu = [...coHoaHong].filter((id) => !daXep.has(id));
  if (thieu.length) {
    const { data: nguoiDaNghi } = await supabase
      .from("employees")
      .select("id, full_name, base_salary_vnd, overtime_rate_vnd, ended_on, pay_type, daily_rate_vnd, hourly_rate_vnd")
      .in("id", thieu);
    // Người đã nghỉ KHÔNG hưởng lương cứng và tăng ca của kỳ này — họ không đi
    // làm ngày nào. Đặt về 0 để phiếu chỉ còn đúng phần hoa hồng phát sinh.
    for (const n of nguoiDaNghi ?? [])
      emps.push({
        ...n,
        base_salary_vnd: 0,
        overtime_rate_vnd: 0,
        pay_type: "monthly",
        daily_rate_vnd: 0,
        hourly_rate_vnd: 0,
      });
  }

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
    const giaTangCa = Number(e.overtime_rate_vnd ?? 0);

    // #284 — LƯƠNG CỨNG TÍNH THEO KIỂU TRẢ CỦA TỪNG NGƯỜI.
    //
    // Trước bản này chỗ đây luôn ghi đúng số lương tháng, bất kể đi bao nhiêu
    // công; màn Bảng lương chỉ *hỏi* lại rồi để người dùng sửa tay. Rất nhiều
    // tiệm dịch vụ Việt Nam trả theo công ngày — với họ, phần mềm đang tính
    // sai mặc định và cách chữa duy nhất là mỗi tháng sửa tay từng phiếu.
    //
    // `monthly` giữ NGUYÊN nếp cũ để không phiếu lương nào đang có đổi số.
    const kieuTra = ((e.pay_type as string | null) ?? "monthly") as "monthly" | "daily" | "hourly";
    const soCong = Number(sheet?.work_days ?? 0);
    const soGio = Math.round((Number(sheet?.work_minutes ?? 0) / 60) * 100) / 100;
    const luongCung =
      kieuTra === "daily"
        ? Math.round(Number(e.daily_rate_vnd ?? 0) * soCong)
        : kieuTra === "hourly"
          ? Math.round(Number(e.hourly_rate_vnd ?? 0) * soGio)
          : Number(e.base_salary_vnd ?? 0);

    if (sheet && luongCung > 0) {
      dongMoi.push({
        tenant_id: tenantId,
        payslip_id: phieuId,
        kind: "base",
        amount_vnd: luongCung,
        source_type: "timesheet",
        source_id: sheet.id as string,
        // Nhãn phải NÓI RA cách tính, không chỉ ra số: người nhận phiếu cần
        // đối chiếu được "20 công × 300.000đ" chứ không phải nhìn một con số
        // rồi tin. Kiểu tháng giữ nguyên nhãn cũ.
        label:
          kieuTra === "daily"
            ? t("lines.baseDailyLabel", {
                period: nhanKy,
                days: soCong,
                rate: Number(e.daily_rate_vnd ?? 0),
              })
            : kieuTra === "hourly"
              ? t("lines.baseHourlyLabel", {
                  period: nhanKy,
                  hours: soGio,
                  rate: Number(e.hourly_rate_vnd ?? 0),
                })
              : t("lines.baseLabel", { period: nhanKy, days: soCong }),
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
  kind: z.enum(["advance", "insurance", "allowance", "bonus", "penalty", "adjust"]),
  /** Số dương; `isDeduction` quyết định dấu — người dùng không phải gõ dấu trừ. */
  amountVnd: z.number().int().positive().max(1_000_000_000),
  isDeduction: z.boolean(),
  label: z.string().trim().min(1).max(200),
  /**
   * CHỈ có nghĩa với khoản TẠM ỨNG TRỪ vào lương. Mặc định 'none' để mọi lời
   * gọi cũ giữ nguyên hành vi — thêm đường ghi sổ quỹ không được đổi ngầm cách
   * chạy của những chỗ chưa biết tới nó.
   */
  cashFund: z.enum(TUI_TAM_UNG).default("none"),
});

/**
 * 'manual' là đường DUY NHẤT không có gốc máy, nên #167 bắt buộc nó có nhãn
 * giải thích + người ghi. Không nới ở đây: thiếu nhãn thì chặn ngay tại form,
 * và nếu lọt xuống thì CSDL vẫn từ chối (ca 14 của bộ kiểm).
 *
 * ════════════════════════════════════════════════════════════════
 * TẠM ỨNG NAY ĐỂ LẠI DẤU TRONG SỔ QUỸ (#270)
 * ════════════════════════════════════════════════════════════════
 * Đo 21/08 trên sáu tiệm mẫu: `payslip_lines` mang **157.000.000đ** tạm ứng,
 * còn `cash_entries` KHÔNG có một phiếu chi nào ứng với số đó. Tiền mặt ra khỏi
 * két ngày 12, sổ quỹ chỉ biết vào ngày trả lương THÁNG SAU (và chỉ biết phần
 * thực nhận đã trừ) ⇒ đối soát két giữa tháng luôn thiếu đúng số đó, không có
 * gì giải thích. Giá trị `source_type = 'cash_entry'` có sẵn trong CHECK của
 * #167 và có sẵn nhãn i18n nhưng CHƯA DÒNG NÀO dùng — nó được dựng cho việc này.
 *
 * ⛔ Ghi chú phiếu quỹ CHỈ nói kỳ nào, KHÔNG nêu tên ai — cùng luật với phiếu
 * chi lương gộp ở `chotKyLuong`: `cash_entries_rw` mở cho cả vai `manager`, mà
 * cả mảng này tồn tại để quản lý không thấy lương đồng nghiệp.
 */
export async function themDongTay(input: z.infer<typeof dongTaySchema>): Promise<ActionResult> {
  const parsed = dongTaySchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const d = parsed.data;

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, user, tenantId } = ctx;
  const t = await getTranslations("payroll");

  // Chỉ khoản TẠM ỨNG TRỪ vào lương mới là tiền RA KHỎI KÉT. Bảo hiểm là khoản
  // GIỮ LẠI (tiệm chưa chi cho ai), bù trừ cộng thì không có tiền nào ra.
  const ghiQuy = d.kind === "advance" && d.isDeduction && d.cashFund !== "none";
  let sourceType: "manual" | "cash_entry" = "manual";
  let sourceId: string | null = null;

  if (ghiQuy) {
    const { data: phieu } = await supabase
      .from("payslips")
      .select("period_id")
      .eq("id", d.payslipId)
      .maybeSingle();
    if (!phieu) return { error: "not_found" };
    const { data: ky } = await supabase
      .from("payroll_periods")
      .select("period")
      .eq("id", phieu.period_id as string)
      .maybeSingle();
    if (!ky) return { error: "period_not_found" };

    const { data: quy, error: loiQuy } = await supabase
      .from("cash_entries")
      .insert({
        tenant_id: tenantId,
        direction: "out",
        amount_vnd: d.amountVnd,
        fund: d.cashFund,
        category: "salary",
        note: t("cash.advanceNote", { period: kpiMonthLabel(ky.period as string) }),
        recorded_by: user.id,
      })
      .select("id")
      .single();
    // Không ghi được phiếu quỹ thì DỪNG, không âm thầm lùi về 'manual': người
    // bấm đã chọn "Tiền mặt" và sẽ tin là sổ quỹ đã có phiếu.
    if (loiQuy || !quy) return { error: "cash_entry_failed" };
    sourceType = "cash_entry";
    sourceId = quy.id as string;
  }

  const { error } = await supabase.from("payslip_lines").insert({
    tenant_id: tenantId,
    payslip_id: d.payslipId,
    kind: d.kind,
    amount_vnd: d.isDeduction ? -d.amountVnd : d.amountVnd,
    source_type: sourceType,
    source_id: sourceId,
    label: d.label,
    created_by: user.id,
  });
  if (error) {
    // Phiếu quỹ đã ghi mà dòng lương hỏng (kỳ vừa bị chốt, quyền bị gỡ…) ⇒ thu
    // hồi phiếu quỹ. Để lại một phiếu chi mồ côi là làm sổ quỹ nói một khoản
    // tiền không còn ai chịu trách nhiệm.
    if (sourceId) {
      const { data: daHuy } = await supabase
        .from("cash_entries")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", sourceId)
        .select("id");
      // Thu hồi hụt: phiếu chi nằm lại trong sổ mà không dòng lương nào giải
      // thích nó. Đếm dòng và nói ra — im lặng ở đây là để sổ quỹ mang một
      // khoản chi không ai truy được về đâu.
      if (!daHuy?.length) return { error: "cash_entry_orphan" };
    }
    return { error: loiGhi(error.message) };
  }

  // Dòng đã ghi mà tổng phiếu không cộng lại được thì phiếu sai số ngay — nói
  // ra chứ không nuốt (xem khối ⚠️ trong `capNhatTongPhieu`).
  if ((await capNhatTongPhieu(supabase, d.payslipId)) === null) return { error: "save_failed" };
  revalidatePath("/app/payroll");
  if (ghiQuy) revalidatePath("/app/cashbook");
  return { error: null };
}

export async function xoaDongTay(input: { lineId: string; payslipId: string }): Promise<ActionResult> {
  const parsed = z.object({ lineId: z.uuid(), payslipId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  // Chỉ xoá được dòng NGƯỜI TỰ THÊM — 'manual' (ghi tay) và 'cash_entry' (tạm
  // ứng có phiếu quỹ đi kèm, #270). Dòng máy sinh ('timesheet'/'commission')
  // phải sửa ở gốc rồi tính lại, không xoá lẻ ở đây cho khớp mắt.
  const { data: daXoa, error } = await supabase
    .from("payslip_lines")
    .delete()
    .eq("id", parsed.data.lineId)
    .in("source_type", ["manual", "cash_entry"])
    .select("id, source_type, source_id");
  if (error) return { error: loiGhi(error.message) };
  // 0 dòng KHÔNG phải chuyện quyền — đo 20/08: quản lý/nhân viên/chỉ-xem không
  // ĐỌC nổi `payslip_lines` nên không tới được nút này. Nó có nghĩa là dòng đó
  // không còn, hoặc KHÔNG PHẢI dòng ghi tay (bộ lọc `source_type = 'manual'`
  // ngay trên loại nó ra). Không đếm thì màn báo "Đã xoá" trên một dòng vẫn
  // nằm nguyên trong phiếu lương.
  if (!daXoa?.length) return { error: "not_found" };

  if ((await capNhatTongPhieu(supabase, parsed.data.payslipId)) === null) return { error: "save_failed" };
  revalidatePath("/app/payroll");

  // Dòng tạm ứng đi kèm một phiếu chi thật trong Sổ quỹ (#270) — xoá dòng thì
  // phiếu đó cũng phải rời sổ, nếu không tiệm mang một khoản chi 500.000đ mà
  // không phiếu lương nào giải thích. Xoá MỀM, đúng nếp Sổ quỹ.
  const dong = daXoa[0] as { source_type: string; source_id: string | null };
  if (dong.source_type === "cash_entry" && dong.source_id) {
    const { data: conSong } = await supabase
      .from("cash_entries")
      .select("id")
      .eq("id", dong.source_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (conSong) {
      const { data: daHuy } = await supabase
        .from("cash_entries")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", dong.source_id)
        .select("id");
      revalidatePath("/app/cashbook");
      // Đếm dòng: quyền lọc mất dòng thì Supabase im hệt lúc xoá được.
      if (!daHuy?.length) return { error: "cash_entry_orphan" };
    }
  }
  return { error: null };
}

// ==================== CHI TIẾT HOA HỒNG (TẢI KHI BUNG) ====================

const hoaHongSchema = z.object({
  payslipId: z.uuid(),
  offset: z.number().int().min(0).max(1_000_000),
});

/**
 * Chi tiết từng khoản hoa hồng của MỘT phiếu, tải theo trang khi người dùng bung
 * dòng gộp (việc #216). Màn thu gọn chỉ cần con số tổng; ngành đông giao dịch có
 * tới ~1.105 dòng/phiếu nên KHÔNG tải sẵn hết về client, chỉ lấy khi bấm xem.
 *
 * Phân trang bằng `.range` — KHÔNG trần cứng (cổng soat-tran-dem-ngam). RLS
 * `payslips_select`/`payslip_lines` tự lọc: chủ/quản trị đọc mọi phiếu, người
 * khác chỉ phiếu của chính mình ⇒ action này không siết vai lần nữa.
 */
export async function layDongHoaHong(
  input: z.infer<typeof hoaHongSchema>,
): Promise<{ lines: PayslipLine[]; error: string | null }> {
  const parsed = hoaHongSchema.safeParse(input);
  if (!parsed.success) return { lines: [], error: "invalid_input" };
  const { payslipId, offset } = parsed.data;

  const ctx = await boiCanh();
  if (!ctx.ok) return { lines: [], error: ctx.error };
  const { supabase } = ctx;

  const { data, error } = await supabase
    .from("payslip_lines")
    .select("id, kind, amount_vnd, source_type, source_id, label, created_at")
    .eq("payslip_id", payslipId)
    .eq("source_type", "commission")
    // Khoá phụ `id` để phân trang xác định — cùng thứ tự với layPhieuLuong,
    // tránh trùng/hụt dòng ở ranh giới trang khi created_at trùng.
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + HOA_HONG_MOI_TRANG - 1);
  if (error) return { lines: [], error: loiGhi(error.message) };

  const lines: PayslipLine[] = (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as PayslipLine["kind"],
    amountVnd: Number(r.amount_vnd ?? 0),
    sourceType: r.source_type as PayslipLine["sourceType"],
    sourceId: (r.source_id as string | null) ?? null,
    label: (r.label as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
  return { lines, error: null };
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
    .select("id, status, cash_entry_id")
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

  // Ghi chú CHỈ nói kỳ nào — xem khối ⛔ ở trên. Nó là chữ CHO NGƯỜI ĐỌC;
  // máy KHÔNG được dùng nó làm khoá nhận diện (xem khối ⛔⛔ ngay dưới).
  const ghiChu = t("cash.note", { period: kpiMonthLabel(period) });

  // ════════════════════════════════════════════════════════════════
  // ⛔⛔ NHẬN PHIẾU CHI BẰNG SỐ PHIẾU, KHÔNG BẰNG CÂU CHỮ (migration #270)
  // ════════════════════════════════════════════════════════════════
  // Bản trước dò trùng bằng `.eq("note", ghiChu)`. `ghiChu` là chuỗi ĐÃ DỊCH,
  // mà ngôn ngữ nằm trong cookie `locale` của TỪNG TRÌNH DUYỆT
  // (`i18n/request.ts`), không phải thuộc tính của tiệm. Hệ quả đo được trong
  // mã: chủ tiệm (tiếng Việt) chốt ⇒ phiếu ghi "Lương kỳ 08/2026"; quản trị
  // viên (tiếng Anh) mở khoá → tính lại → chốt lại ⇒ máy tìm "Payroll 08/2026",
  // KHÔNG THẤY ⇒ ghi PHIẾU CHI THỨ HAI. Sổ quỹ ghi trả lương hai lần cho một
  // kỳ — với tiệm 20 người ở dữ liệu thật là ~195 triệu ghi khống. Cùng lỗi ấy
  // còn vô hiệu hoá bản vá đồng bộ 20/08: nhánh SỬA số tiền không bao giờ chạy.
  //
  // ⇒ Kỳ lương giữ `cash_entry_id` của chính nó. Đừng bao giờ đưa `note` quay
  //   lại làm điều kiện tìm kiếm.
  let phieuId = (ky.cash_entry_id as string | null) ?? null;
  let tienPhieuCu: number | null = null;

  if (phieuId) {
    const { data: cu } = await supabase
      .from("cash_entries")
      .select("id, amount_vnd")
      .eq("id", phieuId)
      // Chủ tiệm xoá phiếu đó khỏi Sổ quỹ (xoá mềm) thì kỳ này KHÔNG còn phiếu
      // chi nào — phải ghi phiếu mới, không phải sửa một phiếu đã bị gỡ.
      .is("deleted_at", null)
      .maybeSingle();
    if (!cu) phieuId = null;
    else tienPhieuCu = Number(cu.amount_vnd ?? 0);
  }

  // ── Kỳ không còn gì để trả ──────────────────────────────────────
  // `cash_entries` bắt `amount_vnd > 0` nên không có "phiếu chi 0đ". Nếu kỳ TỪNG
  // có phiếu chi mà nay tổng về 0 hoặc âm (ví dụ cả kỳ chỉ còn một khoản hoa
  // hồng đảo ngược của người đã nghỉ), phiếu cũ PHẢI rời sổ — để lại là Sổ quỹ
  // giữ một khoản chi cho một kỳ không ai nhận đồng nào, và bấm chốt lại bao
  // nhiêu lần cũng không sửa được vì nhánh này thoát sớm.
  if (tongChi <= 0) {
    if (phieuId) {
      const { data: daHuy } = await supabase
        .from("cash_entries")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", phieuId)
        .select("id");
      revalidatePath("/app/payroll");
      revalidatePath("/app/cashbook");
      if (!daHuy?.length) return { error: "cash_entry_failed", cashEntryFailed: true };
      return { error: null };
    }
    revalidatePath("/app/payroll");
    return { error: null };
  }

  if (phieuId) {
    // ⚠️ Chỉ thoát sớm khi số tiền VẪN KHỚP.
    //
    // Luồng CHÍNH THỨC "mở khoá → tính lại → chốt lại" (có nút, có ô nhập lý
    // do) làm tổng lương đổi, còn phiếu chi thì đứng im ở số cũ. Bảng lương
    // một số, Sổ quỹ một số, không có gì đỏ.
    //
    // Đo được 20/08 trên tiệm mẫu: kỳ 06/2026 sau khi bù hoa hồng đơn cũ,
    // lương thật là 194.911.200đ trong khi phiếu chi vẫn ghi 162,6tr —
    // **lệch 32,3tr câm lặng**. Cùng lớp bệnh với bốn lỗ tiền ở #194.
    if (tienPhieuCu === tongChi) {
      revalidatePath("/app/payroll");
      revalidatePath("/app/cashbook");
      return { error: null };
    }
    const { data: daSua, error: loiSua } = await supabase
      .from("cash_entries")
      .update({ amount_vnd: tongChi })
      .eq("id", phieuId)
      .select("id");
    revalidatePath("/app/payroll");
    revalidatePath("/app/cashbook");
    // Phải kiểm CẢ số dòng sửa được, không chỉ kiểm `error`. Nếu luật quyền
    // lọc mất dòng thì Supabase trả `error = null` kèm mảng RỖNG — báo "xong"
    // trong khi chẳng sửa được gì (`soat-ghi-im-lang.mjs` canh đúng lớp này).
    if (loiSua || !daSua || daSua.length === 0)
      return { error: "cash_entry_failed", cashEntryFailed: true };
    return { error: null };
  }

  const { data: phieuMoi, error: loiQuy } = await supabase
    .from("cash_entries")
    .insert({
      tenant_id: tenantId,
      direction: "out",
      amount_vnd: tongChi,
      fund,
      category: "salary",
      note: ghiChu,
      recorded_by: user.id,
    })
    .select("id")
    .single();

  revalidatePath("/app/payroll");
  revalidatePath("/app/cashbook");
  // Kỳ ĐÃ chốt rồi — không nuốt lỗi thành "xong": báo đúng chuyện phiếu chi
  // chưa vào sổ để chủ tiệm ghi tay, thay vì để hai màn lệch nhau âm thầm.
  if (loiQuy || !phieuMoi) return { error: "cash_entry_failed", cashEntryFailed: true };

  // Nối số phiếu vào kỳ. Trigger `payroll_close_guard` (#270) mở đúng một khe
  // cho lần điền đầu tiên này — mọi cột mang tiền vẫn khoá cứng.
  const { data: daNoi } = await supabase
    .from("payroll_periods")
    .update({ cash_entry_id: phieuMoi.id as string })
    .eq("id", ky.id as string)
    .select("id");
  revalidatePath("/app/payroll");
  // Nối hụt là NGUY: phiếu chi đã nằm trong sổ nhưng kỳ không nhớ nó, nên lần
  // "mở khoá → chốt lại" sau sẽ ghi phiếu thứ hai — đúng cái lỗ vừa bịt. Nói
  // thẳng ra để chủ tiệm biết mà soát Sổ quỹ, chứ không báo "xong".
  if (!daNoi?.length) return { error: "cash_entry_unlinked" };
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
