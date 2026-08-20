import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { currentMonthVN, isMonthKey } from "@/lib/kpi";
import TeamView from "./team-view";
import {
  layBangCong,
  layCa,
  layDanhSachNhanSu,
  layTenNhanSu,
  layDonNghi,
  layHoSoCuaToi,
  layLanCham,
  layCauHinhChamCong,
  demLichHenTheoNgay,
  demLichHenChoDonNghi,
  type AttendanceConfig,
  type Employee,
  type LeaveRequest,
  type Punch,
  type Shift,
  type Timesheet,
} from "./queries";

export const dynamic = "force-dynamic";

/** Duyệt / chốt bảng công, xếp ca, quyết đơn nghỉ — khớp RLS `timesheets_manage` #166. */
const MANAGE_ROLES = ["owner", "admin", "manager"];
/** Hồ sơ nhân sự chứa lương cứng + ngày sinh — khớp RLS `employees_manage` #166. */
const HR_ROLES = ["owner", "admin"];

export async function generateMetadata() {
  const t = await getTranslations("hr");
  return { title: t("title") };
}

/** Thứ Hai của tuần chứa `d` (giờ VN), trả 'yyyy-MM-dd'. */
function thuHaiCuaTuan(d: Date): string {
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  const thu = vn.getUTCDay(); // 0 = CN
  const lui = thu === 0 ? 6 : thu - 1;
  return new Date(vn.getTime() - lui * 86_400_000).toISOString().slice(0, 10);
}

function themNgay(ngay: string, n: number): string {
  return new Date(new Date(`${ngay}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Nhân sự & Chấm công (V7, thẻ man-nhan-su-cham-cong.html).
 *
 * KHÔNG chặn cả màn theo vai: mọi người đều có việc thật ở đây (tự chấm công,
 * xin nghỉ, xem công của mình — RLS #166 lọc sẵn xuống đúng phần của họ). Vai
 * chỉ quyết định TAB nào hiện: duyệt bảng công / xếp ca / quyết đơn nghỉ là
 * manager trở lên, hồ sơ nhân sự là owner/admin.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string | string[]; w?: string | string[] }>;
}) {
  const sp = await searchParams;
  const m = typeof sp.m === "string" ? sp.m : "";
  const monthKey = isMonthKey(m) ? m : currentMonthVN();
  const w = typeof sp.w === "string" ? sp.w : "";
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(w) ? w : thuHaiCuaTuan(new Date());
  const weekEnd = themNgay(weekStart, 6);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ⚠️ KHÔNG tự viết `.from("tenant_members").select("role").maybeSingle()` —
  // truy vấn đó không lọc user_id, mà RLS cho một thành viên thấy TẤT CẢ thành
  // viên cùng tiệm ⇒ tiệm từ 2 người trở lên thì maybeSingle() trả LỖI và màn
  // này chặn nhầm cả chủ tiệm (cổng scripts/soat-doc-vai.mjs).
  const member = await getCurrentMembership(supabase, user.id);
  if (!member) redirect("/app");
  const role = member.role ?? "";
  const canManage = MANAGE_ROLES.includes(role);
  const canHr = HR_ROLES.includes(role);

  const weekFromIso = new Date(`${weekStart}T00:00:00+07:00`).toISOString();
  const weekToIso = new Date(new Date(`${weekEnd}T00:00:00+07:00`).getTime() + 86_400_000).toISOString();

  let loadFailed = false;
  let me: Employee | null = null;
  let employees: Employee[] = [];
  let timesheets: Timesheet[] = [];
  let myPunches: Punch[] = [];
  let shifts: Shift[] = [];
  let leaves: LeaveRequest[] = [];
  let apptByDay: Record<string, number> = {};
  let apptByLeave: Record<string, number> = {};
  let chamCongCfg: AttendanceConfig = { lat: null, lng: null, radiusM: 300, requireSelfie: false };
  let members: { userId: string; displayName: string }[] = [];
  /**
   * Tên người, tra theo id hồ sơ nhân sự. Quản lý KHÔNG đọc được hồ sơ đầy đủ
   * (có lương cứng) nên `employees` của họ chỉ có đúng hồ sơ của chính họ —
   * bảng công cả tiệm sẽ toàn mã ngắn. Khe hẹp `employees_ten()` (migration
   * #177) lấp đúng chỗ này mà không lộ thêm gì.
   */
  let employeeNames: Record<string, string> = {};

  try {
    const [meRes, empRes, tsRes, punchRes, shiftRes, leaveRes, apptRes, locRes, tenRes] =
      await Promise.all([
      layHoSoCuaToi(supabase, user.id),
      layDanhSachNhanSu(supabase),
      layBangCong(supabase, monthKey),
      layLanCham(supabase, weekFromIso, weekToIso),
      layCa(supabase, weekStart, weekEnd),
      layDonNghi(supabase),
      canManage ? demLichHenTheoNgay(supabase, weekFromIso, weekToIso) : Promise.resolve({}),
      layCauHinhChamCong(supabase),
      canManage ? layTenNhanSu(supabase) : Promise.resolve({}),
    ]);
    me = meRes;
    employees = empRes;
    timesheets = tsRes;
    // Danh sách "tuần này" của thẻ là lần chấm CỦA CHÍNH MÌNH.
    myPunches = meRes ? punchRes.filter((p) => p.employeeId === meRes.id) : [];
    shifts = shiftRes;
    leaves = leaveRes;
    apptByDay = apptRes;
    chamCongCfg = locRes;
    employeeNames = tenRes;

    if (canManage) {
      // Hậu quả lên lịch hẹn khi duyệt nghỉ (quyết định 4 của thẻ). Chỉ đối
      // chiếu được với người mà người đang xem đọc được `user_id` — xem ghi chú
      // QUYỀN ĐỌC TÊN ở đầu queries.ts.
      const uidTheoHoSo = new Map(
        empRes.filter((e) => e.userId).map((e) => [e.id, e.userId as string] as const),
      );
      apptByLeave = await demLichHenChoDonNghi(
        supabase,
        leaveRes.filter((l) => l.status === "pending"),
        uidTheoHoSo,
      );
    }

    if (canHr) {
      // Ô chọn "nối hồ sơ với tài khoản": tên lấy từ `profiles` (đồng nghiệp
      // cùng tiệm đọc được nhau — migration #9), không từ auth.users.
      const [{ data: tm }, { data: pf }] = await Promise.all([
        supabase.from("tenant_members").select("user_id, role").eq("status", "active"),
        supabase.from("profiles").select("user_id, display_name"),
      ]);
      const ten = new Map((pf ?? []).map((p) => [p.user_id as string, p.display_name as string]));
      members = (tm ?? []).map((r) => ({
        userId: r.user_id as string,
        displayName: ten.get(r.user_id as string) ?? "—",
      }));
    }
  } catch {
    loadFailed = true;
  }

  return (
    <TeamView
      role={role}
      canManage={canManage}
      canHr={canHr}
      monthKey={monthKey}
      weekStart={weekStart}
      me={me}
      employees={employees}
      employeeNames={employeeNames}
      timesheets={timesheets}
      myPunches={myPunches}
      shifts={shifts}
      leaves={leaves}
      apptByDay={apptByDay}
      apptByLeave={apptByLeave}
      chamCongCfg={chamCongCfg}
      members={members}
      loadFailed={loadFailed}
    />
  );
}
