import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { currentMonthVN, isMonthKey, shiftMonth } from "@/lib/kpi";
import { monthKeyToRangeVN, getGrossMarginByItem } from "@/lib/finance/gross-margin";
import PayrollView from "./payroll-view";
import {
  layKyLuong,
  layNetKyTruoc,
  layPhieuChiKy,
  layPhieuLuong,
  type Payslip,
  type PayrollPeriod,
  type PhieuChiKy,
  type PreCloseIssue,
} from "./queries";

export const dynamic = "force-dynamic";

/**
 * ⛔ CHỈ owner/admin — KHÔNG có `manager`. Đây là NGOẠI LỆ so với gần hết kho
 * (nơi manager luôn đi cùng owner/admin cho dữ liệu tài chính) và là điểm nguy
 * hiểm nhất của mảng này. Danh sách phải KHỚP `payroll_periods_rw` ở migration
 * #167 — đổi một bên mà quên bên kia là màn hình nói một đằng, CSDL một nẻo.
 */
const PAYROLL_ROLES = ["owner", "admin"];

/**
 * "Công chuẩn" một tháng để soát "thiếu công mà lương cứng đủ tháng" — nay do
 * TIỆM TỰ KHAI ở Cài đặt chấm công (#283), không còn đóng cứng trong mã.
 *
 * Con số dưới đây chỉ là chỗ lùi khi tiệm chưa từng mở màn cài đặt đó lần nào.
 * Trước #283 nó nằm thẳng trong mã cho MỌI tiệm, nên tiệm nghỉ hai ngày mỗi
 * tuần (khoảng 22 công) bị gắn cờ toàn bộ nhân viên mỗi tháng — cảnh báo kêu
 * oan đều đặn thì người ta học cách bỏ qua, và bỏ qua luôn cả lần nó đúng.
 *
 * Đây là mốc để HỎI, không phải để trừ tiền — máy hỏi chứ không tự quyết
 * (quyết định 3 của thẻ design).
 */
const CONG_CHUAN_MAC_DINH = 24;

