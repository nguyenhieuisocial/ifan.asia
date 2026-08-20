"use client";

import { useMemo } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Lightbulb, Lock } from "lucide-react";
import { TileChart } from "@/components/illustrations/tile-chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ReportNav } from "../report-nav";
import {
  DEFAULT_PERIOD,
  LOST_PERIODS,
  fetchLostReasons,
  suggestionKey,
  type LostPeriod,
  type LostReasonRow,
} from "./types";

/**
 * "Vì sao thua" — cộng dồn lý do thua theo kỳ, thanh ngang + tỷ trọng % +
 * xu hướng so kỳ liền trước (học mẫu GoK "Why we lose"). Thanh dựng bằng token
 * (KHÔNG thư viện biểu đồ — cùng luật với reports/sources). Kỳ nằm trên URL
 * (?p=) để chia sẻ được.
 */
export function LostReasonsView({
  canView,
  initialPeriod,
  initialRows,
  seedReasonNames,
  seedReasonKeys,
}: {
  canView: boolean;
  initialPeriod: LostPeriod;
  initialRows?: LostReasonRow[];
  /** id lý do → tên hiển thị (lý do cài sẵn đã dịch, migration #36). */
  seedReasonNames?: Record<string, string>;
  /** id lý do → i18n_key seed (chọn dòng gợi ý cho lý do đứng đầu). */
  seedReasonKeys?: Record<string, string>;
}) {
  const t = useTranslations("reports.lostReasons");
  const supabase = useMemo(() => createClient(), []);

  const [period, setPeriod] = useQueryState(
    "p",
    parseAsStringLiteral(LOST_PERIODS).withDefault(initialPeriod),
  );

  const report = useQuery({
    queryKey: ["lost-reasons-report", period],
    queryFn: () => fetchLostReasons(supabase, period),
    initialData: period === initialPeriod ? initialRows : undefined,
    enabled: canView,
  });

  if (!canView) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border bg-card p-8 text-center">
          <div className="rounded-full bg-muted p-4">
            <Lock className="size-8 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold">{t("noPermission.title")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("noPermission.description")}
          </p>
        </div>
      </div>
    );
  }

  // Tên hiển thị chốt TRƯỚC khi dùng: lý do cài sẵn hiện theo ngôn ngữ đang
  // xem; sắp xếp (giảm dần theo kỳ đang xem) đã do RPC làm.
  const rows = (report.data ?? []).map((r) => ({
    ...r,
    reason_name: r.reason_id
      ? (seedReasonNames?.[r.reason_id] ?? r.reason_name)
      : r.reason_name,
  }));
  const total = rows.reduce((s, r) => s + Number(r.cnt), 0);
  const prevTotal = rows.reduce((s, r) => s + Number(r.prev_cnt), 0);
  // "Tất cả" không có kỳ trước; kỳ trước 0 deal thì không có gì để so
  const hasTrend = period !== "all" && prevTotal > 0;
  const topReason = rows.find((r) => Number(r.cnt) > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <h1 className="mr-auto min-w-0 truncate text-sm font-semibold">
          {t("title")}
        </h1>
        <div className="flex flex-wrap items-center gap-1">
          {LOST_PERIODS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "secondary" : "ghost"}
              onClick={() => setPeriod(p === DEFAULT_PERIOD ? null : p)}
            >
              {t(`period.${p}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Từ xl mới nới: bảng báo cáo nhiều cột số, trên màn 1440px khoá 896px
            thì cột bị bóp trong khi hai bên bỏ trống. Ba màn dùng chung thanh
            ReportNav này phải cùng một mốc — lệch nhau thì bấm qua lại giữa
            chúng thấy khung nhảy. Dưới xl giữ nguyên. */}
        <div className="mx-auto w-full max-w-4xl space-y-4 p-4 xl:max-w-6xl 2xl:max-w-[1600px]">
          <ReportNav />

          {report.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : report.isError ? (
            <div className="rounded-lg border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">{t("error")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => report.refetch()}
              >
                {t("retry")}
              </Button>
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
              <TileChart className="size-16" />
              <h2 className="text-base font-semibold">{t("empty.title")}</h2>
              <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                {t("empty.description")}
              </p>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border bg-card p-4">
              <p className="text-[13px] text-muted-foreground">
                {hasTrend
                  ? t("summaryWithPrev", { total, prevTotal })
                  : t("summary", { total })}
              </p>

              <ul className="space-y-3">
                {rows
                  .filter((r) => Number(r.cnt) > 0)
                  .map((r) => {
                    const cnt = Number(r.cnt);
                    const share = Math.round((cnt / total) * 100);
                    // Xu hướng so TỶ TRỌNG (điểm %) chứ không so số tuyệt đối:
                    // kỳ đang xem có thể chưa trọn tháng, so đếm thô sẽ lệch.
                    const prevShare = hasTrend
                      ? Math.round((Number(r.prev_cnt) / prevTotal) * 100)
                      : null;
                    const delta = prevShare === null ? null : share - prevShare;
                    const isTop = r === topReason;
                    return (
                      <li key={r.reason_id ?? "none"}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p
                            className={cn(
                              "min-w-0 truncate text-sm font-medium",
                              !r.reason_name && "text-muted-foreground",
                            )}
                          >
                            {r.reason_name ?? t("unknownReason")}
                          </p>
                          <p className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums">
                            <span className="text-muted-foreground">
                              {t("dealCount", { count: cnt })}
                            </span>
                            <span className="font-semibold">{share}%</span>
                            {/* Lý do thua PHÌNH RA là xấu (đỏ ↑), co lại là
                                tốt (xanh ↓); đổi dưới 2 điểm coi như đi ngang */}
                            {delta !== null &&
                              (delta >= 2 ? (
                                <span
                                  className="inline-flex items-center text-destructive"
                                  title={t("trend.up", { points: delta })}
                                >
                                  <ArrowUp className="size-3.5" />
                                  <span className="text-xs">{delta}</span>
                                </span>
                              ) : delta <= -2 ? (
                                <span
                                  className="inline-flex items-center text-emerald-600 dark:text-emerald-400"
                                  title={t("trend.down", { points: -delta })}
                                >
                                  <ArrowDown className="size-3.5" />
                                  <span className="text-xs">{-delta}</span>
                                </span>
                              ) : (
                                <span
                                  className="text-xs text-muted-foreground"
                                  title={t("trend.flat")}
                                >
                                  →
                                </span>
                              ))}
                          </p>
                        </div>
                        {/* Thanh ngang = tỷ trọng trên tổng deal thua trong kỳ */}
                        <div
                          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                          role="presentation"
                        >
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                        {/* Lý do đứng đầu kèm 1 dòng gợi ý hành động tĩnh */}
                        {isTop && (
                          <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-muted-foreground">
                            <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
                            <span>
                              {t(
                                `suggestion.${
                                  r.reason_id
                                    ? suggestionKey(seedReasonKeys?.[r.reason_id])
                                    : "unknown"
                                }`,
                              )}
                            </span>
                          </p>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("footnote.definitions")}
            {period !== "all" && ` ${t(`footnote.prev.${period}`)}`}
          </p>
        </div>
      </div>
    </div>
  );
}
