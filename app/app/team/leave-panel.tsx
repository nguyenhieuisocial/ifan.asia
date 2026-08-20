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
  phepDaDung,
  employees,
}: {
  me: Employee | null;
  leaves: LeaveRequest[];
  names: Map<string, string>;
  apptByLeave: Record<string, number>;
  canManage: boolean;
  /** #250 — ngày phép năm đã dùng theo id hồ sơ. `null` = CHƯA TRA ĐƯỢC. */
  phepDaDung: Record<string, number> | null;
  /**
   * Hồ sơ ĐỌC ĐƯỢC — nguồn duy nhất cho HẠN MỨC phép (`annual_leave_days`).
   *
   * ⚠️ Với vai QUẢN LÝ mảng này chỉ có đúng hồ sơ của chính họ: `employees` chứa
   * lương cứng nên RLS #166 khoá cho owner/admin, và khe hẹp `employees_ten()`
   * (#177) cố ý KHÔNG trả hạn mức phép. ⇒ quản lý duyệt đơn thì thấy được ĐÃ
   * DÙNG bao nhiêu (đơn nghỉ họ đọc được), nhưng không thấy CÒN bao nhiêu.
   * Nói thẳng ra chỗ đó thay vì in một số nửa đúng.
   */
  employees: Employee[];
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

  /**
   * #250 — quỹ phép của CHÍNH MÌNH. Trước bản này dòng ở đây in thẳng
   * `me.annualLeaveDays` (hạn mức ĐƯỢC CẤP) dưới khoá `leave.quota` có chữ
   * "còn" — chữ nói một đằng, số một nẻo, và quản lý duyệt đơn dựa vào nó.
   *
   * `null` (chưa tra được) KHÔNG rơi về 0: "còn 0 ngày" chặn người ta xin nghỉ,
   * còn "chưa tra được" thì không. Hai chuyện khác nhau, hai câu khác nhau.
   */
  const hanMuc = new Map(employees.map((e) => [e.id, e.annualLeaveDays] as const));
  const daDungCuaToi = me && phepDaDung ? (phepDaDung[me.id] ?? 0) : null;
  const conLai = me && daDungCuaToi != null ? Math.max(0, me.annualLeaveDays - daDungCuaToi) : null;

  /** Số ngày đơn đang soạn sẽ chiếm — ước lượng theo NGÀY LỊCH. */
  const soNgayDang =
    toDate >= fromDate
      ? Math.round(
          (new Date(`${toDate}T00:00:00Z`).getTime() -
            new Date(`${fromDate}T00:00:00Z`).getTime()) /
            86_400_000,
        ) + 1
      : 0;
  // Chỉ phép NĂM mới đụng quỹ: ốm là chế độ khác, không lương thì không tiêu quỹ
  // (migration #250 điểm chốt 3).
  const vuotQuy = kind === "paid" && conLai != null && soNgayDang > conLai;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {!me
            ? t("leave.description")
            : conLai == null
              ? t("leave.quotaUnknown", { n: me.annualLeaveDays })
              : t("leave.quotaLeft", {
                  left: conLai,
                  total: me.annualLeaveDays,
                  used: daDungCuaToi ?? 0,
                })}
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
          {/* Số ngày đơn này chiếm — nói TRƯỚC khi bấm gửi. Ước lượng theo ngày
              lịch; số CHỐT do CSDL đặt (trigger `leave_dat_so_ngay` #250) vì nó
              còn trừ ngày đã xếp ca "Nghỉ" mà màn này chưa nạp lịch ca. */}
          {soNgayDang > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {t("leave.daysEstimate", { n: soNgayDang })}
            </p>
          )}
          {/* CẢNH BÁO, KHÔNG CHẶN — cùng luật với chấm công ngoài vùng (quyết
              định 1 của thẻ). Hết phép mà vẫn phải nghỉ là chuyện có thật; chặn
              ở đây chỉ đẩy người ta sang nhắn tin riêng, và tiệm mất dấu vết. */}
          {vuotQuy && (
            <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-[13px] text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {t("leave.overQuota", { left: conLai ?? 0, want: soNgayDang })}
            </p>
          )}
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
                      {/* #250 — số ngày ĐÓNG BĂNG trên đơn. Đơn cũ (trước
                          migration) mang 0 ⇒ không in, thà thiếu còn hơn in "0
                          ngày" cho một đợt nghỉ có thật. */}
                      {l.daysCount > 0 && <> · {t("leave.days", { n: l.daysCount })}</>}
                    </p>
                    {l.kind === "sick" && (
                      <p className="text-[13px] text-muted-foreground">{t("leave.sickNote")}</p>
                    )}
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

                {/* #250 — quỹ phép của NGƯỜI XIN, hiện TRƯỚC khi bấm duyệt.
                    Trước bản này quản lý duyệt mà không có con số nào để dựa. */}
                {canManage && l.status === "pending" && l.kind === "paid" && phepDaDung && (
                  <p className="text-[13px] text-muted-foreground">
                    {hanMuc.has(l.employeeId)
                      ? t("leave.balanceFull", {
                          used: phepDaDung[l.employeeId] ?? 0,
                          total: hanMuc.get(l.employeeId) ?? 0,
                          after: Math.max(
                            0,
                            (hanMuc.get(l.employeeId) ?? 0) -
                              (phepDaDung[l.employeeId] ?? 0) -
                              l.daysCount,
                          ),
                        })
                      : t("leave.balanceUsedOnly", { used: phepDaDung[l.employeeId] ?? 0 })}
                  </p>
                )}

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