export async function generateMetadata() {
  const t = await getTranslations("payroll");
  return { title: t("title") };
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string | string[] }>;
}) {
  const sp = await searchParams;
  const m = typeof sp.m === "string" ? sp.m : "";
  const monthKey = isMonthKey(m) ? m : currentMonthVN();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ⚠️ KHÔNG tự viết `.from("tenant_members").select("role").maybeSingle()` —
  // truy vấn đó không lọc user_id (cổng scripts/soat-doc-vai.mjs).
  const member = await getCurrentMembership(supabase, user.id);
  if (!member) redirect("/app");
  const role = member.role ?? "";
  const canPayroll = PAYROLL_ROLES.includes(role);

  // ── Vai KHÔNG được xem lương cả tiệm (quản lý, nhân viên, chỉ-xem) ──
  // KHÔNG màn trắng, KHÔNG danh sách rỗng: hiện lời từ chối nói rõ vì sao, và
  // vẫn hiện PHIẾU CỦA CHÍNH HỌ — đó là tiền của họ, RLS `payslips_select` cho
  // đọc đúng phiếu đó.
  if (!canPayroll) {
    let myPayslips: Payslip[] = [];
    let loadFailed = false;
    try {
      const { data: me } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const ten = new Map<string, string>();
      if (me) ten.set(me.id as string, me.full_name as string);
      myPayslips = await layPhieuLuong(supabase, null, ten);
    } catch {
      loadFailed = true;
    }
    return (
      <PayrollView
        role={role}
        canPayroll={false}
        monthKey={monthKey}
        period={null}
        payslips={myPayslips}
        issues={[]}
        blocking={false}
        revenueVnd={0}
        cashEntry={null}
        prevNetByEmployee={{}}
        prevMonthKey={shiftMonth(monthKey, -1)}
        loadFailed={loadFailed}
      />
    );
  }

  let loadFailed = false;
  let period: PayrollPeriod | null = null;
  let payslips: Payslip[] = [];
  const issues: PreCloseIssue[] = [];
  let blocking = false;
  let revenueVnd = 0;
  let cashEntry: PhieuChiKy | null = null;
  let prevNetByEmployee: Record<string, number> = {};
  let congChuan = CONG_CHUAN_MAC_DINH;

  try {
    const { fromIso, toIso } = monthKeyToRangeVN(monthKey);
    const truoc = shiftMonth(monthKey, -1);
    const kyTruoc = monthKeyToRangeVN(truoc);

    const [kyRes, empRes, tsRes, congChuanRow, doanhThu, doanhThuTruoc, kyTruocRow] = await Promise.all([
      layKyLuong(supabase, monthKey),
      supabase.from("employees").select("id, full_name, ended_on").limit(200),
      supabase.from("timesheets").select("employee_id, work_days, status").eq("period", monthKey).limit(200),
      // Số công chuẩn của chính tiệm này (#283). RLS đã giới hạn về đúng tiệm
      // nên không cần lọc tenant_id; chưa có dòng nào thì dùng mốc mặc định.
      supabase.from("attendance_settings").select("cong_chuan_thang").maybeSingle(),
      getGrossMarginByItem(supabase, fromIso, toIso).then((r) => r.summary.revenueVnd),
      getGrossMarginByItem(supabase, kyTruoc.fromIso, kyTruoc.toIso).then((r) => r.summary.revenueVnd),
      layKyLuong(supabase, truoc),
    ]);

    period = kyRes;
    congChuan = Number(congChuanRow.data?.cong_chuan_thang ?? CONG_CHUAN_MAC_DINH);
    revenueVnd = doanhThu;

    const ten = new Map(
      (empRes.data ?? []).map((e) => [e.id as string, e.full_name as string] as const),
    );
    payslips = period ? await layPhieuLuong(supabase, period.id, ten) : [];

    // Đối chiếu Sổ quỹ + so với kỳ trước. Hai lời gọi này chỉ đọc, chạy song
    // song, và KHÔNG được làm hỏng cả màn nếu lỗi — chúng nằm trong cùng khối
    // try/catch với phần chính nên rơi vào nhánh `loadFailed` chung.
    const [phieuChi, netTruoc] = await Promise.all([
      layPhieuChiKy(supabase, period?.cashEntryId ?? null),
      layNetKyTruoc(supabase, kyTruocRow?.id ?? null),
    ]);
    cashEntry = phieuChi;
    prevNetByEmployee = Object.fromEntries(netTruoc);

    const dangLam = (empRes.data ?? []).filter(
      (e) => !e.ended_on || (e.ended_on as string) >= monthKey,
    );
    const sheet = new Map((tsRes.data ?? []).map((s) => [s.employee_id as string, s] as const));
    const coPhieu = new Set(payslips.map((p) => p.employeeId));

    for (const e of dangLam) {
      const id = e.id as string;
      const name = e.full_name as string;
      const s = sheet.get(id);
      if (!s) {
        issues.push({ kind: "noTimesheet", name });
      } else if (s.status !== "closed") {
        // Chặn thật: trigger `payroll_close_guard()` sẽ từ chối chốt lương.
        issues.push({ kind: "timesheetNotClosed", name });
        blocking = true;
      } else if (Number(s.work_days ?? 0) < congChuan) {
        const coLuongCung = payslips
          .find((p) => p.employeeId === id)
          ?.lines.some((l) => l.kind === "base");
        if (coLuongCung) {
          issues.push({
            kind: "fullBaseButShortDays",
            name,
            days: Number(s.work_days ?? 0),
          });
        }
      }
      if (!coPhieu.has(id)) issues.push({ kind: "noPayslip", name });
    }

    const tongKy = payslips.reduce((s, p) => s + p.netVnd, 0);
    if (tongKy > 0 && revenueVnd > 0) {
      const prevPercent =
        kyTruocRow && doanhThuTruoc > 0
          ? Math.round((kyTruocRow.totalVnd / doanhThuTruoc) * 100)
          : null;
      issues.push({
        kind: "payrollRatio",
        percent: Math.round((tongKy / revenueVnd) * 100),
        prevPercent,
      });
    }
  } catch {
    loadFailed = true;
  }

  return (
    <PayrollView
      role={role}
      canPayroll
      monthKey={monthKey}
      period={period}
      payslips={payslips}
      issues={issues}
      blocking={blocking}
      revenueVnd={revenueVnd}
      cashEntry={cashEntry}
      prevNetByEmployee={prevNetByEmployee}
      prevMonthKey={shiftMonth(monthKey, -1)}
      loadFailed={loadFailed}
    />
  );
}
