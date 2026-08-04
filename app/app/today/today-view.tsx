"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  Flame,
  MessageCircle,
} from "lucide-react";
import { TileSpark } from "@/components/illustrations/tile-spark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatRelative } from "@/lib/format";
import { formatVN } from "@/lib/datetime";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { CHANNEL_LABELS } from "../inbox/types";
import { ScoreBadge } from "../contacts/score-badge";
import { completeActivity } from "./actions";
import {
  fetchTodayQueue,
  type TodayConversation,
  type TodayHotContact,
  type TodayItem,
  type TodayQueue,
} from "./types";

type Scope = "mine" | "all";
type SectionKey = "overdue" | "today" | "hot" | "unanswered";

/**
 * Màn "Hôm nay gọi ai" — 4 khối xếp theo độ gấp, mỗi dòng nói rõ VÌ SAO có mặt
 * và cho hành động ngay tại chỗ. Đánh dấu xong cập nhật lạc quan (optimistic):
 * dòng biến mất tức thì, lỗi thì trả lại chỗ cũ kèm toast.
 */
export function TodayView({
  canSeeAll,
  initialQueue,
  now,
}: {
  canSeeAll: boolean;
  initialQueue: TodayQueue;
  /** Mốc "bây giờ" do server truyền xuống — render phải thuần, không gọi Date.now(). */
  now: string;
}) {
  const t = useTranslations("today");
  const tTime = useTranslations("time");
  const tShell = useTranslations("shell");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);

  // Staff không có nút chuyển — hàng đợi luôn là việc của chính mình
  const [scope, setScope] = useState<Scope>(canSeeAll ? "all" : "mine");
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<SectionKey>>(new Set());
  const [, startTransition] = useTransition();

  const defaultScope: Scope = canSeeAll ? "all" : "mine";
  const queue = useQuery({
    queryKey: ["today", scope],
    queryFn: () => fetchTodayQueue(supabase, scope === "mine"),
    initialData: scope === defaultScope ? initialQueue : undefined,
  });

  const data = queue.data;

  const toggleSection = (key: SectionKey) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const markDone = (activityId: string) => {
    setDoneIds((prev) => new Set(prev).add(activityId));
    startTransition(async () => {
      const res = await completeActivity(activityId);
      if (res.error) {
        setDoneIds((prev) => {
          const next = new Set(prev);
          next.delete(activityId);
          return next;
        });
        toast.error(res.error);
        return;
      }
      toast.success(t("toast.done"));
    });
  };

  const visible = (items: TodayItem[]) =>
    items.filter((i) => !(i.kind === "activity" && doneIds.has(i.id)));

  const countOf = (key: "overdue" | "today", items: TodayItem[]) =>
    (data?.counts[key] ?? 0) - (items.length - visible(items).length);

  const overdue = visible(data?.overdue ?? []);
  const todayItems = visible(data?.today ?? []);
  const counts = {
    overdue: countOf("overdue", data?.overdue ?? []),
    today: countOf("today", data?.today ?? []),
    hot: data?.counts.hot ?? 0,
    unanswered: data?.counts.unanswered ?? 0,
  };
  const totalLeft =
    counts.overdue + counts.today + counts.hot + counts.unanswered;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        {/* 375px: tiêu đề chiếm trọn dòng đầu để bộ lọc + nút Tổng quan gọn 1 dòng dưới */}
        <div className="w-full min-w-0 sm:mr-auto sm:w-auto">
          <h1 className="truncate text-sm font-semibold">{t("title")}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {t("subtitle", { date: formatDate(now, locale) })}
          </p>
        </div>
        {canSeeAll && (
          <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <TabsList>
              <TabsTrigger value="mine">{t("scope.mine")}</TabsTrigger>
              <TabsTrigger value="all">{t("scope.all")}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        {/* Lối vào Tổng quan: mobile đã nhường ô nav dưới cho "Hôm nay" */}
        <Button variant="outline" size="sm" asChild>
          <Link href="/app">{tShell("nav.overview")}</Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
          {queue.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : queue.isError ? (
            <div className="rounded-lg border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">{t("error")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => queue.refetch()}
              >
                {t("retry")}
              </Button>
            </div>
          ) : totalLeft === 0 ? (
            <AllClear title={t("allClear.title")} note={t("allClear.note")} />
          ) : (
            <>
              <Section
                icon={AlertTriangle}
                tone="danger"
                title={t("sections.overdue")}
                count={counts.overdue}
                open={!collapsed.has("overdue")}
                onToggle={() => toggleSection("overdue")}
                emptyText={t("sections.overdueEmpty")}
              >
                {overdue.map((item) => (
                  <WorkRow
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    overdue
                    locale={locale}
                    t={t}
                    tTime={tTime}
                    onDone={markDone}
                  />
                ))}
              </Section>

              <Section
                icon={CalendarClock}
                title={t("sections.today")}
                count={counts.today}
                open={!collapsed.has("today")}
                onToggle={() => toggleSection("today")}
                emptyText={t("sections.todayEmpty")}
              >
                {todayItems.map((item) => (
                  <WorkRow
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    locale={locale}
                    t={t}
                    tTime={tTime}
                    onDone={markDone}
                  />
                ))}
              </Section>

              <Section
                icon={Flame}
                tone="danger"
                title={t("sections.hot")}
                count={counts.hot}
                open={!collapsed.has("hot")}
                onToggle={() => toggleSection("hot")}
                emptyText={t("sections.hotEmpty")}
              >
                {(data?.hot ?? []).map((c) => (
                  <HotRow key={c.id} contact={c} locale={locale} t={t} tTime={tTime} />
                ))}
              </Section>

              <Section
                icon={MessageCircle}
                title={t("sections.unanswered")}
                count={counts.unanswered}
                open={!collapsed.has("unanswered")}
                onToggle={() => toggleSection("unanswered")}
                emptyText={t("sections.unansweredEmpty")}
              >
                {(data?.unanswered ?? []).map((c) => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    locale={locale}
                    t={t}
                    tTime={tTime}
                  />
                ))}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type T = ReturnType<typeof useTranslations>;

function AllClear({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
      <TileSpark className="size-16" />
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

function Section({
  icon: Icon,
  tone,
  title,
  count,
  open,
  onToggle,
  emptyText,
  children,
}: {
  icon: typeof Flame;
  tone?: "danger";
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  emptyText: string;
  children: React.ReactNode;
}) {
  const isEmpty = count === 0;
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <Icon
          className={cn(
            "size-4 shrink-0",
            tone === "danger" && !isEmpty
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {title}
        </span>
        {/* Tab trạng thái KÈM SỐ ĐẾM (quy ước bảng VN) */}
        <Badge variant={isEmpty ? "outline" : "secondary"} className="tabular-nums">
          {count}
        </Badge>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && (
        <div className="border-t">
          {isEmpty ? (
            <p className="px-4 py-3 text-[13px] text-muted-foreground">
              {emptyText}
            </p>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}

/** Khung 1 dòng: ai + vì sao có mặt + hành động (mobile xuống dòng, không tràn ngang). */
function Row({
  name,
  why,
  phone,
  badge,
  actions,
}: {
  name: string;
  why: string;
  phone: string | null;
  badge?: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <span className="min-w-0 truncate">{name}</span>
          {badge}
        </p>
        <p className="truncate text-xs text-muted-foreground">{why}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {phone && <PhoneCopy phone={phone} />}
        {actions}
      </div>
    </div>
  );
}

/** SĐT bấm để chép nhanh — có chữ kèm icon (luật thiết kế cấm icon-only cho hành động). */
function PhoneCopy({ phone }: { phone: string }) {
  const t = useTranslations("today");
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 font-normal tabular-nums"
      title={t("copyPhone")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(phone);
          toast.success(t("toast.phoneCopied"));
        } catch {
          toast.error(t("toast.phoneCopyFailed"));
        }
      }}
    >
      {phone}
      <Copy className="size-3.5 opacity-60" />
    </Button>
  );
}

function WorkRow({
  item,
  overdue,
  locale,
  t,
  tTime,
  onDone,
}: {
  item: TodayItem;
  overdue?: boolean;
  locale: Locale;
  t: T;
  tTime: T;
  onDone: (id: string) => void;
}) {
  const who = item.full_name ?? t("unknownContact");
  const when = overdue
    ? t("why.overdueSince", { time: formatRelative(item.at, locale, tTime) })
    : t("why.dueAt", { time: formatVN(item.at, "HH:mm") });
  const what =
    item.kind === "activity"
      ? item.title
      : t("why.dealNextAction", { title: item.title });
  const why = `${when} · ${what}`;

  return (
    <Row
      name={who}
      why={why}
      phone={item.phone}
      actions={
        <>
          {item.kind === "activity" && (
            <Button size="sm" onClick={() => onDone(item.id)}>
              <Check className="size-4" />
              {t("actions.markDone")}
            </Button>
          )}
          {item.kind === "deal" && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/app/deals">{t("actions.openDeal")}</Link>
            </Button>
          )}
          {item.contact_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/app/contacts/${item.contact_id}`}>
                {t("actions.openContact")}
              </Link>
            </Button>
          )}
        </>
      }
    />
  );
}

function HotRow({
  contact,
  locale,
  t,
  tTime,
}: {
  contact: TodayHotContact;
  locale: Locale;
  t: T;
  tTime: T;
}) {
  const why = contact.last_interaction_at
    ? t("why.lastTouch", {
        time: formatRelative(contact.last_interaction_at, locale, tTime),
      })
    : t("why.neverTouched");
  return (
    <Row
      name={contact.full_name}
      why={why}
      phone={contact.phone}
      badge={<ScoreBadge score={contact.lead_score} className="shrink-0" />}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href={`/app/contacts/${contact.id}`}>
            {t("actions.openContact")}
          </Link>
        </Button>
      }
    />
  );
}

function ConversationRow({
  conversation,
  locale,
  t,
  tTime,
}: {
  conversation: TodayConversation;
  locale: Locale;
  t: T;
  tTime: T;
}) {
  // Tên kênh đã nói rõ là kênh nào ("Zalo OA Spa Hương Sen") — chỉ khi kênh chưa
  // đặt tên mới rơi về nhãn loại kênh, tránh lặp "Zalo OA · Zalo OA ..."
  const why = t("why.waitingSince", {
    channel:
      conversation.channel_name ??
      CHANNEL_LABELS[conversation.channel_type] ??
      conversation.channel_type,
    time: formatRelative(conversation.waiting_since, locale, tTime),
  });
  return (
    <Row
      name={conversation.name ?? t("unknownContact")}
      why={why}
      phone={null}
      actions={
        <>
          <Button size="sm" asChild>
            <Link href={`/app/inbox?c=${conversation.id}`}>
              {t("actions.openConversation")}
            </Link>
          </Button>
          {conversation.contact_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/app/contacts/${conversation.contact_id}`}>
                {t("actions.openContact")}
              </Link>
            </Button>
          )}
        </>
      }
    />
  );
}
