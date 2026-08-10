"use client";

import { useMemo } from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { TileChart } from "@/components/illustrations/tile-chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import {
  ATTRIBUTION_MODELS,
  DEFAULT_RANGE,
  RANGE_PRESETS,
  fetchSourceReport,
  pickModel,
  type AttributionModel,
  type RangePreset,
  type SourceReportRow,
} from "./types";

/**
 * "Nguồn nào ra tiền" — bảng + thanh ngang dựng bằng token (KHÔNG thư viện biểu
 * đồ; danh sách thư viện cấm ở eslint.config.mjs giữ codebase gọn).
 * Khoảng thời gian nằm trên URL (?r=) để chia sẻ được; đổi mô hình quy kết là
 * tức thì vì RPC trả sẵn cả 3 mô hình trong một lượt.
 */
export function SourcesView({
  canView,
  initialRange,
  initialRows,
  seedSourceNames,
}: {
  canView: boolean;
  initialRange: RangePreset;
  initialRows?: SourceReportRow[];
  /** id nguồn → tên hiển thị (nguồn cài sẵn đã dịch, migration #36). */
  seedSourceNames?: Record<string, string>;
}) {
  const t = useTranslations("reports.sources");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);

  const [range, setRange] = useQueryState(
    "r",
    parseAsStringLiteral(RANGE_PRESETS).withDefault(initialRange),
  );
  const [model, setModel] = useQueryState(
    "m",
    parseAsStringLiteral(ATTRIBUTION_MODELS).withDefault("first"),
  );

  const report = useQuery({
    queryKey: ["source-report", range],
    queryFn: () => fetchSourceReport(supabase, range),
    initialData: range === initialRange ? initialRows : undefined,
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

  // Tên hiển thị chốt TRƯỚC khi sắp xếp: bản tiếng Anh phải xếp theo tên tiếng
  // Anh, không theo tên tiếng Việt đã lưu trong CSDL.
  const rows = (report.data ?? [])
    .map((r) => ({
      ...r,
      source_name: r.source_id
        ? (seedSourceNames?.[r.source_id] ?? r.source_name)
        : r.source_name,
    }))
    .sort(
      (a, b) =>
        pickModel(b, model).revenue - pickModel(a, model).revenue ||
        Number(b.new_contacts) - Number(a.new_contacts) ||
        (a.source_name ?? "").localeCompare(b.source_name ?? ""),
    );
  const maxRevenue = Math.max(1, ...rows.map((r) => pickModel(r, model).revenue));
  const totals = rows.reduce(
    (acc, r) => {
      const m = pickModel(r, model);
      return {
        newContacts: acc.newContacts + Number(r.new_contacts),
        deals: acc.deals + m.deals,
        revenue: acc.revenue + m.revenue,
      };
    },
    { newContacts: 0, deals: 0, revenue: 0 },
  );
  const hasRevenue = totals.revenue > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <h1 className="mr-auto min-w-0 truncate text-sm font-semibold">
          {t("title")}
        </h1>
        <div className="flex flex-wrap items-center gap-1">
          {RANGE_PRESETS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={range === p ? "secondary" : "ghost"}
              onClick={() => setRange(p === DEFAULT_RANGE ? null : p)}
            >
              {t(`range.${p}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
          <div className="space-y-2">
            <Tabs
              value={model}
              onValueChange={(v) =>
                setModel(v === "first" ? null : (v as AttributionModel))
              }
            >
              <TabsList>
                {ATTRIBUTION_MODELS.map((m) => (
                  <TabsTrigger key={m} value={m}>
                    {t(`model.${m}.label`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="text-[13px] text-muted-foreground">
              {t(`model.${model}.explain`)}
            </p>
          </div>

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
          ) : !hasRevenue && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
              <TileChart className="size-16" />
              <h2 className="text-base font-semibold">{t("empty.title")}</h2>
              <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                {t("empty.description")}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              {!hasRevenue && (
                <p className="border-b bg-muted/40 px-4 py-2.5 text-[13px] text-muted-foreground">
                  {t("empty.title")}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="h-10 border-b">
                      <th className="px-4 font-medium">{t("table.source")}</th>
                      <th className="hidden px-4 text-right font-medium sm:table-cell">
                        {t("table.newContacts")}
                      </th>
                      <th className="hidden px-4 text-right font-medium sm:table-cell">
                        {t("table.wonDeals")}
                      </th>
                      <th className="hidden px-4 text-right font-medium md:table-cell">
                        {t("table.closeRate")}
                      </th>
                      <th className="px-4 text-right font-medium">
                        {t("table.revenue")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const m = pickModel(r, model);
                      const newContacts = Number(r.new_contacts);
                      const rate =
                        newContacts > 0
                          ? Math.round((m.deals / newContacts) * 100)
                          : null;
                      // "0 khách mới mà vẫn ra tiền" trông như phần mềm tính
                      // sai; nói ngay tại dòng rằng tiền đến từ khách có trước
                      // khoảng đang xem, thay vì bắt đọc ghi chú cuối trang.
                      const fromOlderContacts =
                        rate === null && (m.deals > 0 || m.revenue > 0);
                      return (
                        <tr key={r.source_id ?? "none"} className="border-b last:border-b-0">
                          <td className="px-4 py-2.5">
                            <p
                              className={cn(
                                "truncate font-medium",
                                !r.source_name && "text-muted-foreground",
                              )}
                            >
                              {r.source_name ?? t("table.unknownSource")}
                            </p>
                            {/* Thanh ngang dựng bằng token — tỉ lệ so với nguồn cao nhất */}
                            <div
                              className="mt-1.5 h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-muted"
                              role="presentation"
                            >
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{
                                  width: `${Math.round((m.revenue / maxRevenue) * 100)}%`,
                                }}
                              />
                            </div>
                            {/* 375px: gộp 3 cột ẩn vào 1 dòng phụ để không mất số liệu */}
                            <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                              {fromOlderContacts
                                ? t("table.mobileSummaryOlderContacts", {
                                    contacts: newContacts,
                                    deals: m.deals,
                                  })
                                : t("table.mobileSummary", {
                                    contacts: newContacts,
                                    deals: m.deals,
                                    rate: rate === null ? "—" : `${rate}%`,
                                  })}
                            </p>
                          </td>
                          <td className="hidden px-4 text-right tabular-nums sm:table-cell">
                            {newContacts}
                          </td>
                          <td className="hidden px-4 text-right tabular-nums sm:table-cell">
                            {m.deals}
                          </td>
                          <td className="hidden px-4 text-right tabular-nums md:table-cell">
                            {rate !== null ? (
                              `${rate}%`
                            ) : fromOlderContacts ? (
                              <span className="text-xs text-muted-foreground">
                                {t("table.revenueFromOlderContacts")}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 text-right font-medium tabular-nums whitespace-nowrap">
                            {formatMoney(m.revenue, locale)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="h-11 border-t bg-muted/40 text-[13px] font-semibold">
                      <td className="px-4">{t("table.total")}</td>
                      <td className="hidden px-4 text-right tabular-nums sm:table-cell">
                        {totals.newContacts}
                      </td>
                      <td className="hidden px-4 text-right tabular-nums sm:table-cell">
                        {totals.deals}
                      </td>
                      <td className="hidden px-4 md:table-cell" />
                      <td className="px-4 text-right tabular-nums whitespace-nowrap">
                        {formatMoney(totals.revenue, locale)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("footnote.definitions")}
            {model === "linear" && ` ${t("footnote.linearDeals")}`}
          </p>
        </div>
      </div>
    </div>
  );
}
