"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Building2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/client";
import { normalizeSearch } from "../contacts/types";
import { CompanyFormDialog } from "./company-form-dialog";
import { fetchCompaniesPage, type CompaniesPage } from "./queries";
import { formatTaxCode } from "./types";

type Props = {
  initialQ: string;
  initialPage: CompaniesPage;
};

const Dash = () => <span className="text-muted-foreground">—</span>;

export function CompaniesShell({ initialQ, initialPage }: Props) {
  const t = useTranslations("companies");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [q, setQ] = useQueryState("q", parseAsString.withDefault(initialQ));
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [createOpen, setCreateOpen] = useState(false);

  // Debounce 300ms: gõ xong mới query (như màn Khách hàng)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const normalizedQ = normalizeSearch(debouncedQ);
  const companiesQuery = useInfiniteQuery({
    queryKey: ["companies", normalizedQ],
    queryFn: ({ pageParam }) => fetchCompaniesPage(supabase, debouncedQ, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData:
      normalizedQ === normalizeSearch(initialQ)
        ? { pages: [initialPage], pageParams: [null] }
        : undefined,
  });

  const rows = companiesQuery.data?.pages.flatMap((p) => p.rows) ?? [];

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
        <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {t("addNew")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {companiesQuery.isPending ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-2/3" />
          </div>
        ) : companiesQuery.isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <p className="text-sm text-muted-foreground">{t("empty.error")}</p>
            <Button variant="outline" onClick={() => companiesQuery.refetch()}>
              {tCommon("loadMore")}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="rounded-full bg-muted p-6">
              <Building2 className="size-10 text-muted-foreground" />
            </div>
            {normalizedQ !== "" ? (
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
                  <th className="hidden px-4 font-medium md:table-cell">
                    {t("table.domain")}
                  </th>
                  <th className="hidden px-4 font-medium lg:table-cell">
                    {t("table.taxCode")}
                  </th>
                  <th className="px-4 text-right font-medium">
                    {t("table.contacts")}
                  </th>
                  <th className="hidden px-4 text-right font-medium sm:table-cell">
                    {t("table.openDeals")}
                  </th>
                  <th className="hidden px-4 text-right font-medium sm:table-cell">
                    {t("table.wonValue")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((co) => (
                  <tr
                    key={co.id}
                    onClick={() => router.push(`/app/companies/${co.id}`)}
                    className="h-11 cursor-pointer border-b transition-colors hover:bg-muted/50"
                  >
                    <td className="px-4">
                      {/* Link thật: bàn phím/screen reader vào được, row onClick chỉ là tiện chuột */}
                      <Link
                        href={`/app/companies/${co.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2.5"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                          <Building2 className="size-4 text-muted-foreground" />
                        </span>
                        {/* Tên công ty VN dài hơn tên người — cho rộng hơn cột Tên của Khách hàng */}
                        <span className="block max-w-xs truncate font-medium">
                          {co.name}
                        </span>
                      </Link>
                    </td>
                    <td className="hidden px-4 whitespace-nowrap md:table-cell">
                      {co.email_domain ? `@${co.email_domain}` : <Dash />}
                    </td>
                    <td className="hidden px-4 whitespace-nowrap lg:table-cell">
                      {formatTaxCode(co.tax_code) ?? <Dash />}
                    </td>
                    <td className="px-4 text-right whitespace-nowrap">
                      {co.stats.contact_count}
                    </td>
                    <td className="hidden px-4 text-right whitespace-nowrap sm:table-cell">
                      {co.stats.open_deal_count}
                    </td>
                    <td className="hidden px-4 text-right font-medium whitespace-nowrap sm:table-cell">
                      {formatMoney(co.stats.won_value_vnd, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {companiesQuery.hasNextPage && (
              <div className="flex justify-center p-4">
                <Button
                  variant="outline"
                  disabled={companiesQuery.isFetchingNextPage}
                  onClick={() => companiesQuery.fetchNextPage()}
                >
                  {companiesQuery.isFetchingNextPage
                    ? tCommon("loading")
                    : tCommon("loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <CompanyFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => companiesQuery.refetch()}
      />
    </div>
  );
}
