"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronDown, Filter, Plus, Search, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/client";
import { fetchContactsPage, type ContactsPage } from "./queries";
import {
  normalizeSearch,
  ownerLabel,
  TIER_BADGE,
  type ContactRow,
  type LeadSource,
} from "./types";
import { ContactFormDialog } from "./contact-form-dialog";

type Tab = "all" | "mine";

const MAX_TAGS_SHOWN = 3;

function ContactTags({ contact }: { contact: ContactRow }) {
  const tags = contact.contact_tags
    .map((ct) => ct.tags)
    .filter((t): t is NonNullable<typeof t> => t !== null);
  if (tags.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {tags.slice(0, MAX_TAGS_SHOWN).map((t) => (
        <Badge key={t.id} variant="secondary">
          {t.name}
        </Badge>
      ))}
      {tags.length > MAX_TAGS_SHOWN && (
        <Badge variant="outline">+{tags.length - MAX_TAGS_SHOWN}</Badge>
      )}
    </span>
  );
}

type Props = {
  currentUserId: string;
  leadSources: LeadSource[];
  initialQ: string;
  initialPage: ContactsPage;
};

export function ContactsShell({
  currentUserId,
  leadSources,
  initialQ,
  initialPage,
}: Props) {
  const t = useTranslations("contacts");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [q, setQ] = useQueryState("q", parseAsString.withDefault(initialQ));
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [createOpen, setCreateOpen] = useState(false);

  // Debounce 300ms: gõ xong mới query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const normalizedQ = normalizeSearch(debouncedQ);
  const isInitialState =
    normalizedQ === normalizeSearch(initialQ) && sourceId === null && tab === "all";

  const contactsQuery = useInfiniteQuery({
    queryKey: ["contacts", normalizedQ, sourceId, tab],
    queryFn: ({ pageParam }) =>
      fetchContactsPage(
        supabase,
        {
          q: debouncedQ,
          sourceId,
          mineOnly: tab === "mine",
          userId: currentUserId,
        },
        pageParam,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: isInitialState
      ? { pages: [initialPage], pageParams: [null] }
      : undefined,
  });

  const rows = contactsQuery.data?.pages.flatMap((p) => p.rows) ?? [];
  const sourceName = sourceId
    ? (leadSources.find((s) => s.id === sourceId)?.name ?? t("source.fallback"))
    : t("source.all");
  const hasFilter = normalizedQ !== "" || sourceId !== null || tab === "mine";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <h1 className="mr-2 hidden text-sm font-semibold sm:block">{t("title")}</h1>
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Filter className="size-4" />
              <span className="hidden md:inline">{sourceName}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t("source.label")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSourceId(null)}>
              {t("source.all")}
              {sourceId === null && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
            {leadSources.map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => setSourceId(s.id)}>
                {s.name}
                {sourceId === s.id && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="mine">{t("tabs.mine")}</TabsTrigger>
            <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {t("addNew")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {contactsQuery.isPending ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-2/3" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="rounded-full bg-muted p-5">
              <Users className="size-8 text-muted-foreground" />
            </div>
            {hasFilter ? (
              <p className="text-sm text-muted-foreground">{t("empty.filtered")}</p>
            ) : (
              <>
                <h2 className="text-base font-semibold">{t("empty.title")}</h2>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {t("empty.description")}
                </p>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" />
                  {t("empty.cta")}
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
                <tr className="h-10 border-b">
                  <th className="px-4 font-medium">{t("table.name")}</th>
                  <th className="px-4 font-medium">{t("table.phone")}</th>
                  <th className="hidden px-4 font-medium lg:table-cell">
                    {t("table.email")}
                  </th>
                  <th className="hidden px-4 font-medium md:table-cell">
                    {t("table.source")}
                  </th>
                  <th className="hidden px-4 font-medium xl:table-cell">
                    {t("table.tags")}
                  </th>
                  <th className="hidden px-4 font-medium md:table-cell">
                    {t("table.owner")}
                  </th>
                  <th className="hidden px-4 font-medium sm:table-cell">
                    {t("table.updated")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/app/contacts/${c.id}`)}
                    className="h-11 cursor-pointer border-b transition-colors hover:bg-muted/50"
                  >
                    <td className="px-4">
                      {/* Link thật: bàn phím/screen reader vào được, row onClick chỉ là tiện chuột */}
                      <Link
                        href={`/app/contacts/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2.5"
                      >
                        <Avatar className="size-7">
                          <AvatarFallback className="text-xs">
                            {(c.full_name[0] ?? "?").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block max-w-48 truncate font-medium">
                            {c.full_name}
                          </span>
                        </span>
                        <Badge
                          className={cn("font-semibold", TIER_BADGE[c.tier])}
                        >
                          {t(`tier.${c.tier}`)}
                        </Badge>
                      </Link>
                    </td>
                    <td className="px-4 whitespace-nowrap">
                      {c.phone ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="hidden max-w-52 truncate px-4 lg:table-cell">
                      {c.email ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="hidden px-4 whitespace-nowrap md:table-cell">
                      {c.lead_sources?.name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 xl:table-cell">
                      <ContactTags contact={c} />
                    </td>
                    <td className="hidden px-4 whitespace-nowrap md:table-cell">
                      {ownerLabel(c.owner_id, currentUserId, t)}
                    </td>
                    <td className="hidden px-4 text-xs whitespace-nowrap text-muted-foreground sm:table-cell">
                      {formatDate(c.updated_at, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {contactsQuery.hasNextPage && (
              <div className="flex justify-center p-4">
                <Button
                  variant="outline"
                  disabled={contactsQuery.isFetchingNextPage}
                  onClick={() => contactsQuery.fetchNextPage()}
                >
                  {contactsQuery.isFetchingNextPage
                    ? tCommon("loading")
                    : tCommon("loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <ContactFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        leadSources={leadSources}
        onSuccess={() => contactsQuery.refetch()}
      />
    </div>
  );
}
