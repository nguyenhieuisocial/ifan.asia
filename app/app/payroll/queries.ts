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

/** Số dòng hoa hồng tải mỗi lần bung chi tiết (việc #216) — phân trang, không dồn cả nghìn dòng về client. */
export const HOA_HONG_MOI_TRANG = 100;

export const LINE_KINDS = [
  "base",
  "commission",
  "overtime",
  "advance",
  "insurance",
  // #283 — ba loại này thêm sau. Trước đó mọi khoản phụ cấp / thưởng / phạt
  // phải nhét vào "điều chỉnh", và đo được 0 dòng ai dùng ô đó — nghĩa là
  // chúng đang nằm ngoài phần mềm chứ không phải không tồn tại.
  "allowance",
  "bonus",
  "penalty",
  "adjust",
] as const;
export type LineKind = (typeof LINE_KINDS)[number];

/** Loại dòng người dùng được TỰ THÊM — 'base'/'commission'/'overtime' do máy sinh. */
export const MANUAL_KINDS = [
  "advance",
  "insurance",
  "allowance",
  "bonus",
  "penalty",
  "adjust",
] as const;
export type ManualKind = (typeof MANUAL_KINDS)[number];

/**
 * Túi tiền đã đưa cho khoản TẠM ỨNG (#270). 'none' = chủ tiệm đã tự ghi phiếu
 * chi trong Sổ quỹ rồi, đừng ghi thêm phiếu thứ hai.
 *
 * Ở đây chứ không ở `actions.ts`: file kia mang `"use server"`, mà mọi export
 * của một mô-đun `"use server"` phải là hàm async — khai một hằng ở đó là lỗi
 * dựng bản (cổng `scripts/soat-use-server-exports.mjs`).
 */
export const TUI_TAM_UNG = ["cash", "bank", "none"] as const;
export type TuiTamUng = (typeof TUI_TAM_UNG)[number];

export type PayrollPeriod = {
  id: string;
  period: string;
  status: "draft" | "closed";
  totalVnd: number;
  closedAt: string | null;
  unlockReason: string | null;
  /**
   * Số phiếu chi lương của kỳ này trong Sổ quỹ (migration #270).
   *
   * ⛔ ĐÂY LÀ KHOÁ LIÊN KẾT DUY NHẤT — đừng bao giờ quay lại dò theo câu ghi
   * chú. Bản trước dò `note = t("cash.note", …)`, mà ngôn ngữ nằm trong cookie
   * của TỪNG trình duyệt (`i18n/request.ts`): chốt bằng tiếng Việt rồi mở khoá
   * chốt lại bằng tiếng Anh là máy không thấy phiếu cũ và ghi phiếu chi THỨ HAI
   * — sổ quỹ trả lương hai lần cho một kỳ.
   */
  cashEntryId: string | null;
};

/** Phiếu chi lương của một kỳ, đọc từ Sổ quỹ để đối chiếu hai màn. */
export type PhieuChiKy = {
  id: string;
  amountVnd: number;
  fund: "cash" | "bank";
  createdAt: string;
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

export type CommissionSummary = {
  count: number;
  totalVnd: number;
};

export type Payslip = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  grossVnd: number;
  deductionVnd: number;
  netVnd: number;
  /** CHỈ dòng KHÔNG phải hoa hồng (lương cứng, tăng ca, ghi tay). Hoa hồng gộp ở `commission`. */
  lines: PayslipLine[];
  /** Gộp mọi dòng hoa hồng thành một tổng — chi tiết tải riêng khi bung (layDongHoaHong). */
  commission: CommissionSummary;
  createdAt: string;
};

export async function layKyLuong(
  supabase: SupabaseClient,
  period: string,
): Promise<PayrollPeriod | null> {
  const { data } = await supabase
    .from("payroll_periods")
    .select("id, period, status, total_vnd, closed_at, unlock_reason, cash_entry_id")
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
    cashEntryId: (data.cash_entry_id as string | null) ?? null,
  };
}

