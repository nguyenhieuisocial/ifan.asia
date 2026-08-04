import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Clock,
  Flame,
  MessageCircle,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { TileContact } from "@/components/illustrations/tile-contact";
import { TilePlug } from "@/components/illustrations/tile-plug";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRelative } from "@/lib/format";
import type { Locale, Translator } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { CHANNEL_LABELS } from "./inbox/types";
import { ScoreBadge } from "./contacts/score-badge";
import { IndustrySetupCard } from "./industry-setup-card";

export const dynamic = "force-dynamic";

/**
 * Màn Tổng quan đợt 0 (thuần rule-based, không AI): 4 ô số liệu + "Cần làm
 * ngay" + card Bản tin tuần. Toàn bộ số lấy 1 lần qua RPC dashboard_overview()
 * (SECURITY INVOKER — RLS khoanh tenant, migration #11).
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

export default async function OverviewPage() {
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

  // Card "Chọn ngành" (Tiệm mẫu, migration #12): chỉ khi tenant CHƯA chọn
  // ngành và user là owner/admin — staff không có quyền seed.
  let showIndustrySetup = false;
  if (tenant.industry === null) {
    const { data: me } = await supabase
      .from("tenant_members")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    showIndustrySetup = me?.role === "owner" || me?.role === "admin";
  }

  const [locale, t, tTime, rpcRes] = await Promise.all([
    getLocale() as Promise<Locale>,
    getTranslations("dashboard"),
    getTranslations("time"),
    supabase.rpc("dashboard_overview"),
  ]);
  if (rpcRes.error) throw new Error(rpcRes.error.message);
  const ov = rpcRes.data as Overview;

  // Tenant mới toanh (chưa kênh, chưa khách) → hướng dẫn ấm thay 2 danh sách
  const isBrandNew = ov.channels_count === 0 && ov.contacts_count === 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
        <h1 className="text-lg font-semibold">{t("title")}</h1>

        {showIndustrySetup && <IndustrySetupCard />}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label={t("tiles.open")}
            value={ov.open_conversations}
            icon={MessageCircle}
          />
          <StatTile
            label={t("tiles.unanswered")}
            value={ov.unanswered}
            icon={Clock}
            valueClass={ov.unanswered > 0 ? "text-destructive" : undefined}
          />
          <StatTile
            label={t("tiles.new7d")}
            value={ov.new_contacts_7d}
            icon={UserPlus}
          />
          <StatTile
            label={t("tiles.hot")}
            value={ov.hot_contacts}
            icon={Flame}
            // Cùng màu band Nóng với score-badge (SCORE_BADGE.hot)
            iconClass="text-destructive"
          />
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
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  iconClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        <Icon className={cn("size-4 text-muted-foreground", iconClass)} />
      </div>
      <p className={cn("mt-2 text-xl font-semibold tabular-nums", valueClass)}>
        {value}
      </p>
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
