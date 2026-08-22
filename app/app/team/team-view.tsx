"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { kpiMonthLabel, shiftMonth } from "@/lib/kpi";
import { cn } from "@/lib/utils";
import { LeavePanel } from "./leave-panel";
import { PeoplePanel } from "./people-panel";
import { PunchPanel } from "./punch-panel";
import { ShiftPanel } from "./shift-panel";
import { ShopPunchesPanel } from "./shop-punches-panel";
import { TimesheetPanel } from "./timesheet-panel";
import type { AttendanceConfig, Employee, LeaveRequest, Punch, Shift, Timesheet } from "./queries";

type Tab = "punch" | "timesheets" | "shifts" | "leave" | "people";

/**
 * Nhân sự & Chấm công — thẻ design man-nhan-su-cham-cong.html.
 *
 * Tab hiện theo VAI, nhưng đó chỉ là phép lịch sự giao diện: hàng rào thật nằm
 * ở RLS migration #166 (bất biến "chặn ở CSDL, không chặn ở giao diện").
 */
export default function TeamView({
  role,
  canManage,
  canHr,
  monthKey,
  weekStart,
  me,
  employees,
  employeeNames,
  timesheets,
  myPunches,
  shopPunches,
  shifts,
  leaves,
  apptByDay,
  apptByLeave,
  chamCongCfg,
  phepDaDung,
  tenantId,
  businessName,
  colleagues,
  members,
  loadFailed,
}: {
  role: string;
  canManage: boolean;
  canHr: boolean;
  monthKey: string;
  weekStart: string;
  me: Employee | null;
  employees: Employee[];
  /**
   * Tên tra theo id hồ sơ, lấy qua khe hẹp `employees_ten()` (migration #177).
   * Quản lý chỉ đọc được hồ sơ của CHÍNH họ, nên nếu chỉ dựa vào `employees`
   * thì bảng công cả tiệm hiện toàn mã ngắn — duyệt mà không biết duyệt cho ai.
   */
  employeeNames: Record<string, string>;
  timesheets: Timesheet[];
  myPunches: Punch[];
  /**
   * Lượt chấm cả tiệm trong tuần. `page.tsx` chỉ điền mảng này cho vai quản lý
   * trở lên và để rỗng với mọi vai khác — nó chứa link ảnh đã ký của từng người.
   */
  shopPunches: Punch[];
  shifts: Shift[];
  leaves: LeaveRequest[];
  apptByDay: Record<string, number>;
  apptByLeave: Record<string, number>;
  chamCongCfg: AttendanceConfig;
  /**
   * #250 — ngày phép NĂM đã dùng, theo id hồ sơ. `null` = chưa tra được (khác
   * `{}` = tra được, chưa ai nghỉ). Hai panel dưới đây phải nói ra khác biệt đó.
   */
  phepDaDung: Record<string, number> | null;
  tenantId: string;
  businessName: string;
  colleagues: { id: string; name: string }[];
  members: { userId: string; displayName: string }[];
  loadFailed: boolean;
}) {
  const t = useTranslations("hr");
  const [tab, setTab] = useState<Tab>("punch");

  // Gộp hai nguồn: hồ sơ đọc được (chủ tiệm/quản trị thấy đủ) + khe hẹp chỉ-tên
  // (quản lý). Người nào cả hai nguồn đều không có thì mới rơi về mã ngắn, và
  // màn hình nói rõ lý do bên dưới.
  const names = useMemo(() => {
    const m = new Map<string, string>(Object.entries(employeeNames));
    for (const e of employees) m.set(e.id, e.fullName);
    return m;
  }, [employees, employeeNames]);

  // Dòng bảng công = hợp của "người có hồ sơ đọc được" và "dòng công đã có".
  // Không lấy riêng một bên: quản lý đọc được bảng công nhưng KHÔNG đọc được hồ
  // sơ ⇒ lấy theo hồ sơ là mất sạch dòng, lấy theo bảng công là mất người chưa
  // có dòng nào trong kỳ.
  const rows = useMemo(() => {
    const tsByEmp = new Map(timesheets.map((x) => [x.employeeId, x] as const));
    const ids = new Set<string>([
      ...employees.filter((e) => !e.endedOn).map((e) => e.id),
      ...Object.keys(employeeNames),
      ...tsByEmp.keys(),
    ]);
    return [...ids]
      .map((id) => ({ employeeId: id, name: names.get(id) ?? null, ts: tsByEmp.get(id) ?? null }))
      .sort((a, b) => (a.name ?? "￿").localeCompare(b.name ?? "￿"));
  }, [employees, employeeNames, timesheets, names]);

  const someNamesHidden = rows.some((r) => r.name === null);

  // Quyết định 5 của thẻ: nhân viên xem CÔNG VÀ LỊCH của chính mình ⇒ tab Xếp ca
  // hiện cho MỌI vai, chỉ khác quyền sửa. RLS `shifts_select` đã lọc xuống đúng
  // ca của họ, nên với nhân viên đây là bảng một dòng — lịch tuần của chính họ.
  const tabs: Tab[] = canHr
    ? ["punch", "timesheets", "shifts", "leave", "people"]
    : ["punch", "timesheets", "shifts", "leave"];

  if (loadFailed) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {t("loadFailed")}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Từ lg mới nới: bảng chấm công và lịch ca xếp cột theo từng ngày, tự nó
            đã cần tối thiểu 620px; khoá khung 768px thì bảng chạm sát mép, thêm
            một cột là phải cuộn ngang. Dưới lg giữ nguyên. */}
        <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6 lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>

          <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-1">
            {tabs.map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  "shrink-0 rounded px-3 py-1 text-sm font-medium transition-colors",
                  tab === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`tabs.${k}`)}
              </button>
            ))}
          </div>

          {tab === "punch" && (
            <>
              <PunchPanel me={me} punches={myPunches} chamCongCfg={chamCongCfg} tenantId={tenantId} businessName={businessName} colleagues={colleagues} canHr={canHr} />
              {/* Bảng cả tiệm chỉ dựng cho quản lý trở lên (thẻ cham-cong-co-anh,
                  mục 5). Chốt chặn thật nằm ở RLS + ở `page.tsx` — chỗ này chỉ
                  là phép lịch sự giao diện, giống các tab bên trên. */}
              {canManage && (
                <ShopPunchesPanel
                  punches={shopPunches}
                  names={names}
                  faceMatchMin={chamCongCfg.faceMatchMin}
                  requireSelfie={chamCongCfg.requireSelfie}
                />
              )}
            </>
          )}

          {tab === "timesheets" && (
            <div className="space-y-3">
              <MonthNav monthKey={monthKey} weekStart={weekStart} />
              {!canManage && (
                <p className="text-[13px] text-muted-foreground">{t("timesheets.selfOnly")}</p>
              )}
              <TimesheetPanel
                monthKey={monthKey}
                rows={rows}
                canManage={canManage}
                someNamesHidden={someNamesHidden && canManage}
                totalRows={rows.length}
              />
            </div>
          )}

          {tab === "shifts" && (
            <ShiftPanel
              weekStart={weekStart}
              employees={employees}
              shifts={shifts}
              apptByDay={apptByDay}
              canManage={canManage}
              canHr={canHr}
              cfg={chamCongCfg}
            />
          )}

          {tab === "leave" && (
            <LeavePanel
              me={me}
              leaves={leaves}
              names={names}
              apptByLeave={apptByLeave}
              canManage={canManage}
              phepDaDung={phepDaDung}
              employees={employees}
            />
          )}

          {tab === "people" && canHr && (
            <PeoplePanel employees={employees} members={members} phepDaDung={phepDaDung} />
          )}

          {/* Ai xem được gì — nói thẳng trên màn, không để người dùng đoán vì sao thiếu tab. */}
          <p className="text-xs text-muted-foreground">{t(`whoSees.${roleKey(role)}`)}</p>
        </div>
      </div>
    </div>
  );
}

function roleKey(role: string): string {
  return role === "owner" || role === "admin" ? "admin" : role === "manager" ? "manager" : "staff";
}

function MonthNav({ monthKey, weekStart }: { monthKey: string; weekStart: string }) {
  const t = useTranslations("hr");
  return (
    <div className="flex items-center justify-center gap-3">
      <Link
        href={`/app/team?m=${shiftMonth(monthKey, -1)}&w=${weekStart}`}
        className="flex size-8 items-center justify-center rounded-md border hover:bg-muted/60"
        aria-label={t("prevMonth")}
      >
        <ChevronLeft className="size-4" />
      </Link>
      <span className="text-sm font-medium tabular-nums">{kpiMonthLabel(monthKey)}</span>
      <Link
        href={`/app/team?m=${shiftMonth(monthKey, 1)}&w=${weekStart}`}
        className="flex size-8 items-center justify-center rounded-md border hover:bg-muted/60"
        aria-label={t("nextMonth")}
      >
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}
