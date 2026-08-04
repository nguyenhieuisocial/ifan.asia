import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale, Translator } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { SourceReportRow } from "./reports/sources/types";
import {
  revenueDayCount,
  type DashboardSales,
  type RangePreset,
  type StaffRow,
  type Trend,
} from "./dashboard-range";

/**
 * Các khối của màn Tổng quan (đợt 1 lõi): so kỳ trước, doanh thu theo ngày,
 * phân bổ nguồn, hiệu suất nhân viên. Server component — không JS phía client.
 * Biểu đồ dựng bằng token, KHÔNG dùng thư viện (theo tiền lệ báo cáo nguồn).
 */

/** Khung card dùng chung. */
export function Panel({
  title,
  caption,
  action,
  children,
}: {
  title: string;
  caption?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {caption ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Dòng "tăng/giảm X% so kỳ trước" — nói thành chữ, không chỉ mũi tên. */
export function TrendLine({ trend, t }: { trend: Trend; t: Translator }) {
  if (trend.kind === "none") {
    return <p className="mt-1 text-xs text-muted-foreground">{t("trend.none")}</p>;
  }
  if (trend.kind === "fresh") {
    return <p className="mt-1 text-xs text-muted-foreground">{t("trend.fresh")}</p>;
  }
  if (trend.kind === "flat") {
    return <p className="mt-1 text-xs text-muted-foreground">{t("trend.flat")}</p>;
  }
  const up = trend.kind === "up";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1 text-xs font-medium",
        // token xanh sẵn có của hệ (dùng cho trạng thái "đã chốt") — có cả bản tối
        up ? "text-status-closed-foreground" : "text-destructive",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {t(up ? "trend.up" : "trend.down", { percent: trend.percent })}
    </p>
  );
}

/**
 * Doanh thu theo ngày (giờ VN). Chỉ vẽ khi có ÍT NHẤT 2 ngày có tiền — một cột
 * đơn độc không phải biểu đồ, và cột rỗng thì không nói lên điều gì.
 */
export function RevenueChart({
  days,
  daily,
  locale,
  t,
}: {
  days: string[];
  daily: DashboardSales["daily"];
  locale: Locale;
  t: Translator;
}) {
  const byDay = new Map(daily.map((d) => [d.day, Number(d.revenue)]));
  const filled = revenueDayCount(days, daily);
  if (filled < 2) return null;
  const max = Math.max(...days.map((d) => byDay.get(d) ?? 0));
  const total = daily.reduce((a, d) => a + Number(d.revenue), 0);
  const best = daily.reduce((a, d) => (Number(d.revenue) > Number(a.revenue) ? d : a));

  return (
    <Panel
      title={t("chart.title")}
      caption={t("chart.caption", {
        day: formatDate(`${best.day}T00:00:00+07:00`, locale),
        money: formatMoney(Number(best.revenue), locale),
      })}
    >
      <div
        className="flex h-28 items-end gap-px"
        role="img"
        aria-label={t("chart.aria", {
          days: filled,
          money: formatMoney(total, locale),
        })}
      >
        {days.map((d) => {
          const v = byDay.get(d) ?? 0;
          const pct = v > 0 ? Math.max(6, Math.round((v / max) * 100)) : 0;
          return (
            <div key={d} className="flex h-full flex-1 items-end">
              {v > 0 ? (
                <div
                  className="w-full rounded-t-sm bg-primary"
                  style={{ height: `${pct}%` }}
                />
              ) : (
                <div className="h-0.5 w-full rounded-full bg-muted" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{formatDate(`${days[0]}T00:00:00+07:00`, locale)}</span>
        <span>{formatDate(`${days[days.length - 1]}T00:00:00+07:00`, locale)}</span>
      </div>
    </Panel>
  );
}

/**
 * Phân bổ nguồn — số lấy NGUYÊN từ RPC source_revenue_report (migration #16),
 * mô hình chạm-đầu, đúng như màn "Nguồn nào ra tiền" để hai màn không lệch.
 */
export function SourcePanel({
  rows,
  range,
  canOpenReport,
  locale,
  t,
}: {
  rows: SourceReportRow[];
  range: RangePreset;
  canOpenReport: boolean;
  locale: Locale;
  t: Translator;
}) {
  // Chỉ nêu nguồn THỰC SỰ ra tiền — nguồn 0đ chỉ làm loãng màn hình; ai cần đủ
  // danh sách thì bấm sang báo cáo đầy đủ.
  const sorted = [...rows]
    .map((r) => ({
      key: r.source_id ?? "none",
      name: r.source_name,
      revenue: Number(r.revenue_first),
    }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const total = rows.reduce((a, r) => a + Number(r.revenue_first), 0);

  return (
    <Panel
      title={t("sources.title")}
      caption={t("sources.caption")}
      action={
        canOpenReport ? (
          <Link
            href={`/app/reports/sources?r=${range}`}
            className="group flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {t("sources.openReport")}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : null
      }
    >
      {total === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">{t("sources.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((s) => (
            <li key={s.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "min-w-0 truncate text-[13px] font-medium",
                    !s.name && "text-muted-foreground",
                  )}
                >
                  {s.name ?? t("sources.unknown")}
                </span>
                <span className="shrink-0 text-[13px] font-medium tabular-nums whitespace-nowrap">
                  {formatMoney(s.revenue, locale)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((s.revenue / total) * 100)}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {Math.round((s.revenue / total) * 100)}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Hiệu suất nhân viên. Với vai staff, RPC chỉ trả về chính họ (RLS) → đổi tiêu
 * đề thành "Kết quả của tôi" cho khỏi hiểu nhầm là cả tiệm chỉ có 1 người.
 */
export function StaffPanel({
  rows,
  selfOnly,
  locale,
  t,
}: {
  rows: StaffRow[];
  selfOnly: boolean;
  locale: Locale;
  t: Translator;
}) {
  return (
    <Panel
      title={selfOnly ? t("staff.titleSelf") : t("staff.title")}
      caption={selfOnly ? t("staff.captionSelf") : t("staff.caption")}
    >
      {rows.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">{t("staff.empty")}</p>
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-0 text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="h-8 border-b">
                <th className="px-4 font-medium">{t("staff.person")}</th>
                <th className="hidden px-3 text-right font-medium sm:table-cell">
                  {t("staff.won")}
                </th>
                <th className="hidden px-3 text-right font-medium md:table-cell">
                  {t("staff.openDeals")}
                </th>
                <th className="px-4 text-right font-medium">{t("staff.revenue")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.user_id} className="border-b last:border-b-0">
                  <td className="px-4 py-2">
                    <p className="truncate font-medium">
                      {s.display_name ?? t("staff.unnamed")}
                    </p>
                    {/* 375px: gộp 2 cột ẩn vào 1 dòng phụ để không mất số liệu */}
                    <p className="text-xs text-muted-foreground sm:hidden">
                      {t("staff.mobileSummary", {
                        won: Number(s.deals_won),
                        open: Number(s.deals_open),
                      })}
                    </p>
                  </td>
                  <td className="hidden px-3 text-right tabular-nums sm:table-cell">
                    {Number(s.deals_won)}
                  </td>
                  <td className="hidden px-3 text-right tabular-nums md:table-cell">
                    {Number(s.deals_open)}
                  </td>
                  <td className="px-4 text-right font-medium tabular-nums whitespace-nowrap">
                    {formatMoney(Number(s.revenue), locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
