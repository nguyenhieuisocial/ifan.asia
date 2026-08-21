"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowDown,
  Award,
  Check,
  ChevronDown,
  Clock,
  CopyCheck,
  Download,
  FileSpreadsheet,
  Filter,
  Phone,
  Plus,
  Search,
  Tag as TagIcon,
  Upload,
} from "lucide-react";
import { SavedViewChips } from "@/components/saved-views/saved-view-chips";
import { TileContact } from "@/components/illustrations/tile-contact";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { capitalizeFirst, type TenantPackCustomField } from "@/lib/tenant-pack";
import { createClient } from "@/lib/supabase/client";
import type { TagRow as TagWithCount } from "../settings/tags/queries";
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
import { BulkResultDialog, BulkSelectionBar, MAX_BULK, type BulkResult } from "./bulk-selection-bar";

type Tab = "all" | "mine";

/** Nhấn giữ MOBILE_LONG_PRESS_MS mới vào chế độ chọn (mục 36.8-2, "quen từ
 *  Zalo/ảnh") — chỉ dùng cho danh sách thẻ điện thoại, bàn phím/chuột có nút
 *  "Chọn" riêng ở header nên không cần long-press. */
const MOBILE_LONG_PRESS_MS = 500;

/** Giá trị hợp lệ của ?sort= — khớp ContactsSort trong queries.ts. */
const SORTS = ["recent", "score"] as const satisfies readonly ContactsSort[];

/** Mốc "chưa quay lại N ngày" cho ô lọc (mục 36.7/36.9F — chiều lọc bắt
 *  buộc để saved_views có giá trị thật). Số mốc cố ý ít: nhiều lựa chọn quá
 *  thì dropdown dài mà ít ai dùng hết. */
const INACTIVE_DAYS_OPTIONS = [30, 60, 90, 180] as const;

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

/**
 * Ô lọc một trường tùy biến pack khai `filterable` (24o) — so khớp CHÍNH XÁC
 * (`custom->>key = value`) nên gõ dở dang mà lọc luôn thì kết quả trống liên
 * tục, khó chịu hơn ô tìm không dấu. Giữ state cục bộ, chỉ đẩy lên URL lúc rời
 * ô hoặc bấm Enter. Viền/nền xanh nhạt để phân biệt "trường riêng của ngành"
 * với 3 ô lọc cố định (thẻ design man-bang-loc.html).
 */
function CustomFieldFilterInput({
  field,
  value,
  onCommit,
}: {
  field: TenantPackCustomField;
  value: string | null;
  onCommit: (value: string | null) => void;
}) {
  const [local, setLocal] = useState(value ?? "");
  // Đồng bộ lại state cục bộ khi giá trị từ URL đổi TỪ BÊN NGOÀI (chip lọc lưu
  // sẵn, nút back) — tính trong lúc render (mẫu React "Adjusting state when a
  // prop changes"), không dùng effect để khỏi cascading render.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setLocal(value ?? "");
  }
  const commit = () => {
    const next = local.trim();
    if (next !== (value ?? "")) onCommit(next || null);
  };
  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      placeholder={field.label}
      className="h-8 w-36 shrink-0 border-blue-300 bg-blue-50 text-xs placeholder:text-blue-500 dark:border-blue-900 dark:bg-blue-950/30"
    />
  );
}

type Props = {
  currentUserId: string;
  memberNames: MemberNames;
  leadSources: LeadSource[];
  tags: TagWithCount[];
  initialQ: string;
  initialPage: ContactsPage;
  /** Nhập Excel + gộp trùng chỉ dành cho owner/admin/manager (ghi hàng loạt cho cả tiệm). */
  canImport: boolean;
  /** Vai được THÊM/SỬA khách — mọi vai trừ Chỉ xem, khớp RLS `contacts_insert`. */
  canWrite: boolean;
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
  /** Trường tự khai theo pack ngành (V1a — mục 35.2 bước 4) — truyền cho dialog Thêm khách. */
  customFields?: TenantPackCustomField[];
  /**
   * Nút hàng loạt "Giao cho…" chỉ hiện khi vai NÀY thật sự giao được — RLS
   * contacts_update WITH CHECK chặn nhân viên giao cho người khác (chỉ tự
   * giao lại cho mình), hiện nút ra rồi báo lỗi 100% dòng thì tệ hơn ẩn nút.
   */
  canAssignOwner: boolean;
};

