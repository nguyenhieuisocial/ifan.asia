"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Calculator, ChevronLeft, ChevronRight, CircleAlert, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { kpiMonthLabel, shiftMonth } from "@/lib/kpi";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { datTiLe, tinhLaiHoaHong } from "./actions";
import {
  JOB_TYPES,
  type CommissionRate,
  type CommissionWarnings,
  type EmployeeTotal,
  type JobType,
} from "./queries";

/**
 * Hoa hồng — thẻ design man-hoa-hong.html.
 *
 * MỘT màn cho MỌI vai, không tách hai màn: nhân viên thấy đúng phần của mình vì
 * RLS chỉ trả về đúng chừng đó, chứ không vì màn hình có nhánh riêng cho họ.
 * Nhánh `canSeeTeam` chỉ đổi CHỮ (tiêu đề bảng, khối cảnh báo), không đổi dữ liệu.
 */
export default function CommissionsView({
  monthKey,
  canSeeTeam,
  canSetRates,
  payrollClosed,
  rates,
  chuaAiChonTiLe,
  totals,
  warnings,
  truncated,
  loadFailed,
}: {
  monthKey: string;
  canSeeTeam: boolean;
  canSetRates: boolean;
  payrollClosed: boolean;
  rates: CommissionRate[];
  /** Tỉ lệ chưa ai chọn — máy gieo sẵn. Phải nói ra, xem queries.ts. */
  chuaAiChonTiLe: boolean;
  totals: EmployeeTotal[];
  warnings: CommissionWarnings;
  truncated: boolean;
  loadFailed: boolean;
}) {
  const t = useTranslations("commissions");
  const locale = useLocale() as Locale;

  if (loadFailed) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {t("loadFailed")}
      </div>
    );
  }

  const tong = totals.reduce((s, e) => s + e.amountVnd, 0);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>

          <MonthBar monthKey={monthKey} payrollClosed={payrollClosed} canRecalc={canSeeTeam} />

          {canSeeTeam && <WarningBlock warnings={warnings} />}

          <section className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <h2 className="text-[13px] font-semibold">
                {canSeeTeam ? t("table.teamTitle") : t("table.mineTitle")}
              </h2>
            </div>

            {totals.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">{t("empty")}</p>
            ) : (
              <div className="divide-y">
                <div className="flex px-4 py-2 text-[11px] font-semibold text-muted-foreground">
                  <span className="flex-1">{t("table.person")}</span>
                  <span className="w-28 text-right">{t("table.sales")}</span>
                  <span className="w-28 text-right">{t("table.commission")}</span>
                </div>
                {totals.map((e) => (
                  <PersonRow key={e.employeeId} total={e} />
                ))}
                <div className="flex px-4 py-3 text-[13px] font-semibold">
                  <span className="flex-1">{t("table.total")}</span>
                  <span className="w-28 text-right">{formatMoney(tong, locale)}</span>
                </div>
              </div>
            )}

            <p className="border-t px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {t("table.flowsToPayroll")}
            </p>
            {truncated && (
              <p className="border-t px-4 py-2.5 text-[11px] leading-relaxed text-destructive">
                {t("table.truncated")}
              </p>
            )}
          </section>

          <RatesBlock rates={rates} canSetRates={canSetRates} chuaAiChon={chuaAiChonTiLe} />
        </div>
      </div>
    </div>
  );
}

// ==================== THÁNH ĐIỀU HƯỚNG + TÍNH LẠI ====================

