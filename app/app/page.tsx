import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight,
  BadgePercent,
  Banknote,
  Clock,
  Flame,
  Handshake,
  MessageCircle,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { TileContact } from "@/components/illustrations/tile-contact";
import { TilePlug } from "@/components/illustrations/tile-plug";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { formatVN } from "@/lib/datetime";
import type { Locale, Translator } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { CHANNEL_LABELS } from "./inbox/types";
import { ScoreBadge } from "./contacts/score-badge";
import { IndustrySetupCard } from "./industry-setup-card";
import {
  DEFAULT_RANGE,
  RANGE_PRESETS,
  fetchDashboardSales,
  isRangePreset,
  renderInstant,
  revenueDayCount,
  trendOf,
  vnDaysOf,
  vnRange,
  winRate,
  type DashboardSales,
  type RangePreset,
} from "./dashboard-range";
import {
  Panel,
  RevenueChart,
  SourcePanel,
  StaffPanel,
  TrendLine,
} from "./dashboard-panels";
import { AutoRefresh } from "./dashboard-auto-refresh";
import type { SourceReportRow } from "./reports/sources/types";

export const dynamic = "force-dynamic";

/**
 * Màn Tổng quan — MỘT màn hình cho chủ tiệm (GĐ2 "Báo cáo đợt 1 lõi"):
 *   tiền kỳ này SO kỳ trước · KPI CRM · doanh thu theo ngày · nguồn nào ra tiền
 *   · hiệu suất nhân viên · việc cần làm ngay · bản tin tuần.
 *
 * Số liệu lấy trong 3 lượt gọi song song, tất cả SECURITY INVOKER nên RLS tự lo
 * phân quyền — NHÂN VIÊN THƯỜNG chỉ ra số của chính mình, không cần tầng web lọc:
 *   dashboard_overview()      — migration #11 (hội thoại/khách, dùng lại nguyên)
 *   dashboard_sales()         — migration #21 (tiền, so kỳ trước, nhân viên)
 *   source_revenue_report()   — migration #16 (nguồn — DÙNG LẠI đúng RPC của màn
 *                               "Nguồn nào ra tiền" để hai màn không lệch số)
 *
 * Bộ lọc thời gian nằm trên URL (?r=) — chia sẻ được, và dùng chung mốc giờ VN
 * với báo cáo nguồn (vnRange).
 */

type DigestPayload = {
  conversations_total: number;
  messages_in: number;
  messages_out: number;
  new_contacts: number;
  hot_contacts: number;
  unanswered_end_of_week: number;
};

type Overview = {
  open_conversations: number;
  unanswered: number;
  new_contacts_7d: number;
  hot_contacts: number;
  channels_count: number;
  contacts_count: number;
  need_reply: {
    id: string;
    name: string | null;
    channel_type: string;
    channel_name: string | null;
    waiting_since: string;
  }[];
  hot_followup: {
    id: string;
    full_name: string;
    lead_score: number;
    last_interaction_at: string | null;
  }[];
  digest: {
    week_start: string;
    payload: DigestPayload;
    created_at: string;
  } | null;
};

