"use client";

import { useMemo } from "react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { TileChart } from "@/components/illustrations/tile-chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { formatVN } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import {
  KPI_METRICS,
  KPI_PACE_TEXT_CLASS,
  currentMonthVN,
  fetchKpiProgress,
  isMonthKey,
  kpiMonthLabel,
  kpiPaceStatus,
  kpiPercent,
  shiftMonth,
  type KpiProgress,
  type KpiTargetProgress,
} from "@/lib/kpi";
import type { Locale } from "@/i18n/config";
import { ReportNav } from "../report-nav";

/**
 * "Mục tiêu tháng" cả đội — mỗi người một hàng × 3 chỉ số: thực đạt/mục tiêu,
 * % đạt, nhãn nhịp kiểu GoK (nói thành chữ, chiều tốt/xấu do màn khai báo);
 * đổi mục tiêu giữa tháng → ghi chú "đã đổi ngày N" (cột updated_at, #59).
 * Tháng nằm trên URL (?m=) để chia sẻ được; hết tháng chuyển lùi xem lịch sử.
 */
export function KpiReportView({
  canView,
  initialMonth,
  initialProgress,
  memberNames,
}: {
  canView: boolean;
  initialMonth: string;
  initialProgress?: KpiProgress;
  /** user_id → tên hiển thị (thành viên đang hoạt động — page tra một lần). */
  memberNames?: Record<string, string>;
}) {
  const t = useTranslations("kpi");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);

  const [rawMonth, setMonth] = useQueryState(
    "m",
    parseAsString.withDefault(initialMonth),
  );
  // Người dùng sửa tay URL thành giá trị lạ → rơi về tháng hiện tại, không vỡ RPC
  const month = isMonthKey(rawMonth) ? rawMonth : currentMonthVN();

  const report = useQuery({
    queryKey: ["kpi-report", month],
    queryFn: () => fetchKpiProgress(supabase, month),
    initialData: month === initialMonth ? initialProgress : undefined,
    enabled: canView,
  });

  if (!canView) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center">
          <div className="rounded-full bg-muted p-4">
            <Lock className="size-8 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold">{t("report.noPermission.title")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("report.noPermission.description")}
          </p>
        </div>
      </div>
    );
  }

  const data = report.data;
  const shopByMetric = new Map(
    (data?.targets ?? [])
      .filter((r) => r.user_id === null)
      .map((r) => [r.metric, r]),
  );
  // Mỗi người một hàng — chỉ người CÓ mục tiêu tháng này (chưa đặt thì không
  // bịa hàng 0/0), xếp theo tên cho dễ dò.
  const userIds = [
    ...new Set(
      (data?.targets ?? [])
        .filter((r) => r.user_id !== null)
        .map((r) => r.user_id as string),
    ),
  ];
  const userRows = userIds
    .map((id) => ({
      id,
      name: memberNames?.[id] ?? "—",
      byMetric: new Map(
        (data?.targets ?? [])
          .filter((r) => r.user_id === id)
          .map((r) => [r.metric, r]),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const isEmpty = (data?.targets ?? []).length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <h1 className="mr-auto min-w-0 truncate text-sm font-semibold">
          {t("report.title")}
        </h1>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label={t("month.prev")}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <span className="text-[13px] font-medium tabular-nums">
            {t("month.label", { month: kpiMonthLabel(month) })}
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t("month.next")}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Từ xl mới nới: bảng báo cáo nhiều cột số, trên màn 1440px khoá 896px
            thì cột bị bóp trong khi hai bên bỏ trống. Ba màn dùng chung thanh
            ReportNav này phải cùng một mốc — lệch nhau thì bấm qua lại giữa
            chúng thấy khung nhảy. Dưới xl giữ nguyên. */}
        <div className="mx-auto w-full max-w-4xl space-y-4 p-4 xl:max-w-6xl">
          <ReportNav />

          {report.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : report.isError ? (
            <div className="rounded-lg border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">{t("report.error")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => report.refetch()}
              >
                {t("report.retry")}
              </Button>
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
              <TileChart className="size-16" />
              <h2 className="text-base font-semibold">{t("report.empty.title")}</h2>
              <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                {t("report.empty.description")}
              </p>
              <Button asChild size="sm">
                <Link href="/app/settings/team">{t("report.empty.cta")}</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="h-10 border-b">
                      <th className="px-4 font-medium">{t("report.memberCol")}</th>
                      {KPI_METRICS.map((m) => (
                        <th
                          key={m}
                          className="px-4 text-right font-medium whitespace-nowrap"
                        >
                          {t(`metrics.${m}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Mục tiêu CẢ TIỆM đứng đầu (nếu có) — không thuộc riêng ai */}
                    {shopByMetric.size > 0 && (
                      <Row
                        name={t("report.shopRow")}
                        byMetric={shopByMetric}
                        locale={locale}
                        t={t}
                      />
                    )}
                    {userRows.map((r) => (
                      <Row
                        key={r.id}
                        name={r.name}
                        byMetric={r.byMetric}
                        locale={locale}
                        t={t}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Một câu định nghĩa để số KHỚP được với màn khác khi có ai đối chiếu:
              cùng cách đếm với Tổng quan/Báo cáo nguồn (một đường code, #59) */}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("report.footnote")}
          </p>
        </div>
      </div>
    </div>
  );
}

type T = ReturnType<typeof useTranslations>;

function Row({
  name,
  byMetric,
  locale,
  t,
}: {
  name: string;
  byMetric: Map<string, KpiTargetProgress>;
  locale: Locale;
  t: T;
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="max-w-44 truncate px-4 py-2.5 font-medium">{name}</td>
      {KPI_METRICS.map((metric) => {
        const row = byMetric.get(metric);
        if (!row) {
          return (
            <td key={metric} className="px-4 py-2.5 text-right text-muted-foreground">
              —
            </td>
          );
        }
        const status = kpiPaceStatus(row);
        const pct = kpiPercent(row);
        // Đổi mục tiêu giữa tháng: touch trigger đẩy updated_at lên sau created_at
        const changed =
          new Date(row.updated_at).getTime() > new Date(row.created_at).getTime();
        return (
          <td key={metric} className="px-4 py-2.5 text-right whitespace-nowrap">
            <p className="tabular-nums">
              {metric === "revenue_won"
                ? t("report.actualOfTarget", {
                    actual: formatMoney(row.actual, locale),
                    target: formatMoney(row.target, locale),
                  })
                : t("report.actualOfTarget", {
                    actual: row.actual,
                    target: row.target,
                  })}
            </p>
            <p className="mt-0.5 text-xs">
              <span className="font-semibold tabular-nums">{pct}%</span>
              <span className={cn("ml-1.5 font-medium", KPI_PACE_TEXT_CLASS[status])}>
                {t(`pace.${status}`)}
              </span>
            </p>
            {changed && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("report.changed", { date: formatVN(row.updated_at, "dd/MM") })}
              </p>
            )}
          </td>
        );
      })}
    </tr>
  );
}