/**
 * Phiếu chi lương của kỳ — để màn Bảng lương ĐỐI CHIẾU với Sổ quỹ.
 *
 * Vì sao khối đối chiếu phải có: đo 21/08 trên tiệm mẫu `sample-shop` kỳ
 * 07/2026 — bảng lương 98.990.450đ, phiếu chi trong sổ quỹ 99.008.200đ,
 * **lệch 17.750đ** (khoản hoa hồng đảo ngược của người đã nghỉ được bù vào
 * phiếu lương nhưng phiếu quỹ giữ số cũ). Không màn nào trong kho nói ra con
 * số lệch đó — chủ tiệm chỉ thấy hai số ở hai chỗ và không có lý do nào để
 * nghi ngờ. Trả về `null` = kỳ chưa nối phiếu chi nào; đó là câu KHÁC HẲN
 * "lệch 0đ" và màn hình phải nói khác.
 */
export async function layPhieuChiKy(
  supabase: SupabaseClient,
  cashEntryId: string | null,
): Promise<PhieuChiKy | null> {
  if (!cashEntryId) return null;
  const { data } = await supabase
    .from("cash_entries")
    .select("id, amount_vnd, fund, created_at")
    .eq("id", cashEntryId)
    // Xoá mềm ở Sổ quỹ nghĩa là phiếu KHÔNG còn — coi như chưa có, để khối đối
    // chiếu nói "chưa có phiếu chi" thay vì in một con số đã bị gỡ khỏi sổ.
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    amountVnd: Number(data.amount_vnd ?? 0),
    fund: (data.fund as "cash" | "bank") ?? "cash",
    createdAt: data.created_at as string,
  };
}

/**
 * Thực nhận kỳ TRƯỚC theo từng người — chỉ để SO SÁNH trên phiếu kỳ này.
 *
 * ⚠️ Đây là chỗ DUY NHẤT của mảng đọc cột tổng (`net_vnd`) thay vì cộng từ
 * dòng, và có lý do: cộng từ dòng cho cả một kỳ nữa nghĩa là kéo thêm hàng
 * nghìn dòng hoa hồng của tháng trước về chỉ để in một câu so sánh (đo được:
 * một phiếu ngành đông giao dịch có tới 1.101 dòng). Con số này KHÔNG phải số
 * phải trả — số phải trả của kỳ trước nằm trên chính màn của kỳ đó, cộng từ
 * dòng như mọi khi, và câu so sánh có đường bấm sang đó để tự tra.
 */
export async function layNetKyTruoc(
  supabase: SupabaseClient,
  periodId: string | null,
): Promise<Map<string, number>> {
  const ra = new Map<string, number>();
  if (!periodId) return ra;
  const { data } = await supabase
    .from("payslips")
    .select("employee_id, net_vnd")
    .eq("period_id", periodId)
    .limit(200);
  for (const p of data ?? []) ra.set(p.employee_id as string, Number(p.net_vnd ?? 0));
  return ra;
}

const CO_TRANG_DOC = 1000;

/**
 * Đọc HẾT payslip_lines bằng .range — KHÔNG trần cứng. Đây là quả bom đúng lớp
 * cổng scripts/soat-tran-dem-ngam.mjs canh: bản cũ để `.limit(500)` cho CẢ kỳ,
 * mà ngành đông giao dịch có phiếu tới ~1.105 dòng hoa hồng (việc #216) ⇒ query
 * cắt mất hơn nửa số dòng và Supabase KHÔNG báo lỗi — tổng lương hiển thị thiếu
 * trong im lặng. `chiHoaHong=false` lấy dòng thường (đủ cột để hiện), `=true`
 * chỉ lấy `amount_vnd` để cộng tổng, không kéo chi tiết cả nghìn dòng về.
 */
async function docHetDong(
  supabase: SupabaseClient,
  payslipIds: string[],
  chiHoaHong: boolean,
): Promise<{ rows: Record<string, unknown>[]; error: unknown }> {
  // Kiểu `string` (không phải literal) để dùng overload .select lỏng — chuỗi cột
  // động khiến bộ phân tích kiểu của PostgREST báo lỗi nếu để nguyên literal.
  const cols: string = chiHoaHong
    ? "payslip_id, amount_vnd"
    : "id, payslip_id, kind, amount_vnd, source_type, source_id, label, created_at";
  const rows: Record<string, unknown>[] = [];
  for (let tu = 0; ; tu += CO_TRANG_DOC) {
    const base = supabase
      .from("payslip_lines")
      .select(cols)
      .in("payslip_id", payslipIds)
      // Khoá phụ `id` để phân trang xác định: created_at có thể trùng ở ranh
      // giới trang, thiếu tiebreaker thì .range trùng/hụt dòng ⇒ tổng sai.
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(tu, tu + CO_TRANG_DOC - 1);
    const { data, error } = await (chiHoaHong
      ? base.eq("source_type", "commission")
      : base.neq("source_type", "commission"));
    if (error) return { rows, error };
    if (!data?.length) break;
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < CO_TRANG_DOC) break;
  }
  return { rows, error: null };
}

