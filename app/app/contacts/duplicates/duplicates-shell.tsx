"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, CheckCheck, Mail, Phone, User, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/client";
import { dismissContactPair } from "../merge-actions";
import { ScoreBadge } from "../score-badge";
import { ownerLabel, TIER_BADGE, type MemberNames } from "../types";
import { MergeDialog } from "./merge-dialog";
import { fetchDuplicatePairs, PAIRS_PAGE_SIZE } from "./queries";
import type { DuplicatePair, MatchType, MergeCandidate } from "./types";

const MATCH_ICON: Record<MatchType, typeof Phone> = {
  phone: Phone,
  email: Mail,
  name: User,
};

/** Một cột hồ sơ trong thẻ so sánh. */
function CandidateColumn({
  c,
  currentUserId,
  memberNames,
  locale,
}: {
  c: MergeCandidate;
  currentUserId: string;
  memberNames: MemberNames;
  locale: Locale;
}) {
  const t = useTranslations("contacts");
  const tm = useTranslations("contacts.merge");
  const rows: [string, React.ReactNode][] = [
    [t("table.phone"), c.phone],
    [t("table.email"), c.email],
    [t("table.owner"), ownerLabel(c.owner_id, currentUserId, t, memberNames)],
    [tm("moved.conversations"), c.conversation_count],
    [tm("moved.deals"), c.deal_count],
    [tm("list.createdAt"), formatDate(c.created_at, locale)],
  ];
  return (
    <div className="min-w-0 flex-1 space-y-2 rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">
            {(c.full_name[0] ?? "?").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <Link
          href={`/app/contacts/${c.id}`}
          className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
        >
          {c.full_name}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={cn("font-semibold", TIER_BADGE[c.tier])}>
          {t(`tier.${c.tier}`)}
        </Badge>
        <ScoreBadge score={c.lead_score} />
      </div>
      <dl className="space-y-1 text-[13px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate text-right">
              {value === null || value === "" ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

type Props = {
  currentUserId: string;
  memberNames: MemberNames;
  initialPairs: DuplicatePair[];
};

export function DuplicatesShell({
  currentUserId,
  memberNames,
  initialPairs,
}: Props) {
  const t = useTranslations("contacts.merge");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [activePair, setActivePair] = useState<DuplicatePair | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [, startDismiss] = useTransition();

  const pairsQuery = useInfiniteQuery({
    queryKey: ["contact-duplicates"],
    queryFn: ({ pageParam }) => fetchDuplicatePairs(supabase, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) =>
      last.length === PAIRS_PAGE_SIZE ? all.length * PAIRS_PAGE_SIZE : undefined,
    initialData: { pages: [initialPairs], pageParams: [0] },
  });

  const pairs = pairsQuery.data?.pages.flat() ?? [];

  const refresh = () => {
    pairsQuery.refetch();
    router.refresh();
  };

  const dismiss = (pair: DuplicatePair) => {
    const key = `${pair.a_id}:${pair.b_id}`;
    setDismissing(key);
    startDismiss(async () => {
      const res = await dismissContactPair(pair.a_id, pair.b_id);
      setDismissing(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("toasts.dismissed"));
      refresh();
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link href="/app/contacts">
            <ArrowLeft className="size-4" />
            {tCommon("back")}
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">{t("title")}</h1>
        {pairs.length > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            {t("list.pairCount", { count: pairs.length })}
          </Badge>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {pairsQuery.isPending ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : pairs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-muted">
              <CheckCheck aria-hidden className="size-8 text-muted-foreground" />
            </span>
            <h2 className="text-base font-semibold">{t("empty.title")}</h2>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t("empty.description")}
            </p>
            <Button variant="outline" asChild>
              <Link href="/app/contacts">{t("empty.cta")}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3 p-3 sm:p-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {t("list.intro")}
            </p>
            {pairs.map((pair) => {
              const Icon = MATCH_ICON[pair.match_type];
              const key = `${pair.a_id}:${pair.b_id}`;
              return (
                <article key={key} className="rounded-lg border p-3">
                  <header className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Icon aria-hidden className="size-3" />
                      {t(`match.${pair.match_type}`)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t("list.confidence", { value: pair.confidence })}
                    </span>
                  </header>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <CandidateColumn
                      c={pair.a}
                      currentUserId={currentUserId}
                      memberNames={memberNames}
                      locale={locale}
                    />
                    <CandidateColumn
                      c={pair.b}
                      currentUserId={currentUserId}
                      memberNames={memberNames}
                      locale={locale}
                    />
                  </div>

                  <footer className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setActivePair(pair)}>
                      <Users className="size-4" />
                      {t("actions.merge")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={dismissing === key}
                      onClick={() => dismiss(pair)}
                    >
                      {dismissing === key ? tCommon("loading") : t("actions.dismiss")}
                    </Button>
                  </footer>
                </article>
              );
            })}
            {pairsQuery.hasNextPage && (
              <div className="flex justify-center p-2">
                <Button
                  variant="outline"
                  disabled={pairsQuery.isFetchingNextPage}
                  onClick={() => pairsQuery.fetchNextPage()}
                >
                  {pairsQuery.isFetchingNextPage
                    ? tCommon("loading")
                    : tCommon("loadMore")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <MergeDialog
        pair={activePair}
        currentUserId={currentUserId}
        memberNames={memberNames}
        onOpenChange={(open) => !open && setActivePair(null)}
        onMerged={refresh}
      />
    </div>
  );
}
