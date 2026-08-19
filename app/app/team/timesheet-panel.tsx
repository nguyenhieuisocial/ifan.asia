"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarSync, Info, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { chotBangCong, luuBangCong, moKhoaBangCong, tinhLaiBangCong } from "./actions";
import { EMPLOYEE_LIST_LIMIT, type Timesheet } from "./queries";
import { toastKeyFor } from "./toast-keys";

type Row = { employeeId: string; name: string | null; ts: Timesheet | null };

const soDuong = (v: string, max: number) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};

/**
 * Bảng công (quyết định 2 của thẻ): quản lý duyệt và CHỐT mới tính lương được;
 * chốt rồi thì khoá, sửa phải mở khoá kèm lý do — cùng luật với chốt sổ quỹ.
 */
export function TimesheetPanel({
  monthKey,
  rows,
  canManage,
  someNamesHidden,
  totalRows,
}: {
  monthKey: string;
  rows: Row[];
  canManage: boolean;
  someNamesHidden: boolean;
  totalRows: number;
}) {
  const t = useTranslations("hr");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [unlockFor, setUnlockFor] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState("");
  const [pending, startTransition] = useTransition();

  function ten(r: Row) {
    return r.name ?? t("timesheets.hiddenName", { id: r.employeeId.slice(0, 8) });
  }

  return (
    <div className="space-y-3">
      {/* Quản lý đọc được bảng công cả tiệm (đúng việc của họ) nhưng hồ sơ nhân
          sự — nơi chứa tên — chỉ chủ tiệm/quản trị đọc được. Nói thẳng ra, KHÔNG
          để ô trống cho người dùng tự đoán. */}
      {someNamesHidden && (
        <p className="flex items-start gap-2 rounded-md bg-muted/60 p-2.5 text-[13px] text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          {t("timesheets.nameHidden")}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-[13px] text-muted-foreground">
          {t("timesheets.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2.5 font-medium">{t("timesheets.person")}</th>
                <th className="p-2.5 text-right font-medium">{t("timesheets.workDays")}</th>
                <th className="p-2.5 text-right font-medium">{t("timesheets.overtime")}</th>
                <th className="p-2.5 text-right font-medium">{t("timesheets.late")}</th>
                <th className="p-2.5 text-right font-medium">{t("timesheets.flags")}</th>
                <th className="p-2.5 font-medium">{t("timesheets.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const closed = r.ts?.status === "closed";
                return (
                  <tr
                    key={r.employeeId}
                    className={cn("align-middle", canManage && "cursor-pointer hover:bg-muted/40")}
                    onClick={canManage ? () => setOpenId(openId === r.employeeId ? null : r.employeeId) : undefined}
                  >
                    <td className="p-2.5 font-medium">{ten(r)}</td>
                    <td className="p-2.5 text-right tabular-nums">{r.ts?.workDays ?? "—"}</td>
                    <td className="p-2.5 text-right tabular-nums">
                      {r.ts ? t("timesheets.hours", { n: r.ts.overtimeHours }) : "—"}
                    </td>
                    <td className="p-2.5 text-right tabular-nums">{r.ts?.lateCount ?? "—"}</td>
                    <td className="p-2.5 text-right tabular-nums">
                      {r.ts && r.ts.flagCount > 0 ? (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                          {r.ts.flagCount}
                        </span>
                      ) : (
                        (r.ts?.flagCount ?? "—")
                      )}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs",
                          closed
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {closed ? <Lock className="size-3" /> : null}
                        {t(`timesheets.statuses.${r.ts?.status ?? "none"}`)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalRows >= EMPLOYEE_LIST_LIMIT && (
        <p className="text-xs text-muted-foreground">
          {t("timesheets.limitNote", { n: EMPLOYEE_LIST_LIMIT })}
        </p>
      )}

      {canManage &&
        rows
          .filter((r) => r.employeeId === openId)
          .map((r) => (
            <TimesheetEditor
              key={r.employeeId}
              row={r}
              name={ten(r)}
              monthKey={monthKey}
              pending={pending}
              onClose={() => setOpenId(null)}
              onSave={(payload) =>
                startTransition(async () => {
                  const res = await luuBangCong(payload);
                  if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
                  else {
                    toast.success(t("toasts.saved"));
                    router.refresh();
                  }
                })
              }
              onRecalc={() =>
                startTransition(async () => {
                  const res = await tinhLaiBangCong({ employeeId: r.employeeId, period: monthKey });
                  if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
                  else {
                    toast.success(
                      t("timesheets.recalcDone", {
                        days: res.workDays ?? 0,
                        flags: res.flagCount ?? 0,
                      }),
                    );
                    router.refresh();
                  }
                })
              }
              onCloseSheet={() => {
                if (!r.ts) return;
                startTransition(async () => {
                  const res = await chotBangCong({ timesheetId: r.ts!.id });
                  if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
                  else {
                    toast.success(t("timesheets.closed"));
                    router.refresh();
                  }
                });
              }}
              onUnlock={() => {
                setUnlockFor(r.ts?.id ?? null);
                setUnlockReason("");
              }}
              closedAtLabel={r.ts?.closedAt ? formatDate(r.ts.closedAt, locale) : null}
            />
          ))}

      {unlockFor && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold">{t("timesheets.unlockTitle")}</p>
          <p className="text-[13px] text-muted-foreground">{t("timesheets.unlockHint")}</p>
          <Label htmlFor="unlock-reason">{t("timesheets.unlockReason")}</Label>
          <Input
            id="unlock-reason"
            value={unlockReason}
            onChange={(e) => setUnlockReason(e.target.value)}
            maxLength={300}
            placeholder={t("timesheets.unlockPlaceholder")}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setUnlockFor(null)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button
              disabled={pending || unlockReason.trim().length === 0}
              onClick={() =>
                startTransition(async () => {
                  const res = await moKhoaBangCong({
                    timesheetId: unlockFor,
                    reason: unlockReason.trim(),
                  });
                  if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
                  else {
                    toast.success(t("timesheets.unlocked"));
                    setUnlockFor(null);
                    router.refresh();
                  }
                })
              }
            >
              <LockOpen className="mr-1 size-4" />
              {pending ? t("saving") : t("timesheets.unlockSubmit")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TimesheetEditor({
  row,
  name,
  monthKey,
  pending,
  onClose,
  onSave,
  onRecalc,
  onCloseSheet,
  onUnlock,
  closedAtLabel,
}: {
  row: Row;
  name: string;
  monthKey: string;
  pending: boolean;
  onClose: () => void;
  onSave: (p: {
    employeeId: string;
    period: string;
    workDays: number;
    overtimeHours: number;
    lateCount: number;
    flagCount: number;
  }) => void;
  onRecalc: () => void;
  onCloseSheet: () => void;
  onUnlock: () => void;
  closedAtLabel: string | null;
}) {
  const t = useTranslations("hr");
  const [workDays, setWorkDays] = useState(String(row.ts?.workDays ?? 0));
  const [overtime, setOvertime] = useState(String(row.ts?.overtimeHours ?? 0));
  const [late, setLate] = useState(String(row.ts?.lateCount ?? 0));
  const closed = row.ts?.status === "closed";

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{t("timesheets.editTitle", { name })}</h4>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={onClose}>
          {t("close")}
        </button>
      </div>

      {closed ? (
        <>
          <p className="text-[13px] text-muted-foreground">
            {t("timesheets.lockedNote", { date: closedAtLabel ?? "—" })}
          </p>
          {row.ts?.unlockReason && (
            <p className="text-[13px] text-muted-foreground">
              {t("timesheets.lastUnlockReason", { reason: row.ts.unlockReason })}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={onUnlock} disabled={pending}>
            <LockOpen className="mr-1 size-3.5" />
            {t("timesheets.unlock")}
          </Button>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("timesheets.workDays")}</Label>
              <Input value={workDays} onChange={(e) => setWorkDays(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("timesheets.overtimeHours")}</Label>
              <Input value={overtime} onChange={(e) => setOvertime(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("timesheets.late")}</Label>
              <Input value={late} onChange={(e) => setLate(e.target.value)} inputMode="numeric" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("timesheets.manualHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onRecalc} disabled={pending}>
              <CalendarSync className="mr-1 size-3.5" />
              {t("timesheets.recalc")}
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                onSave({
                  employeeId: row.employeeId,
                  period: monthKey,
                  workDays: soDuong(workDays, 31),
                  overtimeHours: soDuong(overtime, 400),
                  lateCount: Math.round(soDuong(late, 100)),
                  flagCount: row.ts?.flagCount ?? 0,
                })
              }
            >
              {pending ? t("saving") : t("save")}
            </Button>
            {row.ts && (
              <Button size="sm" variant="secondary" onClick={onCloseSheet} disabled={pending}>
                <Lock className="mr-1 size-3.5" />
                {t("timesheets.close")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("timesheets.closeHint")}</p>
        </>
      )}
    </div>
  );
}
