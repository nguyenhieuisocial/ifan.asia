import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hoa hồng nhân viên (V7, migration #167 dựng bảng + #180 mở đường ghi).
 * Thẻ: design-system/man-hoa-hong.html.
 *
 * BA LUẬT của phần đọc này:
 *
 *  1. SỐ HIỆN RA LÀ SỐ CỘNG TỪ SỔ, không phải tính lại từ tỉ lệ hôm nay.
 *     `commission_entries` chụp sẵn `base_vnd`/`percent`/`job_type` lúc sinh
 *     khoản (#180). Tính lại từ `commission_rates` sẽ cho ra số khác với số đã
 *     trả nếu chủ tiệm sửa tỉ lệ giữa tháng — và đó là loại lệch không ai phát
 *     hiện ra cho tới lúc nhân viên cãi nhau về con số.
 *
 *  2. NHÂN VIÊN CHỈ THẤY PHẦN CỦA MÌNH — và đó là RLS `commission_select` lo
 *     (#167), không phải tầng này lọc. Ở đây không có câu `.eq("employee_id", …)`
 *     nào cho nhân viên: lọc ở tầng web là phép lịch sự, chặn thật ở tầng dữ
 *     liệu (bất biến 1 của thẻ).
 *
 *  3. ĐỌC HỎNG PHẢI NÉM. Danh sách rỗng nghĩa là "tháng này chưa có khoản nào";
 *     để lỗi mạng đội lốt câu đó là đẩy chủ tiệm đi tìm lỗi ở chỗ không có lỗi.
 */

export const JOB_TYPES = ["service", "product", "package"] as const;
export type JobType = (typeof JOB_TYPES)[number];

/** Trần số khoản đọc về một tháng. Vượt trần thì màn hình phải NÓI RA. */
export const ENTRY_LIMIT = 2000;
/** Trần số đơn soát cho cảnh báo "đơn đã chốt mà không sinh khoản nào". */
export const ORDER_SCAN_LIMIT = 1000;

export type CommissionRate = {
  jobType: JobType;
  percent: number;
};

export type CommissionEntry = {
  id: string;
  employeeId: string;
  earnedOn: string;
  amountVnd: number;
  jobType: JobType | null;
  baseVnd: number | null;
  percent: number | null;
  orderId: string | null;
  contractId: string | null;
  note: string | null;
};

/** Một dòng của khối "Cách tính" trên thẻ: `Dịch vụ tự làm · 8% → 2.592.000`. */
export type JobBreakdown = {
  jobType: JobType | null;
  /** null = khoản ghi tay (không có tỉ lệ nào), hoặc tỉ lệ đã lẫn nhiều mức trong tháng. */
  percent: number | null;
  baseVnd: number;
  amountVnd: number;
  count: number;
};

export type EmployeeTotal = {
  employeeId: string;
  name: string | null;
  baseVnd: number;
  amountVnd: number;
  byJob: JobBreakdown[];
};

/** Quyết định 5 của thẻ: máy CẢNH BÁO trước khi chốt, không chặn cứng. */
export type CommissionWarnings = {
  /** Đơn còn draft/confirmed trong tháng — hoa hồng đang tính trên tiền chưa chắc thu được. */
  pendingOrders: number;
  /** Đơn ĐÃ chốt mà không sinh khoản nào — gần như luôn là "chưa ghi ai làm". */
  ordersWithoutCommission: number;
  /** true = số đơn soát chạm trần ORDER_SCAN_LIMIT, con số trên là CẬN DƯỚI. */
  scanTruncated: boolean;
};

export type CommissionData = {
  rates: CommissionRate[];
  entries: CommissionEntry[];
  totals: EmployeeTotal[];
  warnings: CommissionWarnings;
  /** true = số khoản chạm trần ENTRY_LIMIT ⇒ bảng đang thiếu, phải nói ra. */
  truncated: boolean;
  /**
   * true = tỉ lệ đang dùng là số MÁY GIEO SẴN, chưa ai trong tiệm bấm chọn.
   * Phải nói ra: đơn tiếp theo chốt sẽ phát sinh tiền theo con số đó.
   */
  chuaAiChonTiLe: boolean;
};

/** [từ, đến] dạng `date` của tháng 'yyyy-MM-01' — cùng quy ước với `earned_on`. */
export function khoangThangVN(monthKey: string): { fromDate: string; toDate: string } {
  const [y, m] = monthKey.split("-").map(Number);
  return {
    fromDate: monthKey,
    toDate: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  };
}

export async function layDuLieuHoaHong(
  supabase: SupabaseClient,
  monthKey: string,
  opts: { canSeeTeam: boolean },
): Promise<CommissionData> {
  const ky = khoangThangVN(monthKey);

  const [rateRes, entryRes] = await Promise.all([
    supabase.from("commission_rates").select("job_type, percent, updated_by"),
    supabase
      .from("commission_entries")
      .select("id, employee_id, earned_on, amount_vnd, job_type, base_vnd, percent, order_id, contract_id, note")
      .gte("earned_on", ky.fromDate)
      .lte("earned_on", ky.toDate)
      .order("earned_on", { ascending: false })
      .limit(ENTRY_LIMIT),
  ]);
  if (rateRes.error) throw new Error(`Không đọc được bảng tỉ lệ: ${rateRes.error.message}`);
  if (entryRes.error) throw new Error(`Không đọc được khoản hoa hồng: ${entryRes.error.message}`);

  const rates: CommissionRate[] = (rateRes.data ?? [])
    .map((r) => ({ jobType: r.job_type as JobType, percent: Number(r.percent) }))
    .sort((a, b) => JOB_TYPES.indexOf(a.jobType) - JOB_TYPES.indexOf(b.jobType));

  /**
   * ⚠️ TỈ LỆ MẶC ĐỊNH DO MÁY GIEO, CHƯA AI CHỌN.
   *
   * Migration #180 gieo 8%/5%/3% cho MỌI tiệm — kể cả tiệm đang chạy thật. Lý
   * do gieo thì đúng (để trống thì tính năng ra 0 khoản = như chưa làm gì),
   * nhưng hệ quả thì phải nói ra: đơn tiếp theo chủ tiệm chốt sẽ tự phát sinh
   * tiền theo con số KHÔNG AI CHỌN, rồi số đó chảy vào phiếu lương.
   *
   * Phân biệt được mà không cần thêm cột: hàng máy gieo để trống `updated_by`,
   * hàng người bấm Lưu thì có (`actions.ts`). Màn hình nói ra cho tới khi chủ
   * tiệm xác nhận — im lặng dùng số bịa là đúng thứ luật kho cấm.
   */
  const chuaAiChonTiLe = (rateRes.data ?? []).some((r) => r.updated_by === null);

  const entries: CommissionEntry[] = (entryRes.data ?? []).map((e) => ({
    id: e.id as string,
    employeeId: e.employee_id as string,
    earnedOn: e.earned_on as string,
    amountVnd: Number(e.amount_vnd ?? 0),
    jobType: (e.job_type as JobType | null) ?? null,
    baseVnd: e.base_vnd === null || e.base_vnd === undefined ? null : Number(e.base_vnd),
    percent: e.percent === null || e.percent === undefined ? null : Number(e.percent),
    orderId: (e.order_id as string | null) ?? null,
    contractId: (e.contract_id as string | null) ?? null,
    note: (e.note as string | null) ?? null,
  }));

  // ── Tên người: qua `employees_ten()` cho quản lý trở lên (#177 mở khe hẹp
  //    chỉ id + tên), qua chính hồ sơ của mình cho nhân viên. KHÔNG đọc thẳng
  //    `employees` với vai quản lý — bảng đó có lương cứng và ngày sinh.
  const ten = new Map<string, string>();
  if (opts.canSeeTeam) {
    const { data } = await supabase.rpc("employees_ten");
    for (const e of (data ?? []) as { id: string; full_name: string }[]) {
      ten.set(e.id, e.full_name);
    }
  } else {
    const { data } = await supabase.from("employees").select("id, full_name").limit(5);
    for (const e of data ?? []) ten.set(e.id as string, e.full_name as string);
  }

  const totals = congTheoNguoi(entries, ten);
  const warnings = await soatCanhBao(supabase, monthKey, entries, opts.canSeeTeam);

  return { rates,
    chuaAiChonTiLe, entries, totals, warnings, truncated: entries.length >= ENTRY_LIMIT };
}

/**
 * Cộng theo người rồi theo LOẠI VIỆC — đúng khối "Cách tính" của thẻ.
 *
 * `percent` của một nhóm chỉ hiện khi CẢ nhóm cùng một mức. Tháng nào chủ tiệm
 * sửa tỉ lệ giữa chừng thì nhóm mang hai mức, và ghi đại một mức lên đó là nói
 * sai — để trống, số tiền vẫn đúng vì nó cộng từ sổ (luật 1).
 */
export function congTheoNguoi(
  entries: CommissionEntry[],
  ten: Map<string, string>,
): EmployeeTotal[] {
  const theoNguoi = new Map<string, Map<string, JobBreakdown & { nhieuMuc: boolean }>>();
  for (const e of entries) {
    const nhom = theoNguoi.get(e.employeeId) ?? new Map();
    const khoa = e.jobType ?? "manual";
    const cur = nhom.get(khoa) ?? {
      jobType: e.jobType,
      percent: e.percent,
      baseVnd: 0,
      amountVnd: 0,
      count: 0,
      nhieuMuc: false,
    };
    if (cur.count > 0 && cur.percent !== e.percent) cur.nhieuMuc = true;
    cur.baseVnd += e.baseVnd ?? 0;
    cur.amountVnd += e.amountVnd;
    cur.count += 1;
    nhom.set(khoa, cur);
    theoNguoi.set(e.employeeId, nhom);
  }

  const out: EmployeeTotal[] = [];
  for (const [employeeId, nhom] of theoNguoi) {
    const byJob: JobBreakdown[] = [...nhom.values()]
      .map((v) => ({
        jobType: v.jobType,
        percent: v.nhieuMuc ? null : v.percent,
        baseVnd: v.baseVnd,
        amountVnd: v.amountVnd,
        count: v.count,
      }))
      .sort((a, b) => {
        const ia = a.jobType ? JOB_TYPES.indexOf(a.jobType) : JOB_TYPES.length;
        const ib = b.jobType ? JOB_TYPES.indexOf(b.jobType) : JOB_TYPES.length;
        return ia - ib;
      });
    out.push({
      employeeId,
      name: ten.get(employeeId) ?? null,
      baseVnd: byJob.reduce((s, j) => s + j.baseVnd, 0),
      amountVnd: byJob.reduce((s, j) => s + j.amountVnd, 0),
      byJob,
    });
  }
  return out.sort((a, b) => b.amountVnd - a.amountVnd);
}

/**
 * Quyết định 5 của thẻ, phần CÓ ÍCH: soát rồi HỎI, không chặn.
 *
 * Chỉ chạy cho quản lý trở lên — nhân viên không đọc được `orders` cả tiệm nên
 * con số soát ra sẽ đúng một nửa, và một nửa thì tệ hơn là không có.
 */
async function soatCanhBao(
  supabase: SupabaseClient,
  monthKey: string,
  entries: CommissionEntry[],
  canSeeTeam: boolean,
): Promise<CommissionWarnings> {
  const trong: CommissionWarnings = {
    pendingOrders: 0,
    ordersWithoutCommission: 0,
    scanTruncated: false,
  };
  if (!canSeeTeam) return trong;

  const [y, m] = monthKey.split("-").map(Number);
  const fromIso = new Date(Date.UTC(y, m - 1, 1) - 7 * 3600 * 1000).toISOString();
  const toIso = new Date(Date.UTC(y, m, 1) - 7 * 3600 * 1000).toISOString();

  const [treoRes, chotRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("status", ["draft", "confirmed"])
      .gte("created_at", fromIso)
      .lt("created_at", toIso),
    supabase
      .from("orders")
      .select("id")
      .is("deleted_at", null)
      .eq("status", "completed")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .limit(ORDER_SCAN_LIMIT),
  ]);
  if (treoRes.error) throw new Error(`Không đếm được đơn treo: ${treoRes.error.message}`);
  if (chotRes.error) throw new Error(`Không đọc được đơn đã chốt: ${chotRes.error.message}`);

  const coKhoan = new Set(entries.map((e) => e.orderId).filter(Boolean) as string[]);
  const daChot = chotRes.data ?? [];
  return {
    pendingOrders: treoRes.count ?? 0,
    ordersWithoutCommission: daChot.filter((o) => !coKhoan.has(o.id as string)).length,
    scanTruncated: daChot.length >= ORDER_SCAN_LIMIT,
  };
}