const DAY_MS = 86_400_000;
const MANAGER_ROLES = ["owner", "admin", "manager"];

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const rParam = typeof sp.r === "string" ? sp.r : "";
  const range: RangePreset = isRangePreset(rParam) ? rParam : DEFAULT_RANGE;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, industry")
    .maybeSingle();
  if (!tenant) redirect("/onboarding");

  const { data: me } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const isManager = MANAGER_ROLES.includes(me?.role ?? "");

  // Card "Chọn ngành" (Tiệm mẫu, migration #12): chỉ khi tenant CHƯA chọn
  // ngành và user là owner/admin — staff không có quyền seed.
  const showIndustrySetup =
    tenant.industry === null && (me?.role === "owner" || me?.role === "admin");

  const now = renderInstant();
  const { from, to } = vnRange(range, now);
  const [locale, t, tOv, tTime, rpcRes, salesRes, sourceRes] = await Promise.all([
    getLocale() as Promise<Locale>,
    getTranslations("dashboard"),
    getTranslations("overview"),
    getTranslations("time"),
    supabase.rpc("dashboard_overview"),
    fetchDashboardSales(supabase, range, now),
    supabase.rpc("source_revenue_report", { p_from: from, p_to: to }),
  ]);
  if (rpcRes.error) throw new Error(rpcRes.error.message);
  if (sourceRes.error) throw new Error(sourceRes.error.message);
  const ov = rpcRes.data as Overview;
  const sales = salesRes as DashboardSales;
  const sources = (sourceRes.data ?? []) as SourceReportRow[];

  // Tenant mới toanh (chưa kênh, chưa khách) → hướng dẫn ấm thay 2 danh sách
  const isBrandNew = ov.channels_count === 0 && ov.contacts_count === 0;

  const rateNow = winRate(sales.deals_won.current, sales.deals_lost.current);
  const ratePrev = winRate(sales.deals_won.previous, sales.deals_lost.previous);
  const chartDays = vnDaysOf(range, now);
  const showChart = revenueDayCount(chartDays, sales.daily) >= 2;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AutoRefresh seconds={60} />
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <nav
              aria-label={tOv("range.label")}
              className="flex flex-wrap items-center gap-1"
            >
              {RANGE_PRESETS.map((p) => (
                <Link
                  key={p}
                  href={p === DEFAULT_RANGE ? "/app" : `/app?r=${p}`}
                  aria-current={range === p ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    range === p
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.04]",
                  )}
                >
                  {tOv(`range.${p}`)}
                </Link>
              ))}
            </nav>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {tOv(`compare.${range}`)} ·{" "}
            {tOv("updatedAt", { time: formatVN(now, "HH:mm") })}
          </p>
        </header>

        {showIndustrySetup && <IndustrySetupCard />}

        {/* ---------- Hàng 1: TIỀN, có so kỳ trước ---------- */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label={tOv("money.revenue")}
            value={formatMoney(Number(sales.revenue.current), locale)}
            icon={Banknote}
            trend={<TrendLine trend={trendOf(sales.revenue)} t={tOv} />}
          />
          <StatTile
            label={tOv("money.wonDeals")}
            value={String(Number(sales.deals_won.current))}
            icon={Handshake}
            trend={<TrendLine trend={trendOf(sales.deals_won)} t={tOv} />}
          />
          <StatTile
            label={tOv("money.winRate")}
            value={rateNow === null ? "—" : `${rateNow}%`}
            icon={BadgePercent}
            trend={
              <p className="mt-1 text-xs text-muted-foreground">
                {ratePrev === null
                  ? tOv("money.prevRateNone")
                  : tOv("money.prevRate", { rate: ratePrev })}
              </p>
            }
          />
          <StatTile
            label={tOv("money.newContacts")}
            value={String(Number(sales.new_contacts.current))}
            icon={UserPlus}
            trend={<TrendLine trend={trendOf(sales.new_contacts)} t={tOv} />}
          />
        </section>

        {/* ---------- Hàng 2: KPI hội thoại/khách (RPC #11 giữ nguyên) ---------- */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label={t("tiles.open")}
            value={String(ov.open_conversations)}
            icon={MessageCircle}
          />
          <StatTile
            label={t("tiles.unanswered")}
            value={String(ov.unanswered)}
            icon={Clock}
            valueClass={ov.unanswered > 0 ? "text-destructive" : undefined}
          />
          <StatTile
            label={t("tiles.new7d")}
            value={String(ov.new_contacts_7d)}
            icon={UserPlus}
          />
          <StatTile
            label={t("tiles.hot")}
            value={String(ov.hot_contacts)}
            icon={Flame}
            // Cùng màu band Nóng với score-badge (SCORE_BADGE.hot)
            iconClass="text-destructive"
          />
        </section>

        {/* ---------- Hàng 3: doanh thu theo ngày + nguồn ---------- */}
        {/* Không đủ ngày có tiền để vẽ biểu đồ → nguồn chiếm trọn hàng, không
            để lại ô trống vô nghĩa. */}
        <section className={cn("grid gap-4", showChart && "md:grid-cols-2")}>
          <RevenueChart days={chartDays} daily={sales.daily} locale={locale} t={tOv} />
          <SourcePanel
            rows={sources}
            range={range}
            canOpenReport={isManager}
            locale={locale}
            t={tOv}
          />
        </section>

        {/* ---------- Hàng 4: hiệu suất nhân viên + tiền đang thương lượng ---------- */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <StaffPanel
              rows={sales.staff}
              selfOnly={!isManager}
              locale={locale}
              t={tOv}
            />
          </div>
          <Panel title={tOv("pipeline.title")} caption={tOv("pipeline.caption")}>
            <p className="text-xl font-semibold tabular-nums">
              {formatMoney(Number(sales.open_deals.value), locale)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {tOv("pipeline.count", { count: Number(sales.open_deals.count) })}
            </p>
            <Link
              href="/app/deals"
              className="group mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {tOv("pipeline.open")}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Panel>
        </section>

        {isBrandNew ? (
          <GettingStarted t={t} />
        ) : (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t("needAction.title")}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <ListCard title={t("needReply.title")}>
                {ov.need_reply.length === 0 ? (
                  <EmptyLine text={t("needReply.empty")} />
                ) : (
                  ov.need_reply.map((r) => (
                    <Link
                      key={r.id}
                      href={`/app/inbox?c=${r.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-foreground/[0.04]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">
                          {r.name ?? t("lists.guest")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {CHANNEL_LABELS[r.channel_type] ?? r.channel_type}
                          {r.channel_name ? ` · ${r.channel_name}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatRelative(r.waiting_since, locale, tTime)}
                      </span>
                    </Link>
                  ))
                )}
              </ListCard>
              <ListCard title={t("hotList.title")}>
                {ov.hot_followup.length === 0 ? (
                  <EmptyLine text={t("hotList.empty")} />
                ) : (
                  ov.hot_followup.map((c) => (
                    <Link
                      key={c.id}
                      href={`/app/contacts/${c.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-foreground/[0.04]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">
                          {c.full_name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.last_interaction_at
                            ? t("hotList.lastTouch", {
                                time: formatRelative(
                                  c.last_interaction_at,
                                  locale,
                                  tTime,
                                ),
                              })
                            : t("hotList.neverTouched")}
                        </p>
                      </div>
                      <ScoreBadge score={c.lead_score} className="shrink-0" />
                    </Link>
                  ))
                )}
              </ListCard>
            </div>
          </section>
        )}

        <DigestCard t={t} locale={locale} digest={ov.digest} />
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  iconClass,
  valueClass,
  trend,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClass?: string;
  valueClass?: string;
  trend?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] font-medium text-muted-foreground">
          {label}
        </p>
        <Icon className={cn("size-4 shrink-0 text-muted-foreground", iconClass)} />
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums break-words",
          valueClass,
        )}
      >
        {value}
      </p>
      {trend}
    </div>
  );
}

function ListCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-[13px] font-medium text-muted-foreground">{title}</h3>
      <div className="mt-2 flex flex-col">{children}</div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="py-2 text-[13px] text-muted-foreground">{text}</p>;
}

/** Hướng dẫn tenant mới: 2 lối vào + dòng "Được gì:" (mẫu Phụ lục C luật thiết kế). */
function GettingStarted({ t }: { t: Translator }) {
  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="text-sm font-semibold">{t("empty.title")}</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {t("empty.description")}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <GettingStartedLink
          href="/app/settings/channels"
          tile={<TilePlug className="size-8 shrink-0" />}
          title={t("empty.connectTitle")}
          benefit={t("empty.connectBenefit")}
        />
        <GettingStartedLink
          href="/app/contacts"
          tile={<TileContact className="size-8 shrink-0" />}
          title={t("empty.addContactTitle")}
          benefit={t("empty.addContactBenefit")}
        />
      </div>
    </section>
  );
}

function GettingStartedLink({
  href,
  tile,
  title,
  benefit,
}: {
  href: string;
  tile: React.ReactNode;
  title: string;
  benefit: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-primary-tint"
    >
      <p className="flex items-center gap-2.5 text-[13px] font-semibold">
        {tile}
        {title}
        <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{benefit}</p>
    </Link>
  );
}

function DigestCard({
  t,
  locale,
  digest,
}: {
  t: Translator;
  locale: Locale;
  digest: Overview["digest"];
}) {
  const items: { key: string; value: number }[] | null = digest
    ? [
        { key: "conversations", value: digest.payload.conversations_total },
        { key: "messagesIn", value: digest.payload.messages_in },
        { key: "messagesOut", value: digest.payload.messages_out },
        { key: "newContacts", value: digest.payload.new_contacts },
        { key: "hotContacts", value: digest.payload.hot_contacts },
        { key: "unanswered", value: digest.payload.unanswered_end_of_week },
      ]
    : null;
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("digest.title")}</h2>
        {digest ? (
          <span className="text-xs text-muted-foreground">
            {t("digest.week", {
              from: formatDate(digest.week_start, locale),
              to: formatDate(
                new Date(digest.week_start).getTime() + 6 * DAY_MS,
                locale,
              ),
            })}
          </span>
        ) : null}
      </div>
      {items ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {items.map(({ key, value }) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">
                {t(`digest.${key}`)}
              </dt>
              <dd className="mt-0.5 text-base font-semibold tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <EmptyLine text={t("digest.empty")} />
      )}
      {/* Nhắc nhẹ: lớp nhận xét AI của bản tin sẽ bật sau, không chặn đợt 0 */}
      <p className="mt-3 text-xs text-muted-foreground/70">{t("digest.aiSoon")}</p>
    </section>
  );
}