export function ContactsShell({
  currentUserId,
  memberNames,
  leadSources,
  tags,
  initialQ,
  initialPage,
  canImport,
  canWrite,
  duplicateCount,
  ownContactsOnly,
  contactLabel,
  customFields,
  canAssignOwner,
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
  // "Chưa quay lại N ngày" (mục 36.7/36.9F) — vốn từ ĐÓNG dùng cả cho bộ lọc
  // lưu sẵn (24p), không chỉ ô lọc tay ở đây.
  const [inactiveDays, setInactiveDays] = useQueryState("inactive_days", parseAsInteger);
  // Lọc theo nhãn (nốt lại phần bỏ sót ở task #79) — CSDL đã hiểu tham số
  // `tag` từ migration #69, chỉ thiếu UI.
  const [tagId, setTagId] = useQueryState("tag", parseAsString);
  // Trường tùy biến pack khai `filterable` (24o) — mỗi trường một tham số
  // `cf_<khoá>` riêng, khoá MỞ theo pack đang chọn nên dựng parser động thay vì
  // liệt kê tay. `customFields` không đổi trong vòng đời component (đến từ
  // pack của tenant, chỉ đổi khi điều hướng sang trang khác) nên số hook
  // useQueryStates bên trong luôn ổn định giữa các lần render.
  const filterableCustomFields = useMemo(
    () => (customFields ?? []).filter((f) => f.filterable),
    [customFields],
  );
  const listableCustomFields = useMemo(
    () => (customFields ?? []).filter((f) => f.listable),
    [customFields],
  );
  const customFieldParsers = useMemo(
    () =>
      Object.fromEntries(
        filterableCustomFields.map((f) => [`cf_${f.key}`, parseAsString]),
      ),
    [filterableCustomFields],
  );
  const [customFieldQuery, setCustomFieldQuery] = useQueryStates(customFieldParsers);
  const customFilter = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of filterableCustomFields) {
      const v = customFieldQuery[`cf_${f.key}`];
      if (v) out[f.key] = v;
    }
    return out;
  }, [customFieldQuery, filterableCustomFields]);
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringLiteral(SORTS).withDefault("recent"),
  );
  const [createOpen, setCreateOpen] = useState(false);
  // Gợi ý "+ Thêm khách «Hoa»" từ ô tìm kiếm toàn cục lúc không ra kết quả —
  // điều hướng qua ?new=<tên> rồi tự mở dialog Thêm khách, điền sẵn tên. Có
  // mặt tham số này là đủ để coi dialog đang mở — khỏi cần effect đồng bộ.
  const [newName, setNewName] = useQueryState("new", parseAsString);
  const createDialogOpen = createOpen || newName !== null;
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, startExport] = useTransition();

  // Chọn nhiều + hàng loạt (mục 36.8-2) — vào chế độ chọn bằng nút "Chọn"
  // (bàn phím/chuột) HOẶC nhấn giữ một dòng (điện thoại, "quen từ Zalo/ảnh").
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Sống ngoài BulkSelectionBar CỐ Ý: thoát chế độ chọn unmount thanh hành
  // động, nếu hộp kết quả nằm trong đó thì cũng biến mất theo — đã bắt bằng
  // tay lúc kiểm live (bấm "Giao cho…" xong, hộp "Xong/Lỗi" chưa kịp thấy).
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const startLongPress = (id: string) => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setSelectMode(true);
      setSelectedIds((prev) => new Set(prev).add(id));
    }, MOBILE_LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };
  /** true = long-press vừa tự chọn dòng này rồi, click theo sau KHÔNG được bấm lại (tránh bỏ chọn ngay dòng vừa chọn). */
  const consumeLongPressClick = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return true;
    }
    return false;
  };

  // Debounce 300ms: gõ xong mới query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const normalizedQ = normalizeSearch(debouncedQ);
  const customFilterKey = JSON.stringify(customFilter);
  const isInitialState =
    normalizedQ === normalizeSearch(initialQ) &&
    sourceId === null &&
    tier === null &&
    inactiveDays === null &&
    tagId === null &&
    customFilterKey === "{}" &&
    tab === "all" &&
    sort === "recent";

  const contactsQuery = useInfiniteQuery({
    queryKey: [
      "contacts",
      normalizedQ,
      sourceId,
      tier,
      inactiveDays,
      tagId,
      customFilterKey,
      tab,
      sort,
    ],
    queryFn: ({ pageParam }) =>
      fetchContactsPage(
        supabase,
        {
          q: debouncedQ,
          sourceId,
          tier,
          inactiveDays,
          tagId,
          custom: customFilter,
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
  const inactiveDaysName = inactiveDays
    ? t("inactiveDaysFilter.days", { days: inactiveDays })
    : t("inactiveDaysFilter.all");
  const tagName = tagId
    ? (tags.find((tg) => tg.id === tagId)?.name ?? t("tagFilter.fallback"))
    : t("tagFilter.all");
  const hasCustomFilter = Object.keys(customFilter).length > 0;
  const hasFilter =
    normalizedQ !== "" ||
    sourceId !== null ||
    tier !== null ||
    inactiveDays !== null ||
    tagId !== null ||
    hasCustomFilter ||
    tab === "mine";
  // Phần "có gì để lưu thành chip" KHÔNG tính tab: "của tôi" không nằm trong
  // vốn từ ĐÓNG (mục 36.9F) nên không nằm trên URL, saved_views không lưu được.
  const hasSavableFilter =
    normalizedQ !== "" ||
    sourceId !== null ||
    tier !== null ||
    inactiveDays !== null ||
    tagId !== null ||
    hasCustomFilter;
  const describeCurrentContactsFilter = () => {
    const parts: string[] = [];
    if (debouncedQ.trim()) parts.push(`"${debouncedQ.trim()}"`);
    if (sourceId) parts.push(sourceName);
    if (tier) parts.push(t(`tier.${tier}`));
    if (inactiveDays) parts.push(t("inactiveDaysFilter.summary", { days: inactiveDays }));
    if (tagId) parts.push(tagName);
    for (const f of filterableCustomFields) {
      const v = customFilter[f.key];
      if (v) parts.push(`${f.label}: ${v}`);
    }
    return parts.join(" · ");
  };

  // File xuất bám đúng bộ lọc đang bật trên màn hình
  const exportCurrentView = () =>
    startExport(async () => {
      const res = await exportContactsXlsx({
        q: debouncedQ,
        sourceId,
        tier,
        inactiveDays,
        tagId,
        custom: customFilter,
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
          <h1 className="mr-2 hidden text-sm font-semibold sm:block">
            {contactLabel ? capitalizeFirst(contactLabel) : t("title")}
          </h1>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-8"
            />
          </div>
          {/* Đường 1 vào chế độ chọn: nút thấy được ở header (thẻ design
              man-chon-nhieu.html — "phải có HAI đường, vì điện thoại không
              có rê chuột"). Đường 2 là nhấn giữ một dòng, xem bên dưới. */}
          {selectMode ? (
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <span className="font-semibold text-primary">
                {t("bulk.selectedCount", { count: selectedIds.size })}
              </span>
              <button
                type="button"
                onClick={exitSelectMode}
                className="text-primary underline underline-offset-2"
              >
                {t("bulk.clear")}
              </button>
            </div>
          ) : (
            // Chọn nhiều chỉ để LÀM hàng loạt (gán người phụ trách, gắn nhãn,
            // xoá) — vai Chỉ xem không làm được cái nào, bày nút ra là ngõ cụt.
            canWrite && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setSelectMode(true)}
              >
                {t("bulk.enter")}
              </Button>
            )
          )}
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
        {/* "Chưa quay lại N ngày" (mục 36.7) — chiều lọc bắt buộc để bộ lọc
            lưu sẵn có giá trị thật, không chỉ để trang trí. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Clock className="size-4" />
              {inactiveDaysName}
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t("inactiveDaysFilter.label")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setInactiveDays(null)}>
              {t("inactiveDaysFilter.all")}
              {inactiveDays === null && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
            {INACTIVE_DAYS_OPTIONS.map((days) => (
              <DropdownMenuItem key={days} onSelect={() => setInactiveDays(days)}>
                {t("inactiveDaysFilter.days", { days })}
                {inactiveDays === days && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Lọc theo nhãn — nốt lại phần bỏ sót ở task #79 (CSDL đã hiểu tham
            số `tag` từ trước, chỉ thiếu ô lọc). */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <TagIcon className="size-4" />
              <span className="max-w-24 truncate md:max-w-none">{tagName}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t("tagFilter.label")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setTagId(null)}>
              {t("tagFilter.all")}
              {tagId === null && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
            {tags.length === 0 ? (
              <DropdownMenuItem disabled>{t("tagFilter.empty")}</DropdownMenuItem>
            ) : (
              tags.map((tg) => (
                <DropdownMenuItem key={tg.id} onSelect={() => setTagId(tg.id)}>
                  {tg.name}
                  {tagId === tg.id && <Check className="ml-auto size-4" />}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Trường tùy biến pack khai "cho lọc" (24o) — tự mọc thêm vào bảng
            lọc, viền xanh phân biệt với 3 ô lọc cố định (thẻ design
            man-bang-loc.html). Tiệm pack khác không khai field nào thì mảng
            rỗng, không render gì thêm. */}
        {filterableCustomFields.map((f) => (
          <CustomFieldFilterInput
            key={f.key}
            field={f}
            value={customFieldQuery[`cf_${f.key}`] ?? null}
            onCommit={(v) => setCustomFieldQuery({ [`cf_${f.key}`]: v })}
          />
        ))}
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
            {/* Vai "Chỉ xem" KHÔNG tải file được: vai đó thấy danh bạ CẢ TIỆM
                kèm số điện thoại, nhưng được đặt ra để xem chứ không phải để
                mang đi — một cú bấm là cả danh bạ nằm trên máy cá nhân, ngoài
                mọi chốt chặn. Chốt thật nằm ở `exportContactsXlsx`; đây chỉ là
                lớp không-bày-nút-chết. `canWrite` chính là "không phải viewer". */}
            {canWrite && (
              <DropdownMenuItem onSelect={exportCurrentView}>
                <Download className="size-4" />
                {t("importExport.exportAction")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {canWrite && (
          <Button size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("addNew")}
          </Button>
        )}
        </div>
        {/* Chip bộ lọc lưu sẵn (24p) — ngay dưới ô tìm/hàng lọc, trên danh
            sách (thẻ design man-bo-loc-luu-san.html). */}
        <SavedViewChips
          screen="contacts"
          hasActiveFilter={hasSavableFilter}
          describeCurrentFilter={describeCurrentContactsFilter}
        />
      </div>

      {/* Trần 500 nói ra NGAY LÚC CHỌN, không đợi bấm hành động (thẻ design
          man-chon-nhieu.html) — cắt thầm = người dùng tưởng đã làm hết. */}
      {selectMode && selectedIds.size > MAX_BULK && (
        <div className="shrink-0 border-b border-amber-600/40 bg-amber-50 px-4 py-2.5 dark:bg-amber-950/30">
          <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
            {t("bulk.capTitle", { count: selectedIds.size, max: MAX_BULK })}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            {t("bulk.capBody")}
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {contactsQuery.isPending ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-2/3" />
          </div>
        ) : contactsQuery.isError ? (
          // Việc #169 nối tiếp: TẢI HỎNG khác hẳn "chưa có khách hàng nào".
          // `fetchContactsPage` ném lỗi thật khi query hỏng — trước đây `rows`
          // rỗng lại rơi vào đúng nhánh màn-trống-với-nút-Thêm-khách, chủ tiệm
          // tưởng mất sạch danh sách khách rồi có thể tạo trùng.
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <TileContact className="size-16" />
            <p className="max-w-sm text-sm text-destructive">{t("loadFailed")}</p>
            <Button variant="outline" onClick={() => contactsQuery.refetch()}>
              {t("retry")}
            </Button>
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
                  {canWrite && (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="size-4" />
                      {t(ownContactsOnly ? "addNew" : "empty.cta")}
                    </Button>
                  )}
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
                  onPointerDown={() => startLongPress(c.id)}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
                >
                  {selectMode && (
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      aria-label={t("bulk.selectRow", { name: c.full_name })}
                      className="shrink-0"
                    />
                  )}
                  <Link
                    href={`/app/contacts/${c.id}`}
                    prefetch={false}
                    onClick={(e) => {
                      const suppressToggle = consumeLongPressClick();
                      if (selectMode) {
                        e.preventDefault();
                        if (!suppressToggle) toggleSelect(c.id);
                      }
                    }}
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
                  {c.phone && !selectMode && (
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
                  {selectMode && (
                    <th className="w-10 px-4 font-medium">
                      <Checkbox
                        checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const allSelected = rows.every((r) => prev.has(r.id));
                            const next = new Set(prev);
                            rows.forEach((r) => (allSelected ? next.delete(r.id) : next.add(r.id)));
                            return next;
                          });
                        }}
                        aria-label={t("bulk.selectAll")}
                      />
                    </th>
                  )}
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
                  {/* Trường tùy biến pack khai "cho lên cột" (24o) — tự mọc
                      thêm cột, tiệm pack khác không khai thì không thấy. */}
                  {listableCustomFields.map((f) => (
                    <th key={f.key} className="hidden px-4 font-medium xl:table-cell">
                      {f.label}
                    </th>
                  ))}
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
                    onClick={() => {
                      if (selectMode) toggleSelect(c.id);
                      else router.push(`/app/contacts/${c.id}`);
                    }}
                    className="h-11 cursor-pointer border-b transition-colors hover:bg-muted/50"
                  >
                    {selectMode && (
                      <td className="px-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          aria-label={t("bulk.selectRow", { name: c.full_name })}
                        />
                      </td>
                    )}
                    <td className="px-4">
                      {/* Link thật: bàn phím/screen reader vào được, row onClick chỉ là tiện chuột */}
                      <Link
                        href={`/app/contacts/${c.id}`}
                        prefetch={false}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectMode) {
                            e.preventDefault();
                            toggleSelect(c.id);
                          }
                        }}
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
                    {listableCustomFields.map((f) => (
                      <td key={f.key} className="hidden max-w-40 truncate px-4 xl:table-cell">
                        {/* Ô trống vẽ dấu gạch, KHÔNG để trắng — trắng làm
                            người đọc tưởng bảng hỏng (thẻ design man-bang-loc.html). */}
                        {c.custom?.[f.key] || <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
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

      {/* Dính đáy TRÊN thanh điều hướng của khung /app (không đè — đúng bài
          học 11/08), chỉ hiện khi thật sự có dòng đang chọn. */}
      {selectMode && selectedIds.size > 0 && (
        <BulkSelectionBar
          selectedIds={selectedIds}
          canAssignOwner={canAssignOwner}
          memberNames={memberNames}
          onResult={(r) => {
            setBulkResult(r);
            exitSelectMode();
            contactsQuery.refetch();
          }}
        />
      )}
      <BulkResultDialog
        result={bulkResult}
        rows={rows}
        onOpenChange={(o) => !o && setBulkResult(null)}
      />

      <ContactFormDialog
        mode="create"
        open={createDialogOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o && newName) setNewName(null);
        }}
        leadSources={leadSources}
        customFields={customFields}
        initialValues={
          newName
            ? { fullName: newName, phone: "", email: "", sourceId: null, companyId: null, referredByContactId: null }
            : undefined
        }
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
