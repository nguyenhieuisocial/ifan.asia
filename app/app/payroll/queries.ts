import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bảng lương (V7, migration #167 + bản vá #172). Thẻ: design-system/man-bang-luong.html.
 *
 * ⛔ NGOẠI LỆ QUYỀN QUAN TRỌNG NHẤT CỦA CẢ KHO — đọc trước khi sửa file này:
 * `manager` KHÔNG được xem lương người khác. Ở mọi bảng tài chính khác
 * (cash_entries, item_costs…) manager đi cùng owner/admin; ở đây KHÔNG.
 * `payroll_periods_rw` chỉ owner/admin, `payslips_select` chỉ owner/admin hoặc
 * ĐÚNG phiếu của chính mình. Quản lý VẪN xem phiếu của CHÍNH HỌ (tiền của họ)
 * và VẪN duyệt bảng công — hai việc đó tách hẳn nhau.
 * Ca 20-26 của scripts/nhan-su-luong-smoke.mjs khoá đúng luật này.
 *
 * ⚠️ `payslips.gross_vnd` / `deduction_vnd` KHÔNG có trigger tự cộng từ dòng —
 * chỉ `net_vnd` là cột sinh (gross − deduction). Nên tầng web PHẢI cộng lại hai
 * số đó sau mỗi lần đổi dòng (xem actions.ts `capNhatTongPhieu`), và màn hình
 * hiển thị số cộng TỪ DÒNG để không bao giờ nói sai dù cột có lệch.
 */

export const PAYSLIP_LINE_LIMIT = 500;

export const LINE_KINDS = ["base", "commission", "overtime", "advance", "insurance", "adjust"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

/** Loại dòng người dùng được TỰ THÊM — 'base'/'commission'/'overtime' do máy sinh. */
export const MANUAL_KINDS = ["advance", "insurance", "adjust"] as const;
export type ManualKind = (typeof MANUAL_KINDS)[number];

export type PayrollPeriod = {
  id: string;
  period: string;
  status: "draft" | "closed";
  totalVnd: number;
  closedAt: string | null;
  unlockReason: string | null;
};

export type PayslipLine = {
  id: string;
  kind: LineKind;
  amountVnd: number;
  sourceType: "timesheet" | "commission" | "cash_entry" | "manual";
  sourceId: string | null;
  label: string | null;
  createdAt: string;
};

export type Payslip = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  grossVnd: number;
  deductionVnd: number;
  netVnd: number;
  lines: PayslipLine[];
  createdAt: string;
};

export async function layKyLuong(
  supabase: SupabaseClient,
  period: string,
): Promise<PayrollPeriod | null> {
  const { data } = await supabase
    .from("payroll_periods")
    .select("id, period, status, total_vnd, closed_at, unlock_reason")
    .eq("period", period)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    period: data.period as string,
    status: data.status as "draft" | "closed",
    totalVnd: Number(data.total_vnd ?? 0),
    closedAt: (data.closed_at as string | null) ?? null,
    unlockReason: (data.unlock_reason as string | null) ?? null,
  };
}

/**
 * Phiếu lương + dòng tiền. `periodId` null ⇒ lấy phiếu CỦA CHÍNH NGƯỜI ĐANG
 * ĐĂNG NHẬP (RLS tự lọc) — đường này dành cho nhân viên và cho quản lý xem
 * phiếu của mình, những người KHÔNG đọc được bảng `payroll_periods`.
 */
export async function layPhieuLuong(
  supabase: SupabaseClient,
  periodId: string | null,
  tenTheoHoSo: Map<string, string>,
): Promise<Payslip[]> {
  let q = supabase
    .from("payslips")
    .select("id, employee_id, gross_vnd, deduction_vnd, net_vnd, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (periodId) q = q.eq("period_id", periodId);

  const { data, error } = await q;
  if (error || !data || data.length === 0) return [];

  const { data: lineRows } = await supabase
    .from("payslip_lines")
    .select("id, payslip_id, kind, amount_vnd, source_type, source_id, label, created_at")
    .in(
      "payslip_id",
      data.map((p) => p.id as string),
    )
    .order("created_at", { ascending: true })
    .limit(PAYSLIP_LINE_LIMIT);

  const theoPhieu = new Map<string, PayslipLine[]>();
  for (const r of lineRows ?? []) {
    const arr = theoPhieu.get(r.payslip_id as string) ?? [];
    arr.push({
      id: r.id as string,
      kind: r.kind as LineKind,
      amountVnd: Number(r.amount_vnd ?? 0),
      sourceType: r.source_type as PayslipLine["sourceType"],
      sourceId: (r.source_id as string | null) ?? null,
      label: (r.label as string | null) ?? null,
      createdAt: r.created_at as string,
    });
    theoPhieu.set(r.payslip_id as string, arr);
  }

  return data.map((p) => ({
    id: p.id as string,
    employeeId: p.employee_id as string,
    employeeName: tenTheoHoSo.get(p.employee_id as string) ?? null,
    grossVnd: Number(p.gross_vnd ?? 0),
    deductionVnd: Number(p.deduction_vnd ?? 0),
    netVnd: Number(p.net_vnd ?? 0),
    lines: theoPhieu.get(p.id as string) ?? [],
    createdAt: p.created_at as string,
  }));
}

/** Thực nhận tính TỪ DÒNG — số hiển thị không phụ thuộc cột tổng có lệch hay không. */
export function tongTuDong(lines: PayslipLine[]): { gross: number; deduction: number; net: number } {
  let gross = 0;
  let deduction = 0;
  for (const l of lines) {
    if (l.amountVnd >= 0) gross += l.amountVnd;
    else deduction += -l.amountVnd;
  }
  return { gross, deduction, net: gross - deduction };
}

// ==================== SOÁT TRƯỚC KHI CHỐT ====================

/**
 * Quyết định 3 của thẻ: trước khi chốt máy SOÁT VÀ HỎI — hỏi chứ không tự
 * quyết. Tự trừ lương người ta là việc không được phép làm thay chủ tiệm, nên
 * mọi mục ở đây chỉ là câu hỏi; không mục nào tự sửa số.
 */
export type PreCloseIssue =
  | { kind: "timesheetNotClosed"; name: string }
  | { kind: "noPayslip"; name: string }
  | { kind: "noTimesheet"; name: string }
  | { kind: "fullBaseButShortDays"; name: string; days: number }
  | { kind: "payrollRatio"; percent: number; prevPercent: number | null };
