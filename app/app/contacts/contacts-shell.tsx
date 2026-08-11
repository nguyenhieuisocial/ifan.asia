"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDown,
  Award,
  Check,
  ChevronDown,
  CopyCheck,
  Download,
  FileSpreadsheet,
  Filter,
  Phone,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { TileContact } from "@/components/illustrations/tile-contact";
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
import { seedLabel } from "@/lib/seed-i18n";
import type { Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/client";
import {
  fetchContactsPage,
  type ContactsPage,
  type ContactsSort,
} from "./queries";
import { DUPLICATE_CAP } from "./duplicates/queries";
import { ScoreBadge } from "./score-badge";
import {
  normalizeSearch,
  ownerLabel,
  TIER_BADGE,
  TIERS,
  type ContactRow,
  type LeadSource,
  type MemberNames,
} from "./types";
import { ContactFormDialog } from "./contact-form-dialog";
import { exportContactsXlsx } from "./import-export-actions";
import { downloadBase64File, ImportDialog } from "./import-dialog";

type Tab = "all" | "mine";

/** Giá trị hợp lệ của ?sort= — khớp ContactsSort trong queries.ts. */
const SORTS = ["recent", "score"] as const satisfies readonly ContactsSort[];

const MAX_TAGS_SHOWN = 3;

function ContactTags({ contact }: { contact: ContactRow }) {
  const tags = contact.contact_tags
    .map((ct) => ct.tags)
    .filter((t): t is NonNullable<typeof t> => t !== null);
  if (tags.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    // KHÔNG cho thẻ xuống dòng: hàng nào có 2 thẻ dài là thẻ xếp chồng dọc, đội
    // chiều cao hàng lên và cả bảng nhấp nhô. Thẻ quá chỗ thì cắt — bấm vào hồ
    // sơ xem đủ, còn bảng phải đọc lướt được.
    <span className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap">
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
  memberNames: MemberNames;
  leadSources: LeadSource[];
  initialQ: string;
  initialPage: ContactsPage;
  /** Nhập Excel + gộp trùng chỉ dành cho owner/admin/manager (ghi hàng loạt cho cả tiệm). */
  canImport: boolean;
  /** Số cặp nghi trùng đang chờ xử lý — 0 thì không hiện lối vào màn Trùng lặp. */
  duplicateCount: number;
  /**
   * Vai chỉ thấy khách MÌNH phụ trách (nhân viên, người xem — luật RLS
   * `contacts_select`). Danh sách rỗng với họ KHÔNG có nghĩa tiệm chưa có khách,
   * nên trạng thái trống phải nói khác đi, không thì nhìn như phần mềm hỏng.
   */
  ownContactsOnly: boolean;
  /** Khung nav theo pack (mục 35.1 việc 8): tên gọi "khách" theo ngành đang chọn — chưa chọn ngành thì dùng chuỗi mặc định t("title"). */
  contactLabel?: string;
};

export function ContactsShell({
  currentUserId,
  memberNames,
  leadSources,
  initialQ,
  initialPage,
  canImport,
  duplicateCount,
  ownContactsOnly,
  contactLabel,
}: Props) {
  const t = useTranslations("contacts");
  const tCommon = useTranslations("common");
  // Cột "Nguồn" của từng dòng phải đọc GIỐNG HỆT ô lọc nguồn ngay phía trên —
  // dòng tải thêm về từ client cũng đi qua đây (migration #36).
  const tSeed = useTranslations("seed");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [q, setQ] = useQueryState("q", parseAsString.withDefault(initialQ));
  const [debouncedQ, setDebouncedQ] = useState(q);
  // Bộ lọc nằm trên URL (cùng mẫu nuqs với ?q=) để màn khác trỏ thẳng vào được:
  // Báo cáo nguồn/Mã QR → ?source=, Phân hạng → ?tier=, Tổng quan → ?sort=score.
  const [sourceId, setSourceId] = useQueryState("source", parseAsString);
  const [tier, setTier] = useQueryState("tier", parseAsStringLiteral(TIERS));
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringLiteral(SORTS).withDefault("recent"),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, startExport] = useTransition();

  // Debounce 300ms: gõ xong mới query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const normalizedQ = normalizeSearch(debouncedQ);
  const isInitialState =
    normalizedQ === normalizeSearch(initialQ) &&
    sourceId === null &&
    tier === null &&
    tab === "all" &&
    sort === "recent";

  const contactsQuery = useInfiniteQuery({
    queryKey: ["contacts", normalizedQ, sourceId, tier, tab, sort],
    queryFn: ({ pageParam }) =>
      fetchContactsPage(
        supabase,
        {
          q: debouncedQ,
          sourceId,
          tier,
          mineOnly: tab === "mine",
          userId: currentUserId,
          sort,
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
  const tierName = tier ? t(`tier.${tier}`) : t("tierFilter.all");
  const hasFilter =
    normalizedQ !== "" || sourceId !== null || tier !== null || tab === "mine";

  // File xuất bám đúng bộ lọc đang bật trên màn hình
  const exportCurrentView = () =>
    startExport(async () => {
      const res = await exportContactsXlsx({
        q: debouncedQ,
        sourceId,
        tier,
        mineOnly: tab === "mine",
      });
      if (res.error || !res.fileBase64 || !res.fileName) {
        toast.error(res.error ?? t("importExport.errors.exportFailed"));
        return;
      }
      downloadBase64File(res.fileBase64, res.fileName);
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Trên điện thoại khối này TỰ XUỐNG DÒNG thành 3-4 hàng, ăn 147px (bản
          Việt) tới 190px (bản Anh) — gần một phần tư màn 812px chỉ để chứa bộ
          lọc, trong khi thứ người ta vào đây để xem là DANH SÁCH KHÁCH.
          Tách hai tầng: ô tìm một hàng, các nút lọc dồn thành MỘT hàng cuộn
          ngang (đúng cách thanh Cài đặt đang làm). Từ 640px trở lên giữ nguyên
          kiểu tự xuống dòng như cũ. */}
      <div className="shrink-0 space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <h1 className="mr-2 hidden text-sm font-semibold sm:block">{contactLabel ?? t("title")}</h1>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-x-visible">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Filter className="size-4" />
              {/* Luật thiết kế: nút hành động luôn phải có chữ, không để icon trần.
                  Màn hẹp thì cắt bớt chữ chứ không giấu đi. */}
              <span className="max-w-24 truncate md:max-w-none">{sourceName}</span>
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
        {/* Lọc theo hạng — nhãn luôn hiện chữ (kể cả 375px) theo luật thiết kế */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Award className="size-4" />
              {tierName}
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t("tierFilter.label")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setTier(null)}>
              {t("tierFilter.all")}
              {tier === null && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
            {TIERS.map((value) => (
              <DropdownMenuItem key={value} onSelect={() => setTier(value)}>
                {t(`tier.${value}`)}
                {tier === value && <Check className="ml-auto size-4" />}
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
        {/* Lối vào màn gộp trùng — chỉ hiện khi THẬT SỰ có cặp nghi trùng */}
        {canImport && duplicateCount > 0 && (
          <Button variant="outline" size="sm" asChild className="ml-auto gap-1.5">
            {/* Luật thiết kế: hành động luôn CÓ CHỮ, không bao giờ chỉ icon */}
            <Link href="/app/contacts/duplicates">
              <CopyCheck className="size-4" />
              {t("merge.title")}
              <Badge variant="secondary" className="tabular-nums">
                {duplicateCount >= DUPLICATE_CAP
                  ? `${DUPLICATE_CAP}+`
                  : duplicateCount}
              </Badge>
            </Link>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "gap-1",
                !(canImport && duplicateCount > 0) && "ml-auto",
              )}
              disabled={exporting}
            >
              <FileSpreadsheet className="size-4" />
              {exporting ? tCommon("loading") : t("importExport.menu")}
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canImport && (
              <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                <Upload className="size-4" />
                {t("importExport.importAction")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={exportCurrentView}>
              <Download className="size-4" />
              {t("importExport.exportAction")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {t("addNew")}
        </Button>
        </div>
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
            <TileContact className="size-16" />
            {hasFilter ? (
              <p className="text-sm text-muted-foreground">{t("empty.filtered")}</p>
            ) : (
              <>
                <h2 className="text-base font-semibold">
                  {t(ownContactsOnly ? "empty.assignedTitle" : "empty.title")}
                </h2>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {t(
                    ownContactsOnly
                      ? "empty.assignedDescription"
                      : "empty.description",
                  )}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" />
                    {t(ownContactsOnly ? "addNew" : "empty.cta")}
                  </Button>
                  {/* Tiệm đã có sẵn danh sách khách trong file thì nhập một
                      lượt nhanh hơn gõ từng người — mở đúng dialog nhập Excel
                      sẵn có (chỉ vai được nhập hàng loạt mới thấy). */}
                  {canImport && (
                    <Button variant="outline" onClick={() => setImportOpen(true)}>
                      <Upload className="size-4" />
                      {t("importExport.importAction")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Điện thoại (dưới 640px): bảng phải cuộn ngang mới đọc hết SĐT, mà
                gọi khách là việc số 1 của chủ tiệm — nên đổi sang thẻ, SĐT hiện
                trọn và có nút Gọi bấm là quay số luôn. Màn rộng giữ nguyên bảng. */}
            <ul className="sm:hidden">
              {rows.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
                >
                  <Link
                    href={`/app/contacts/${c.id}`}
                    prefetch={false}
                    className="flex min-w-0 flex-1 items-center gap-2.5"
                  >
                    <Avatar className="size-9">
                      <AvatarFallback className="text-xs">
                        {(c.full_name[0] ?? "?").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate font-medium">
                          {c.full_name}
                        </span>
                        <Badge
                          className={cn("shrink-0 font-semibold", TIER_BADGE[c.tier])}
                        >
                          {t(`tier.${c.tier}`)}
                        </Badge>
                      </span>
                      {/* Không truncate: SĐT phải đọc được TRỌN VẸN ở 375px.
                          Điểm nóng đứng cạnh số — dòng tên chỉ còn tên + hạng nên
                          không bị gãy dòng khi tên dài. */}
                      <span className="mt-1 flex items-center gap-1.5">
                        <span className="text-[13px] tabular-nums text-muted-foreground">
                          {c.phone ?? t("card.noPhone")}
                        </span>
                        <ScoreBadge score={c.lead_score} />
                      </span>
                    </span>
                  </Link>
                  {c.phone && (
                    <Button asChild variant="outline" size="sm" className="shrink-0">
                      <a href={`tel:${c.phone}`}>
                        <Phone className="size-4" />
                        {t("card.call")}
                      </a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <table className="hidden w-full text-sm sm:table">
              <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
                <tr className="h-10 border-b">
                  <th className="px-4 font-medium">{t("table.name")}</th>
                  <th
                    className="px-4 font-medium"
                    aria-sort={sort === "score" ? "descending" : "none"}
                  >
                    {/* Toggle sort điểm: bấm lần nữa về sort mặc định (mới nhất) */}
                    <button
                      type="button"
                      onClick={() =>
                        // null = xóa ?sort= khỏi URL, quay về mặc định "recent"
                        setSort(sort === "score" ? null : "score")
                      }
                      title={t("score.sortTooltip")}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                        sort === "score" && "text-foreground",
                      )}
                    >
                      {t("score.label")}
                      {/* Mũi tên CHỈ hiện khi đang thật sự sắp theo cột này.
                          Vẽ mờ sẵn thì người ta tin danh sách đang sắp theo
                          điểm, trong khi số chạy lung tung 65, 72, 61, 72, 49
                          — đọc sai cả bảng. */}
                      {sort === "score" && (
                        <ArrowDown aria-hidden className="size-3" />
                      )}
                    </button>
                  </th>
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
                        prefetch={false}
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
                    <td className="px-4">
                      <ScoreBadge score={c.lead_score} />
                    </td>
                    <td className="px-4 whitespace-nowrap">
                      {c.phone ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="hidden max-w-52 truncate px-4 lg:table-cell">
                      {c.email ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="hidden px-4 whitespace-nowrap md:table-cell">
                      {c.lead_sources ? (
                        seedLabel(
                          c.lead_sources.i18n_key,
                          c.lead_sources.name,
                          tSeed,
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 xl:table-cell">
                      <ContactTags contact={c} />
                    </td>
                    <td className="hidden px-4 whitespace-nowrap md:table-cell">
                      {ownerLabel(c.owner_id, currentUserId, t, memberNames)}
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

      {canImport && (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onSuccess={() => {
            contactsQuery.refetch();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
