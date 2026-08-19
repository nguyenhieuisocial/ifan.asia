"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { xepCa } from "./actions";
import { SHIFT_KINDS, type Employee, type Shift, type ShiftKind } from "./queries";
import { toastKeyFor } from "./toast-keys";

/** Bấm một ô là quay vòng: trống → sáng → chiều → cả ngày → nghỉ → trống. */
const VONG: (ShiftKind | null)[] = [null, ...SHIFT_KINDS];

function themNgay(ngay: string, n: number): string {
  return new Date(new Date(`${ngay}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const MAU: Record<ShiftKind, string> = {
  morning: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  afternoon: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  full: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  off: "bg-muted text-muted-foreground",
};

/**
 * Xếp ca (quyết định 3 của thẻ): đối chiếu ca với LỊCH HẸN ĐÃ ĐẶT để báo thiếu
 * người TRƯỚC, không đợi đến hôm đó mới vỡ.
 *
 * Ngưỡng cảnh báo: mỗi người trực gánh tối đa 6 lịch/ngày. Thẻ không nói con số
 * — chọn 6 vì một ca 8 tiếng với dịch vụ ~60-75 phút là quanh mức đó. Đây là
 * lựa chọn của bản cài đặt, không phải luật; đổi thì đổi ở đúng hằng số này.
 */
const LICH_MOI_NGUOI = 6;

export function ShiftPanel({
  weekStart,
  employees,
  shifts,
  apptByDay,
  canManage,
}: {
  weekStart: string;
  employees: Employee[];
  shifts: Shift[];
  apptByDay: Record<string, number>;
  canManage: boolean;
}) {
  const t = useTranslations("hr");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const days = Array.from({ length: 7 }, (_, i) => themNgay(weekStart, i));
  const byKey = new Map(shifts.map((s) => [`${s.employeeId}|${s.workDate}`, s]));
  const active = employees.filter((e) => !e.endedOn);

  function doi(employeeId: string, workDate: string) {
    if (!canManage) return;
    const hienTai = byKey.get(`${employeeId}|${workDate}`)?.kind ?? null;
    const ke = VONG[(VONG.indexOf(hienTai) + 1) % VONG.length];
    startTransition(async () => {
      const res = await xepCa({ employeeId, workDate, kind: ke });
      if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-3">
        <Link
          href={`/app/team?w=${themNgay(weekStart, -7)}`}
          className="flex size-8 items-center justify-center rounded-md border hover:bg-muted/60"
          aria-label={t("shifts.prevWeek")}
        >
          <ChevronLeft className="size-4" />
        </Link>
        <span className="text-sm font-medium tabular-nums">
          {weekStart} → {themNgay(weekStart, 6)}
        </span>
        <Link
          href={`/app/team?w=${themNgay(weekStart, 7)}`}
          className="flex size-8 items-center justify-center rounded-md border hover:bg-muted/60"
          aria-label={t("shifts.nextWeek")}
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-[13px] text-muted-foreground">
          {t("shifts.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">{t("shifts.person")}</th>
                {days.map((d) => (
                  <th key={d} className="p-2 text-center font-medium">
                    {t(`shifts.dow.${new Date(`${d}T00:00:00Z`).getUTCDay()}`)}
                    <span className="block font-normal">{d.slice(8)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {active.map((e) => (
                <tr key={e.id}>
                  <td className="p-2 font-medium">{e.fullName}</td>
                  {days.map((d) => {
                    const s = byKey.get(`${e.id}|${d}`);
                    return (
                      <td key={d} className="p-1 text-center">
                        <button
                          type="button"
                          disabled={!canManage || pending}
                          onClick={() => doi(e.id, d)}
                          className={cn(
                            "h-8 w-full min-w-10 rounded text-xs font-medium",
                            s ? MAU[s.kind] : "bg-muted/40 text-muted-foreground",
                            canManage && "hover:opacity-80",
                          )}
                          aria-label={`${e.fullName} ${d}`}
                        >
                          {s ? t(`shifts.kinds.${s.kind}`) : "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && <p className="text-xs text-muted-foreground">{t("shifts.tapHint")}</p>}

      {/* Cảnh báo thiếu người — dựa trên lịch hẹn THẬT của đúng ngày đó. */}
      <div className="space-y-1.5">
        {days.map((d) => {
          const lich = apptByDay[d] ?? 0;
          const nguoi = active.filter((e) => {
            const k = byKey.get(`${e.id}|${d}`)?.kind;
            return k === "morning" || k === "afternoon" || k === "full";
          }).length;
          if (lich === 0 || lich <= nguoi * LICH_MOI_NGUOI) return null;
          return (
            <p
              key={d}
              className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2.5 text-[13px] text-amber-700 dark:text-amber-400"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {t("shifts.understaffed", { date: d, appts: lich, people: nguoi })}
            </p>
          );
        })}
      </div>
    </div>
  );
}
