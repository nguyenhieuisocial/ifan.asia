"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarDays, Check, Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { quyetDonNghi, xinNghi } from "./actions";
import { LEAVE_LIST_LIMIT, LEAVE_KINDS, type Employee, type LeaveRequest } from "./queries";
import { toastKeyFor } from "./toast-keys";

const homNay = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * Nghỉ phép (quyết định 4 của thẻ): duyệt LUÔN hiện hậu quả lên lịch hẹn.
 * Quyết là việc của quản lý trở lên (RLS `leave_decide` #166); xin là việc của
 * chính mình (`leave_self_insert`).
 */
export function LeavePanel({
  me,
  leaves,
  names,
  apptByLeave,
  canManage,
}: {
  me: Employee | null;
  leaves: LeaveRequest[];
  names: Map<string, string>;
  apptByLeave: Record<string, number>;
  canManage: boolean;
}) {
  const t = useTranslations("hr");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState(homNay());
  const [toDate, setToDate] = useState(homNay());
  const [kind, setKind] = useState<(typeof LEAVE_KINDS)[number]>("paid");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function gui() {
    startTransition(async () => {
      const res = await xinNghi({ fromDate, toDate, kind, reason: reason.trim() || null });
      if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
      else {
        toast.success(t("leave.sent"));
        setOpen(false);
        setReason("");
        router.refresh();
      }
    });
  }

  function quyet(leaveId: string, approve: boolean) {
    startTransition(async () => {
      const res = await quyetDonNghi({ leaveId, approve });
      if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
      else {
        toast.success(t(approve ? "leave.approved" : "leave.rejected"));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {me ? t("leave.quota", { n: me.annualLeaveDays }) : t("leave.description")}
        </p>
        {me && !open && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 size-4" />
            {t("leave.request")}
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <h4 className="text-sm font-semibold">{t("leave.requestTitle")}</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("leave.from")}</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("leave.to")}</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("leave.kind")}</Label>
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value as (typeof LEAVE_KINDS)[number])}
              >
                {LEAVE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`leave.kinds.${k}`)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("leave.reason")}</Label>
            <Textarea
              value={reason}
              rows={2}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("leave.reasonPlaceholder")}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button onClick={gui} disabled={pending || toDate < fromDate}>
              {pending ? t("saving") : t("leave.send")}
            </Button>
          </div>
        </div>
      )}

      {leaves.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-[13px] text-muted-foreground">
          {t("leave.empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {leaves.map((l) => {
            const soLich = apptByLeave[l.id];
            return (
              <li key={l.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {names.get(l.employeeId) ?? t("leave.someone")} ·{" "}
                      {t(`leave.kinds.${l.kind}`)}
                    </p>
                    <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
                      <CalendarDays className="size-3.5" />
                      {formatDate(l.fromDate, locale)} → {formatDate(l.toDate, locale)}
                    </p>
                    {l.reason && <p className="text-[13px] text-muted-foreground">{l.reason}</p>}
                  </div>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs",
                      l.status === "approved"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : l.status === "rejected"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {t(`leave.statuses.${l.status}`)}
                  </span>
                </div>

                {/* Hậu quả lên lịch hẹn — hiện TRƯỚC khi bấm duyệt, không phải sau. */}
                {l.status === "pending" && soLich != null && soLich > 0 && (
                  <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-[13px] text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    {t("leave.apptWarning", { n: soLich })}
                  </p>
                )}

                {canManage && l.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => quyet(l.id, true)} disabled={pending}>
                      <Check className="mr-1 size-3.5" />
                      {t("leave.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => quyet(l.id, false)}
                      disabled={pending}
                    >
                      <X className="mr-1 size-3.5" />
                      {t("leave.reject")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {leaves.length >= LEAVE_LIST_LIMIT && (
        <p className="text-xs text-muted-foreground">{t("leave.limitNote", { n: LEAVE_LIST_LIMIT })}</p>
      )}
    </div>
  );
}
