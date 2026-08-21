"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { kpiMonthLabel, shiftMonth } from "@/lib/kpi";
import type { Locale } from "@/i18n/config";
import type { GrossMarginRow, GrossMarginSummary } from "@/lib/finance/gross-margin";
import { ReportNav } from "../report-nav";

export function GrossMarginView({
  canView,
  monthKey,
  rows,
  summary,
}: {
  canView: boolean;
  monthKey: string;
  rows: GrossMarginRow[];
  summary: GrossMarginSummary;
}) {
  const t = useTranslations("reports.grossMargin");
  const locale = useLocale() as Locale;

  if (!canView) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("noPermission.title")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">{t("noPermission.description")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Từ xl mới nới đúng mốc 1152px như 3 màn báo cáo kia (KPI/Nguồn
            khách/Vì sao thua) qua ReportNav — lệch mốc là bấm chuyển giữa các
            báo cáo thấy khung nhảy. Dưới xl giữ nguyên. */}
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6 xl:max-w-6xl 2xl:max-w-[1600px]">
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>

          <ReportNav />

          <div className="flex items-center justify-center gap-3">
            <Link
              href={`/app/reports/gross-margin?m=${shiftMonth(monthKey, -1)}`}
              className="flex size-8 items-center justify-center rounded-md border hover:bg-muted/60"
              aria-label={t("prevMonth")}
            >
              <ChevronLeft className="size-4" />
            </Link>
            <span className="min-w-20 text-center text-[13px] font-medium">{t("month.label", { month: kpiMonthLabel(monthKey) })}</span>
            <Link
              href={`/app/reports/gross-margin?m=${shiftMonth(monthKey, 1)}`}
              className="flex size-8 items-center justify-center rounded-md border hover:bg-muted/60"
              aria-label={t("nextMonth")}
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-lg border p-3">
              <div className="text-[12px] text-muted-foreground">{t("summary.revenue")}</div>
              <div className="mt-1 text-[17px] font-semibold">{formatMoney(summary.revenueVnd, locale)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-[12px] text-muted-foreground">{t("summary.cost")}</div>
              <div className="mt-1 text-[17px] font-semibold">{formatMoney(summary.costVnd, locale)}</div>
            </div>
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <div className="text-[12px] text-primary">{t("summary.margin")}</div>
              <div className="mt-1 text-[17px] font-semibold text-primary">{formatMoney(summary.marginVnd, locale)}</div>
            </div>
          </div>

          {summary.missingCostItemCount > 0 && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-[12px] text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{t("missingCostWarning", { count: summary.missingCostItemCount })}</span>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed p-5 text-center text-[13px] text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="rounded-md border">
              <div className="flex border-b px-3 py-2 text-[11px] font-medium text-muted-foreground">
                <span className="flex-1">{t("columns.item")}</span>
                <span className="w-14 text-right">{t("columns.qty")}</span>
                <span className="w-24 text-right">{t("columns.revenue")}</span>
                {/* NHÃN CỘT nói ra sự thật, không chỉ ghi chú cuối trang. Còn
                    mặt hàng chưa nhập giá vốn ⇒ phần giá vốn trừ vào còn thiếu
                    ⇒ mọi số "lời" ở đây là CẬN TRÊN.

                    Thống nhất với màn Nguồn khách, nơi đã chọn cách này và ghi
                    rõ lý do: "nhãn là thứ người ta đọc, ghi chú là thứ người ta
                    lướt qua". Trước bản này hai màn cùng gặp một vấn đề mà báo
                    hai kiểu khác nhau — người dùng học cách đọc ở màn này rồi
                    sang màn kia đọc sai. */}
                <span className="w-24 text-right">
                  {summary.missingCostItemCount > 0
                    ? t("columns.marginAtMost")
                    : t("columns.margin")}
                </span>
              </div>
              {rows.map((r) => (
                <div key={r.itemId} className="flex items-center border-b px-3 py-2 text-[13px] last:border-b-0">
                  <span className="flex-1 truncate">
                    {r.itemName}
                    {r.hasUnknownCost && <span className="ml-1 text-[10px] text-amber-600">{t("unknownCostBadge")}</span>}
                  </span>
                  <span className="w-14 text-right text-muted-foreground">{r.qtySold}</span>
                  <span className="w-24 text-right">{formatMoney(r.revenueVnd, locale)}</span>
                  {/* Dấu ≤ ngay trên CON SỐ, đúng dòng bị ảnh hưởng — đọc được
                      cả khi người ta bỏ qua nhãn cột và khối cảnh báo. */}
                  <span className={`w-24 text-right font-medium ${r.marginVnd < 0 ? "text-destructive" : ""}`}>
                    {r.hasUnknownCost && "≤ "}
                    {formatMoney(r.marginVnd, locale)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
