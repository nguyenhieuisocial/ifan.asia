import { getLocale, getTranslations } from "next-intl/server";
import { Activity, CircleDollarSign, ShieldCheck, Store, Timer, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { acknowledgeSystemAlert } from "./actions";
import { OpenInvoicesSection } from "./open-invoices";
import {
  healthOf,
  type OpenInvoiceRow,
  type PlatformOverview,
  type SystemAlertRow,
  type TenantHealthRow,
} from "./types";

export const dynamic = "force-dynamic";

const HEALTH_STYLE = {
  healthy: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  idle: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  dormant: "bg-destructive/10 text-destructive",
} as const;

const STATUS_STYLE: Record<string, string> = {
  trialing: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  past_due: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  suspended: "bg-destructive/10 text-destructive",
  none: "bg-muted text-muted-foreground",
};

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Store;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Bảng điều hành nền tảng (chỉ founder) — MRR, sức khỏe tiệm, thời gian tới
 * lần dùng thật đầu tiên.
 *
 * Dữ liệu lấy qua 2 RPC security definer có kiểm quyền ở dòng đầu; layout đã
 * chặn 404 trước đó. Cố ý CHỈ có số tổng hợp: không tên khách, không tin nhắn,
 * không đơn hàng — dữ liệu riêng tư của khách hàng từng tiệm không đi qua đây.
 */
export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const [
    { data: overviewRaw },
    { data: tenantsRaw },
    { data: alertsRaw },
    { data: invoicesRaw },
  ] = await Promise.all([
    supabase.rpc("admin_platform_overview"),
    supabase.rpc("admin_tenant_health", { p_limit: 100 }),
    supabase
      .from("system_alerts")
      .select("id, job_name, first_failed_at, last_failed_at, fail_count, detail")
      .is("acknowledged_at", null)
      .order("last_failed_at", { ascending: false }),
    supabase.rpc("admin_open_invoices"),
  ]);

  const t = await getTranslations("admin");
  const locale = (await getLocale()) as Locale;
  const overview = overviewRaw as PlatformOverview | null;
  const tenants = (tenantsRaw as TenantHealthRow[] | null) ?? [];
  const alerts = (alertsRaw as SystemAlertRow[] | null) ?? [];
  const openInvoices = (invoicesRaw as OpenInvoiceRow[] | null) ?? [];

  if (!overview) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl p-6">
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-[15px] font-semibold">{t("empty.title")}</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {t("empty.description")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { tenants: c, health, ttv } = overview;
  // Trung vị TTV: dưới 2 ngày nói bằng giờ cho dễ hình dung, dài hơn thì nói bằng ngày.
  const ttvText =
    ttv.activated === 0
      ? t("ttv.none")
      : ttv.median_hours < 48
        ? t("ttv.hours", { n: Math.round(ttv.median_hours) })
        : t("ttv.days", { n: Math.round(ttv.median_hours / 24) });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("description", {
              time: formatDateTime(overview.generated_at, locale),
            })}
          </p>
        </div>

        {/* ---- Chuông báo job nền (migration #44): hỏng là hiện ĐẦU TRANG ---- */}
        {alerts.length === 0 ? (
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <ShieldCheck aria-hidden className="size-3.5 text-status-closed-foreground" />
            {t("jobs.clean")}
          </p>
        ) : (
          <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-destructive">
              <TriangleAlert aria-hidden className="size-4" />
              {t("jobs.title", { n: alerts.length })}
            </h2>
            <ul className="mt-3 space-y-2">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border bg-background px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">{a.job_name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("jobs.failLine", {
                        n: a.fail_count,
                        date: formatDateTime(a.last_failed_at, locale),
                      })}
                    </p>
                    {/* Thông điệp lỗi thô từ Postgres — hữu ích cho người kỹ thuật, cắt sẵn 500 ký tự từ DB */}
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {a.detail}
                    </p>
                  </div>
                  <form action={acknowledgeSystemAlert.bind(null, a.id)}>
                    <button
                      type="submit"
                      className="rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                    >
                      {t("jobs.ack")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- Hóa đơn chờ thu (migration #48): tiền về là bấm "Đã nhận tiền" ---- */}
        <OpenInvoicesSection invoices={openInvoices} />

        {/* ---- 4 con số quan trọng nhất ---- */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={CircleDollarSign}
            label={t("kpi.mrr")}
            value={formatMoney(overview.mrr, locale)}
            hint={t("kpi.mrrHint", { amount: formatMoney(overview.arr, locale) })}
          />
          <Kpi
            icon={Store}
            label={t("kpi.tenants")}
            value={String(c.total)}
            hint={t("kpi.tenantsHint", { n: c.signups_30d })}
          />
          <Kpi
            icon={Activity}
            label={t("kpi.healthy")}
            value={`${health.healthy}/${c.total}`}
            hint={t("kpi.healthyHint", { idle: health.idle, dormant: health.dormant })}
          />
          <Kpi
            icon={Timer}
            label={t("kpi.ttv")}
            value={ttvText}
            hint={t("kpi.ttvHint", { activated: ttv.activated, total: ttv.total })}
          />
        </div>

        {/* ---- Tiệm theo trạng thái gói ---- */}
        <section className="rounded-lg border p-4">
          <h2 className="text-[14px] font-semibold">{t("status.title")}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["trialing", c.trialing],
                ["activePaid", c.active_paid],
                ["activeFree", c.active_free],
                ["pastDue", c.past_due],
                ["suspended", c.suspended],
                ["noSubscription", c.no_subscription],
              ] as const
            ).map(([key, n]) => (
              <li
                key={key}
                className="flex items-baseline justify-between gap-3 rounded-md border px-3 py-2"
              >
                <span className="text-[13px] text-muted-foreground">
                  {t(`status.${key}`)}
                </span>
                <span className="text-[15px] font-semibold tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Danh sách tiệm ---- */}
        <section className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h2 className="text-[14px] font-semibold">{t("table.title")}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {t("table.privacyNote")}
            </p>
          </div>
          {/* Bảng tự cuộn ngang trong khung của nó — trang không bao giờ tràn ngang */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("table.shop")}</th>
                  <th className="px-4 py-2 font-medium">{t("table.plan")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("table.mrr")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("table.people")}</th>
                  <th className="px-4 py-2 font-medium">{t("table.health")}</th>
                  <th className="px-4 py-2 font-medium">{t("table.ttv")}</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((row) => {
                  const h = healthOf(row.days_inactive);
                  return (
                    <tr key={row.tenant_id} className="border-b last:border-0">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{row.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          @{row.slug} · {t("table.since", {
                            date: formatDateTime(row.created_at, locale),
                          })}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          className={cn(
                            "font-semibold",
                            STATUS_STYLE[row.status] ?? STATUS_STYLE.none,
                          )}
                        >
                          {t(`plans.${row.plan_code}`)}
                        </Badge>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t(`subStatus.${row.status}`)}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatMoney(row.mrr, locale)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {row.seat_limit === null
                          ? t("table.peopleUnlimited", { n: row.members })
                          : `${row.members}/${row.seat_limit}`}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge className={cn("font-semibold", HEALTH_STYLE[h])}>
                          {t(`health.${h}`)}
                        </Badge>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("table.lastActive", {
                            date: formatDateTime(row.last_active_at, locale),
                          })}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {row.ttv_hours === null
                          ? t("table.ttvNone")
                          : row.ttv_hours < 48
                            ? t("ttv.hours", { n: Math.round(row.ttv_hours) })
                            : t("ttv.days", { n: Math.round(row.ttv_hours / 24) })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