/**
 * Phiếu lương + dòng tiền. `periodId` null ⇒ lấy phiếu CỦA CHÍNH NGƯỜI ĐANG
 * ĐĂNG NHẬP (RLS tự lọc) — đường này dành cho nhân viên và cho quản lý xem
 * phiếu của mình, những người KHÔNG đọc được bảng `payroll_periods`.
 *
 * Dòng hoa hồng KHÔNG trả về chi tiết ở đây (việc #216): chỉ gộp thành
 * `commission` (số giao dịch + tổng tiền). Chi tiết tải riêng khi bung, qua
 * action layDongHoaHong. Tổng vẫn CỘNG TỪ DÒNG hoa hồng thật, không đọc cột tổng.
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

  const ids = data.map((p) => p.id as string);
  const [dongThuong, dongHoaHong] = await Promise.all([
    docHetDong(supabase, ids, false),
    docHetDong(supabase, ids, true),
  ]);
  // Đọc hụt = tổng lương thiếu trong im lặng — thứ cả cổng soat-tran-dem-ngam
  // lẫn khối chú thích cột tổng của file này cấm. Ném lỗi để page.tsx (đã bọc
  // try/catch → loadFailed) hiện "không tải được" thay vì phát con số sai.
  if (dongThuong.error) throw dongThuong.error;
  if (dongHoaHong.error) throw dongHoaHong.error;

  const theoPhieu = new Map<string, PayslipLine[]>();
  for (const r of dongThuong.rows) {
    const pid = r.payslip_id as string;
    const arr = theoPhieu.get(pid) ?? [];
    arr.push({
      id: r.id as string,
      kind: r.kind as LineKind,
      amountVnd: Number(r.amount_vnd ?? 0),
      sourceType: r.source_type as PayslipLine["sourceType"],
      sourceId: (r.source_id as string | null) ?? null,
      label: (r.label as string | null) ?? null,
      createdAt: r.created_at as string,
    });
    theoPhieu.set(pid, arr);
  }

  const hhTheoPhieu = new Map<string, CommissionSummary>();
  for (const r of dongHoaHong.rows) {
    const pid = r.payslip_id as string;
    const cur = hhTheoPhieu.get(pid) ?? { count: 0, totalVnd: 0 };
    cur.count += 1;
    cur.totalVnd += Number(r.amount_vnd ?? 0);
    hhTheoPhieu.set(pid, cur);
  }

  return data.map((p) => {
    const pid = p.id as string;
    return {
      id: pid,
      employeeId: p.employee_id as string,
      employeeName: tenTheoHoSo.get(p.employee_id as string) ?? null,
      grossVnd: Number(p.gross_vnd ?? 0),
      deductionVnd: Number(p.deduction_vnd ?? 0),
      netVnd: Number(p.net_vnd ?? 0),
      lines: theoPhieu.get(pid) ?? [],
      commission: hhTheoPhieu.get(pid) ?? { count: 0, totalVnd: 0 },
      createdAt: p.created_at as string,
    };
  });
}

/** Thực nhận tính TỪ DÒNG — số hiển thị không phụ thuộc cột tổng có lệch hay không. */
function tongTuDong(lines: PayslipLine[]): { gross: number; deduction: number; net: number } {
  let gross = 0;
  let deduction = 0;
  for (const l of lines) {
    if (l.amountVnd >= 0) gross += l.amountVnd;
    else deduction += -l.amountVnd;
  }
  return { gross, deduction, net: gross - deduction };
}

/**
 * Thực nhận của phiếu = dòng thường CỘNG TỪ DÒNG + tổng hoa hồng đã gộp. Vẫn là
 * "cộng từ dòng" (quyết định của thẻ): tổng hoa hồng do queries cộng từ chính
 * các dòng hoa hồng thật, không đọc cột tổng có thể lệch.
 */
export function netPhieu(lines: PayslipLine[], commission: CommissionSummary): number {
  return tongTuDong(lines).net + commission.totalVnd;
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
