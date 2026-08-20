"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Calculator,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Lock,
  LockOpen,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDate, formatMoney } from "@/lib/format";
import { kpiMonthLabel, shiftMonth } from "@/lib/kpi";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { chotKyLuong, layDongHoaHong, moKhoaKyLuong, themDongTay, tinhLaiKyLuong, xoaDongTay } from "./actions";
import {
  HOA_HONG_MOI_TRANG,
  MANUAL_KINDS,
  netPhieu,
  type CommissionSummary,
  type ManualKind,
  type PayrollPeriod,
  type Payslip,
  type PayslipLine,
  type PreCloseIssue,
} from "./queries";
import { toastKeyFor } from "./toast-keys";

const digitsOnly = (v: string) => v.replace(/\D/g, "");

/**
 * Bảng lương — thẻ design man-bang-luong.html.
 *
 * ⛔ `canPayroll` = owner/admin. Quản lý rơi vào nhánh từ chối có LỜI GIẢI
 * THÍCH + phiếu của chính họ, KHÔNG phải màn trắng và KHÔNG phải danh sách rỗng
 * (danh sách rỗng khiến người ta tưởng chưa có dữ liệu và đi tìm lỗi ở chỗ khác).
 */
export default function PayrollView({
  role,
  canPayroll,
  monthKey,
  period,
  payslips,
  issues,
  blocking,
  revenueVnd,
  loadFailed,
}: {
  role: string;
  canPayroll: boolean;
  monthKey: string;
  period: PayrollPeriod | null;
  payslips: Payslip[];
  issues: PreCloseIssue[];
  blocking: boolean;
  revenueVnd: number;
  loadFailed: boolean;
}) {
  const t = useTranslations("payroll");

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
        {/* Từ lg mới nới: đây là danh sách phiếu lương cả tiệm, càng đông người
            càng cần bề ngang. Dưới lg giữ nguyên 768px như cũ. */}
        <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6 lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>

          {canPayroll ? (
            <ManageView
              monthKey={monthKey}
              period={period}
              payslips={payslips}
              issues={issues}
              blocking={blocking}
              revenueVnd={revenueVnd}
            />
          ) : (
            <SelfView role={role} payslips={payslips} />
          )}

          <div className="rounded-lg border border-dashed p-3">
            <p className="text-xs font-medium">{t("boundaries.title")}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              <li>{t("boundaries.tax")}</li>
              <li>{t("boundaries.transfer")}</li>
              <li>{t("boundaries.insurance")}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== VAI KHÔNG XEM ĐƯỢC LƯƠNG CẢ TIỆM ====================

function SelfView({ role, payslips }: { role: string; payslips: Payslip[] }) {
  const t = useTranslations("payroll");
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="text-sm font-medium">{t("denied.title")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {role === "manager" ? t("denied.manager") : t("denied.staff")}
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">{t("mine.title")}</h2>
        {payslips.length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-[13px] text-muted-foreground">
            {t("mine.empty")}
          </p>
        ) : (
          <div className="space-y-3">
            {payslips.map((p) => (
              <div key={p.id} className="rounded-lg border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">
                    {p.employeeName ?? t("mine.title")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("mine.issuedOn", { date: formatDate(p.createdAt, locale) })}
                  </p>
                </div>
                <LineList lines={p.lines} payslipId={p.id} commission={p.commission} />
                <Totals lines={p.lines} commission={p.commission} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== CHỦ TIỆM / QUẢN TRỊ ====================

function ManageView({
  monthKey,
  period,
  payslips,
  issues,
  blocking,
  revenueVnd,
}: {
  monthKey: string;
  period: PayrollPeriod | null;
  payslips: Payslip[];
  issues: PreCloseIssue[];
  blocking: boolean;
  revenueVnd: number;
}) {
  const t = useTranslations("payroll");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fund, setFund] = useState<"cash" | "bank">("bank");
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");

  const closed = period?.status === "closed";
  const tongKy = payslips.reduce((s, p) => s + netPhieu(p.lines, p.commission), 0);
  const phanTram = revenueVnd > 0 ? Math.round((tongKy / revenueVnd) * 100) : null;

  function chay(fn: () => Promise<{ error: string | null }>, okKey: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
      else toast.success(t(okKey));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        <Link
          href={`/app/payroll?m=${shiftMonth(monthKey, -1)}`}
          className="flex size-8 max-md:size-11 items-center justify-center rounded-md border hover:bg-muted/60"
          aria-label={t("prevMonth")}
        >
          <ChevronLeft className="size-4" />
        </Link>
        <span className="text-sm font-medium tabular-nums">{kpiMonthLabel(monthKey)}</span>
        <Link
          href={`/app/payroll?m=${shiftMonth(monthKey, 1)}`}
          className="flex size-8 max-md:size-11 items-center justify-center rounded-md border hover:bg-muted/60"
          aria-label={t("nextMonth")}
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {/* Quỹ lương tháng — con số đầu bảng của thẻ. */}
      <div className="rounded-lg border p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted-foreground">{t("fund.title")}</p>
            <p className="text-2xl font-bold tabular-nums">{formatMoney(tongKy, locale)}</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs",
              closed
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {closed ? <Lock className="size-3" /> : null}
            {t(`statuses.${period?.status ?? "none"}`)}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {phanTram == null
            ? t("fund.noRevenue")
            : t("fund.ratio", { percent: phanTram, people: payslips.length })}
        </p>
        {closed && period?.closedAt && (
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("fund.closedOn", { date: formatDate(period.closedAt, locale) })}
          </p>
        )}
        {period?.unlockReason && (
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("fund.lastUnlock", { reason: period.unlockReason })}
          </p>
        )}
      </div>

      {/* Soát trước khi chốt — máy HỎI, không tự quyết. */}
      {!closed && issues.length > 0 && (
        <div className="space-y-1.5 rounded-lg border p-3">
          <p className="text-sm font-semibold">{t("checks.title")}</p>
          {issues.map((it, i) => (
            <p
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-md p-2 text-[13px]",
                it.kind === "timesheetNotClosed"
                  ? "bg-destructive/10 text-destructive"
                  : it.kind === "payrollRatio"
                    ? "bg-muted/60 text-muted-foreground"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
              )}
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {it.kind === "payrollRatio"
                ? it.prevPercent == null
                  ? t("checks.ratio", { percent: it.percent })
                  : t("checks.ratioPrev", { percent: it.percent, prev: it.prevPercent })
                : it.kind === "fullBaseButShortDays"
                  ? t("checks.fullBaseButShortDays", { name: it.name, days: it.days })
                  : t(`checks.${it.kind}`, { name: it.name })}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">{t("checks.askNotDecide")}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!closed && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => chay(() => tinhLaiKyLuong({ period: monthKey }), "recalcDone")}
          >
            <Calculator className="mr-1 size-4" />
            {pending ? t("saving") : t("recalc")}
          </Button>
        )}
        {!closed && payslips.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              className="h-9 w-36"
              value={fund}
              onChange={(e) => setFund(e.target.value as "cash" | "bank")}
            >
              <option value="bank">{t("funds.bank")}</option>
              <option value="cash">{t("funds.cash")}</option>
            </Select>
            <Button
              disabled={pending || blocking}
              onClick={() =>
                startTransition(async () => {
                  const res = await chotKyLuong({ period: monthKey, fund });
                  if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
                  else toast.success(t("closeDone"));
                  router.refresh();
                })
              }
            >
              <Lock className="mr-1 size-4" />
              {t("close")}
            </Button>
          </div>
        )}
        {closed && (
          <Button variant="outline" disabled={pending} onClick={() => setUnlockOpen(true)}>
            <LockOpen className="mr-1 size-4" />
            {t("unlock")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {blocking ? t("closeBlocked") : closed ? t("closedHint") : t("closeHint")}
      </p>

      {unlockOpen && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold">{t("unlockTitle")}</p>
          <p className="text-[13px] text-muted-foreground">{t("unlockHint")}</p>
          <Label htmlFor="payroll-unlock">{t("unlockReason")}</Label>
          <Input
            id="payroll-unlock"
            value={unlockReason}
            maxLength={300}
            onChange={(e) => setUnlockReason(e.target.value)}
            placeholder={t("unlockPlaceholder")}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setUnlockOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button
              disabled={pending || unlockReason.trim().length === 0}
              onClick={() => {
                chay(
                  () => moKhoaKyLuong({ period: monthKey, reason: unlockReason.trim() }),
                  "unlockDone",
                );
                setUnlockOpen(false);
              }}
            >
              {pending ? t("saving") : t("unlockSubmit")}
            </Button>
          </div>
        </div>
      )}

      {payslips.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-[13px] text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {payslips.map((p) => (
            <PayslipCard key={p.id} payslip={p} locked={closed} />
          ))}
        </div>
      )}

      {/* Ai xem được gì — bảng của thẻ, in thẳng lên màn. */}
      <div className="rounded-lg border p-3">
        <p className="text-xs font-medium">{t("whoSees.title")}</p>
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          <li>{t("whoSees.owner")}</li>
          <li>{t("whoSees.manager")}</li>
          <li>{t("whoSees.staff")}</li>
        </ul>
      </div>
    </div>
  );
}

// ==================== MỘT PHIẾU LƯƠNG ====================

function PayslipCard({ payslip, locked }: { payslip: Payslip; locked: boolean }) {
  const t = useTranslations("payroll");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<ManualKind>("advance");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [isDeduction, setIsDeduction] = useState(true);
  const [pending, startTransition] = useTransition();

  const tongNet = netPhieu(payslip.lines, payslip.commission);
  const hoaHong = payslip.commission.totalVnd;
  const luongCung = payslip.lines
    .filter((l) => l.kind === "base")
    .reduce((s, l) => s + l.amountVnd, 0);

  function them() {
    const so = parseInt(digitsOnly(amount) || "0", 10);
    if (!so || label.trim().length === 0) return;
    startTransition(async () => {
      const res = await themDongTay({
        payslipId: payslip.id,
        kind,
        amountVnd: so,
        isDeduction,
        label: label.trim(),
      });
      if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
      else {
        toast.success(t("toasts.saved"));
        setAdding(false);
        setAmount("");
        setLabel("");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
        onClick={() => setOpen(!open)}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {payslip.employeeName ?? t("unknownEmployee")}
        </span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
          {t("card.base")} {formatMoney(luongCung, locale)} · {t("card.commission")}{" "}
          {formatMoney(hoaHong, locale)}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatMoney(tongNet, locale)}
        </span>
      </button>

      {open && (
        <div className="border-t p-3">
          <LineList lines={payslip.lines} payslipId={payslip.id} commission={payslip.commission} />
          <Totals lines={payslip.lines} commission={payslip.commission} />

          {!locked && (
            <div className="mt-3">
              {!adding ? (
                <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                  <Plus className="mr-1 size-3.5" />
                  {t("addLine")}
                </Button>
              ) : (
                <div className="space-y-2 rounded-md bg-muted/40 p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>{t("lineKind")}</Label>
                      <Select value={kind} onChange={(e) => setKind(e.target.value as ManualKind)}>
                        {MANUAL_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {t(`kinds.${k}`)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>{t("lineDirection")}</Label>
                      <Select
                        value={isDeduction ? "minus" : "plus"}
                        onChange={(e) => setIsDeduction(e.target.value === "minus")}
                      >
                        <option value="minus">{t("directions.minus")}</option>
                        <option value="plus">{t("directions.plus")}</option>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>{t("lineAmount")}</Label>
                      <Input
                        value={amount}
                        inputMode="numeric"
                        onChange={(e) => setAmount(e.target.value)}
                        onBlur={(e) => setAmount(digitsOnly(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>{t("lineLabel")}</Label>
                    <Input
                      value={label}
                      maxLength={200}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder={t("lineLabelPlaceholder")}
                    />
                    <p className="text-xs text-muted-foreground">{t("lineLabelHint")}</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setAdding(false)} disabled={pending}>
                      {t("cancel")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={them}
                      disabled={pending || !amount.trim() || label.trim().length === 0}
                    >
                      {pending ? t("saving") : t("save")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!locked &&
            payslip.lines.some((l) => l.sourceType === "manual") && (
              <ul className="mt-3 space-y-1">
                {payslip.lines
                  .filter((l) => l.sourceType === "manual")
                  .map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {l.label}
                      </span>
                      <button
                        type="button"
                        className="flex shrink-0 items-center gap-1 text-destructive hover:underline"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await xoaDongTay({ lineId: l.id, payslipId: payslip.id });
                            if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
                            else router.refresh();
                          })
                        }
                      >
                        <Trash2 className="size-3" />
                        {t("removeLine")}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}

// ==================== DÒNG TIỀN ====================

/** Một dòng tiền — dùng cho cả dòng thường lẫn chi tiết hoa hồng khi bung. */
function LineRow({ line }: { line: PayslipLine }) {
  const t = useTranslations("payroll");
  const locale = useLocale() as Locale;

  return (
    <li className="flex items-start gap-3 py-2 text-[13px]">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t(`kinds.${line.kind}`)}</p>
        {line.label && <p className="text-muted-foreground">{line.label}</p>}
        <p className="text-xs text-muted-foreground">{t(`sources.${line.sourceType}`)}</p>
      </div>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          line.amountVnd < 0 ? "text-destructive" : "font-medium",
        )}
      >
        {line.amountVnd < 0 ? "−" : ""}
        {formatMoney(Math.abs(line.amountVnd), locale)}
      </span>
    </li>
  );
}

/**
 * Việc #216: cả nghìn dòng hoa hồng gộp thành MỘT dòng tổng (số giao dịch + tổng
 * tiền), bấm mới bung chi tiết. Chi tiết tải theo trang khi bung — thu gọn không
 * kéo gì về client. Dữ liệu chi tiết trong CSDL giữ nguyên để đối chiếu; đây chỉ
 * là cách HIỂN THỊ.
 */
function CommissionGroup({
  payslipId,
  commission,
}: {
  payslipId: string;
  commission: CommissionSummary;
}) {
  const t = useTranslations("payroll");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<PayslipLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [het, setHet] = useState(false);

  async function taiThem() {
    setLoading(true);
    setFailed(false);
    const res = await layDongHoaHong({ payslipId, offset: lines.length });
    if (res.error) {
      setFailed(true);
    } else {
      setLines((truoc) => [...truoc, ...res.lines]);
      if (res.lines.length < HOA_HONG_MOI_TRANG) setHet(true);
    }
    setLoading(false);
  }

  function bung() {
    const moi = !open;
    setOpen(moi);
    // Chỉ tải khi bung lần đầu — thu gọn không kéo cả nghìn dòng về.
    if (moi && lines.length === 0 && !het) void taiThem();
  }

  return (
    <>
      <li>
        <button
          type="button"
          className="flex min-h-[44px] w-full items-center gap-3 py-2 text-left text-[13px] hover:bg-muted/40"
          onClick={bung}
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t("kinds.commission")}</p>
            <p className="text-xs text-muted-foreground">
              {t("commissionGroup.count", { count: commission.count })}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 tabular-nums",
              commission.totalVnd < 0 ? "text-destructive" : "font-medium",
            )}
          >
            {commission.totalVnd < 0 ? "−" : ""}
            {formatMoney(Math.abs(commission.totalVnd), locale)}
          </span>
        </button>
      </li>
      {open && (
        <li className="py-1">
          <ul className="divide-y border-l-2 border-muted pl-3">
            {lines.map((l) => (
              <LineRow key={l.id} line={l} />
            ))}
            <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
              <span className={cn("text-muted-foreground", failed && "text-destructive")}>
                {failed
                  ? t("commissionGroup.loadFailed")
                  : t("commissionGroup.shown", { shown: lines.length, count: commission.count })}
              </span>
              {loading ? (
                <span className="text-muted-foreground">{t("commissionGroup.loading")}</span>
              ) : !het ? (
                <Button variant="outline" onClick={() => void taiThem()}>
                  {failed ? t("commissionGroup.retry") : t("commissionGroup.loadMore")}
                </Button>
              ) : null}
            </li>
          </ul>
        </li>
      )}
    </>
  );
}

function LineList({
  lines,
  payslipId,
  commission,
}: {
  lines: PayslipLine[];
  payslipId: string;
  commission: CommissionSummary;
}) {
  const t = useTranslations("payroll");
  const coHoaHong = commission.count > 0;

  if (lines.length === 0 && !coHoaHong) {
    return <p className="py-3 text-[13px] text-muted-foreground">{t("noLines")}</p>;
  }

  return (
    <ul className="divide-y">
      {lines.map((l) => (
        <LineRow key={l.id} line={l} />
      ))}
      {coHoaHong && <CommissionGroup payslipId={payslipId} commission={commission} />}
    </ul>
  );
}

/**
 * Thực nhận cộng TỪ DÒNG đang hiện + tổng hoa hồng đã gộp — không đọc cột tổng.
 * Người xem thấy đúng thứ họ đang nhìn cộng lại, không có con số nào không giải
 * thích được.
 */
function Totals({ lines, commission }: { lines: PayslipLine[]; commission: CommissionSummary }) {
  const t = useTranslations("payroll");
  const locale = useLocale() as Locale;
  const net = netPhieu(lines, commission);

  return (
    <div className="mt-2 flex items-baseline justify-between border-t pt-2">
      <span className="text-sm font-semibold">{t("net")}</span>
      <span className="text-base font-bold tabular-nums">{formatMoney(net, locale)}</span>
    </div>
  );
}
