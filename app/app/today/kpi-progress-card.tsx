"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  KPI_METRICS,
  KPI_PACE_BAR_CLASS,
  KPI_PACE_TEXT_CLASS,
  fetchKpiProgress,
  kpiPaceStatus,
  kpiPercent,
  type KpiProgress,
} from "@/lib/kpi";
import type { Locale } from "@/i18n/config";

/**
 * Khối "Mục tiêu tháng của tôi" trên màn Hôm nay (hồ sơ KPI mục 9, phần 3):
 * thanh tiến độ + nhãn vượt/hụt nhịp so với ngày trong tháng. Page CHỈ mount
 * khối này khi người đang xem CÓ mục tiêu tháng này — chưa đặt thì ẩn hẳn
 * (không hiện 0/0). Tự làm mới 60s cùng nhịp hàng đợi; đánh dấu xong việc
 * cũng invalidate để "việc xong" nhảy ngay.
 */
export function KpiProgressCard({
  userId,
  month,
  initial,
}: {
  userId: string;
  /** Khóa tháng hiện tại giờ VN (yyyy-MM-01) — page tính, render thuần. */
  month: string;
  initial: KpiProgress;
}) {
  const t = useTranslations("kpi");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);

  const progress = useQuery({
    queryKey: ["kpi-progress", month],
    queryFn: () => fetchKpiProgress(supabase, month),
    initialData: initial,
    refetchInterval: 60_000,
  });
  const data = progress.data ?? initial;

  // Chỉ tiến độ CỦA MÌNH — mục tiêu cả tiệm/đồng nghiệp thuộc màn Báo cáo
  const mine = KPI_METRICS.flatMap((m) => {
    const row = data.targets.find((x) => x.user_id === userId && x.metric === m);
    return row ? [row] : [];
  });
  if (mine.length === 0) return null;

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <Target aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {t("today.title")}
        </h2>
        {/* Mốc để hiểu nhãn nhịp: đang ở ngày mấy của tháng */}
        <span className="text-xs tabular-nums text-muted-foreground">
          {t("today.dayNote", {
            day: data.days_elapsed,
            days: data.days_in_month,
          })}
        </span>
      </div>
      <ul className="mt-3 space-y-3">
        {mine.map((row) => {
          const status = kpiPaceStatus(row);
          const pct = kpiPercent(row);
          return (
            <li key={row.metric}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-[13px] font-medium">
                  {t(`metrics.${row.metric}`)}
                </p>
                <p className="text-[13px] font-semibold tabular-nums">{pct}%</p>
              </div>
              <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
                role="presentation"
              >
                <div
                  className={cn("h-full rounded-full transition-all", KPI_PACE_BAR_CLASS[status])}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {row.metric === "revenue_won"
                    ? t("today.progressOf", {
                        actual: formatMoney(row.actual, locale),
                        target: formatMoney(row.target, locale),
                      })
                    : t("today.progressOf", {
                        actual: row.actual,
                        target: row.target,
                      })}
                </p>
                <p className={cn("text-xs font-medium", KPI_PACE_TEXT_CLASS[status])}>
                  {t(`pace.${status}`)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