function MonthBar({
  monthKey,
  payrollClosed,
  canRecalc,
}: {
  monthKey: string;
  payrollClosed: boolean;
  canRecalc: boolean;
}) {
  const t = useTranslations("commissions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const tinhLai = () =>
    startTransition(async () => {
      const res = await tinhLaiHoaHong({ period: monthKey });
      if (res.error) {
        toast.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : t("errors.save_failed"));
        return;
      }
      toast.success(t("recalcDone", { n: res.created ?? 0 }));
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href={`/app/commissions?m=${shiftMonth(monthKey, -1)}`} aria-label={t("prevMonth")}>
          <ChevronLeft className="size-4" />
        </Link>
      </Button>
      <span className="text-[13px] font-semibold">{kpiMonthLabel(monthKey)}</span>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/app/commissions?m=${shiftMonth(monthKey, 1)}`} aria-label={t("nextMonth")}>
          <ChevronRight className="size-4" />
        </Link>
      </Button>

      <span
        className={cn(
          "rounded px-2 py-0.5 text-[11px] font-medium",
          payrollClosed ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-900",
        )}
      >
        {payrollClosed ? t("status.settled") : t("status.provisional")}
      </span>

      {canRecalc && (
        <Button size="sm" variant="outline" className="ml-auto" onClick={tinhLai} disabled={pending}>
          <Calculator className="size-4" />
          {pending ? t("recalcRunning") : t("recalc")}
        </Button>
      )}
    </div>
  );
}

// ==================== CẢNH BÁO — HỎI, KHÔNG CHẶN ====================

/**
 * Quyết định 5 của thẻ: "máy CẢNH BÁO chứ không chặn — chủ tiệm có thể có lý do,
 * nhưng phải biết mình đang chốt cái gì." Nên ở đây không có nút nào bị khoá vì
 * mấy con số này; chúng chỉ nói ra.
 */
function WarningBlock({ warnings }: { warnings: CommissionWarnings }) {
  const t = useTranslations("commissions");
  const co = warnings.pendingOrders > 0 || warnings.ordersWithoutCommission > 0;
  if (!co) return null;

  return (
    <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
      <div className="flex items-center gap-1.5 font-semibold">
        <CircleAlert className="size-4" />
        {t("warnings.title")}
      </div>
      {warnings.pendingOrders > 0 && (
        <p>{t("warnings.pending", { n: warnings.pendingOrders })}</p>
      )}
      {warnings.ordersWithoutCommission > 0 && (
        <p>
          {t("warnings.noPerson", { n: warnings.ordersWithoutCommission })}
          {warnings.scanTruncated ? ` ${t("warnings.scanTruncated")}` : ""}
        </p>
      )}
    </div>
  );
}

// ==================== MỘT NGƯỜI + KHỐI "CÁCH TÍNH" ====================

function PersonRow({ total }: { total: EmployeeTotal }) {
  const t = useTranslations("commissions");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center px-4 py-2.5 text-left text-[13px] hover:bg-foreground/[0.03]"
        aria-expanded={open}
      >
        <span className="flex-1 min-w-0 truncate">{total.name ?? t("unknownEmployee")}</span>
        <span className="w-28 text-right text-muted-foreground">
          {formatMoney(total.baseVnd, locale)}
        </span>
        <span className="w-28 text-right font-medium">{formatMoney(total.amountVnd, locale)}</span>
      </button>

      {/* Quyết định 4 của thẻ: trải ra từng loại việc, mỗi dòng nói rõ mức nào. */}
      {open && (
        <div className="space-y-1 bg-muted/30 px-4 py-2.5 text-[12px]">
          {total.byJob.map((j) => (
            <div key={j.jobType ?? "manual"} className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {j.jobType ? t(`jobTypes.${j.jobType}`) : t("jobTypes.manual")}
                {j.percent !== null ? ` · ${j.percent}%` : ""}
                {j.percent === null && j.jobType ? ` · ${t("mixedRate")}` : ""}
              </span>
              <span>{formatMoney(j.amountVnd, locale)}</span>
            </div>
          ))}
          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t("refundNote")}
          </p>
        </div>
      )}
    </div>
  );
}

// ==================== ĐẶT TỈ LỆ ====================

function RatesBlock({
  rates,
  canSetRates,
  chuaAiChon,
}: {
  rates: CommissionRate[];
  canSetRates: boolean;
  /** Tỉ lệ máy gieo sẵn, chưa ai trong tiệm chọn — xem queries.ts. */
  chuaAiChon: boolean;
}) {
  const t = useTranslations("commissions");
  const theoLoai = new Map(rates.map((r) => [r.jobType, r.percent] as const));

  return (
    <section className="rounded-lg border">
      <div className="border-b px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Percent className="size-4" />
          {t("rates.title")}
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t("rates.byJobHint")}</p>
        {chuaAiChon && (
          <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
            {t("rates.chuaAiChon")}
          </p>
        )}
      </div>

      <div className="divide-y">
        {JOB_TYPES.map((jt) => (
          <RateRow
            key={jt}
            jobType={jt}
            percent={theoLoai.get(jt)}
            canSetRates={canSetRates}
          />
        ))}
      </div>

      <div className="space-y-2 border-t px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <p>{t("rates.packageNote")}</p>
        {/* Thẻ có dòng thứ tư "Khách tự đặt online · 0%". Kho chưa có dấu hiệu nào
            phân biệt ca khách tự đặt, nên dòng đó CỐ Ý chưa dựng — nói ra thay vì
            hiện một ô cấu hình không áp vào được dòng nào. */}
        <p>{t("rates.onlineMissing")}</p>
      </div>
    </section>
  );
}

function RateRow({
  jobType,
  percent,
  canSetRates,
}: {
  jobType: JobType;
  percent: number | undefined;
  canSetRates: boolean;
}) {
  const t = useTranslations("commissions");
  const router = useRouter();
  const [value, setValue] = useState(percent === undefined ? "" : String(percent));
  const [pending, startTransition] = useTransition();

  const luu = () =>
    startTransition(async () => {
      const so = Number(value.replace(",", "."));
      if (!Number.isFinite(so) || so < 0 || so > 100) {
        toast.error(t("errors.invalid_input"));
        return;
      }
      const res = await datTiLe({ jobType, percent: so });
      if (res.error) {
        toast.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : t("errors.save_failed"));
        return;
      }
      toast.success(t("rates.saved"));
      router.refresh();
    });

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
      <span className="flex-1">{t(`jobTypes.${jobType}`)}</span>
      {canSetRates ? (
        <>
          <Input
            className="h-8 w-20 text-right"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={t("rates.percentLabel", { job: t(`jobTypes.${jobType}`) })}
          />
          <span className="text-muted-foreground">%</span>
          <Button size="sm" variant="outline" onClick={luu} disabled={pending}>
            {pending ? t("rates.saving") : t("rates.save")}
          </Button>
        </>
      ) : (
        <span className="font-medium">
          {percent === undefined ? t("rates.notSet") : `${percent}%`}
        </span>
      )}
    </div>
  );
}
