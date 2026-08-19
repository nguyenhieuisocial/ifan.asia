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
  /** Vai Chỉ xem không ghi được (RLS `companies_insert`) — giấu nút tạo cho khỏi ngõ cụt. */
  canWrite: boolean;
};

const Dash = () => <span className="text-muted-foreground">—</span>;

export function CompaniesShell({ initialQ, initialPage, canWrite }: Props) {
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
        {canWrite && (
          <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("addNew")}
          </Button>
        )}
      </div>

      {/* @container: bảng phải đo theo CHỖ THẬT nó được ngồi, không theo bề
          ngang máy. Thanh bên (w-60 = 240px) hiện ra đúng mốc 768px — cùng lúc
          các cột cũ mở thêm theo `md:` — nên ở 768px bảng bị dồn vào 528px mà
          vẫn vẽ 5 cột: tràn 147px. Đổi hết sang mốc theo khung chứa thì cột chỉ
          mở khi thật sự còn chỗ. */}
      <div className="@container min-h-0 flex-1 overflow-y-auto">
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
                {canWrite && (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" />
                    {t("empty.cta")}
                  </Button>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
                <tr className="h-10 border-b">
                  <th className="px-4 font-medium">{t("table.name")}</th>
                  {/* Tên miền tốn ~146px: chỉ mở khi khung ≥768px */}
                  <th className="hidden px-4 font-medium @3xl:table-cell">
                    {t("table.domain")}
                  </th>
                  {/* MST tốn thêm ~149px: chỉ mở khi khung ≥896px */}
                  <th className="hidden px-4 font-medium @4xl:table-cell">
                    {t("table.taxCode")}
                  </th>
                  {/* Ba cột số tốn ~279px (đã tính tiền tỉ 13 chữ số): mở từ
                      khung ≥512px, chừa lại ≥144px cho tên. */}
                  <th className="hidden px-4 text-right font-medium @lg:table-cell">
                    {t("table.contacts")}
                  </th>
                  <th className="hidden px-4 text-right font-medium @lg:table-cell">
                    {t("table.openDeals")}
                  </th>
                  {/* Khung dưới 512px thì cột này ẩn hẳn: hai cột cộng lại rộng
                      416px trên màn 375px nên tiêu đề cụt còn "Doanh" và số tiền
                      mất chữ số cuối. Số tiền chuyển xuống dòng phụ dưới tên
                      (nguyên vẹn), bảng còn ĐÚNG MỘT cột nên hết đường tràn. */}
                  <th className="hidden px-4 text-right font-medium @lg:table-cell">
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
                        {/* Chặn bề ngang ô Tên theo KHUNG CHỨA (100cqw), không
                            theo bề ngang máy. Chữ `truncate` là nowrap nên nếu
                            không chặn thì bề rộng tối thiểu của ô = trọn cái
                            tên, và tên công ty VN kiểu "Công ty Cổ phần Thương
                            mại Dịch vụ Xuất nhập khẩu…" một mình đủ đội bảng
                            tràn ra ngoài. Số trừ đi = 5rem lề ô/biểu tượng CỘNG
                            chỗ các cột số bên phải cần ở từng mốc (≈279px cho 3
                            cột số kể cả tiền tỉ 13 chữ số, +146px tên miền,
                            +149px MST) — nhờ vậy ô Tên luôn là ô CHỊU NHƯỜNG,
                            bảng không bao giờ rộng hơn chỗ nó ngồi.
                            Thêm cột mới ở bên phải thì phải cộng vào các số này. */}
                        <span className="min-w-0 max-w-[calc(100cqw_-_5rem)] @lg:max-w-[calc(100cqw_-_23rem)] @3xl:max-w-[calc(100cqw_-_32rem)] @4xl:max-w-[calc(100cqw_-_42rem)]">
                          {/* Tên công ty VN dài hơn tên người — cho rộng hơn cột Tên của Khách hàng */}
                          <span className="block max-w-xs truncate font-medium">
                            {co.name}
                          </span>
                          {/* Khung hẹp: gộp các cột ẩn vào 1 dòng phụ để không mất số liệu.
                              Số tiền đứng ĐẦU và shrink-0 → không bao giờ bị cắt;
                              phần tên miền/số khách mới là phần nhường chỗ khi chật. */}
                          <span className="flex max-w-xs gap-1.5 text-xs @lg:hidden">
                            <span className="shrink-0 font-medium">
                              {t("table.wonValueShort")}{" "}
                              {formatMoney(co.stats.won_value_vnd, locale)}
                            </span>
                            <span className="min-w-0 truncate text-muted-foreground">
                              ·{" "}
                              {[
                                co.email_domain ? `@${co.email_domain}` : null,
                                t("table.mobileSummary", {
                                  contacts: co.stats.contact_count,
                                  deals: co.stats.open_deal_count,
                                }),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="hidden max-w-40 truncate px-4 @3xl:table-cell">
                      {co.email_domain ? `@${co.email_domain}` : <Dash />}
                    </td>
                    <td className="hidden px-4 whitespace-nowrap @4xl:table-cell">
                      {formatTaxCode(co.tax_code) ?? <Dash />}
                    </td>
                    <td className="hidden px-4 text-right whitespace-nowrap @lg:table-cell">
                      {co.stats.contact_count}
                    </td>
                    <td className="hidden px-4 text-right whitespace-nowrap @lg:table-cell">
                      {co.stats.open_deal_count}
                    </td>
                    {/* Tiền là số quan trọng nhất — khung từ 512px trở lên giữ
                        nguyên cột riêng; hẹp hơn thì nó nằm ở dòng phụ dưới tên
                        (xem trên) */}
                    <td className="hidden px-4 text-right font-medium whitespace-nowrap @lg:table-cell">
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
