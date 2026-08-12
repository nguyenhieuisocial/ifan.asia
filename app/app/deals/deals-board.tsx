"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronRight,
  Flame,
  MoreHorizontal,
  Plus,
  Search,
  ThumbsDown,
  Trophy,
} from "lucide-react";
import { SavedViewChips } from "@/components/saved-views/saved-view-chips";
import { TileChart } from "@/components/illustrations/tile-chart";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import { capitalizeFirst } from "@/lib/tenant-pack";
import type { Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/client";
import { ownerLabel, type MemberNames } from "../contacts/types";
import { loseDeal, moveDealStage, scheduleWinFollowup, winDeal } from "./actions";
import { fetchStageDeals, searchBoardDeals } from "./queries";
import { DealFormDialog, tomorrowVN, type DealFormValues } from "./deal-form-dialog";
import { LoseDealDialog, WinDealDialog, WinFollowupDialog } from "./close-deal-dialogs";
import {
  daysInStage,
  forecastValue,
  needsNextAction,
  STAGE_KIND_BADGE,
  sumValue,
  type BoardData,
  type DealRow,
  type MemberOption,
  type PipelineStage,
} from "./types";

/** Điểm lead từ mức này coi là khách "nóng" (spec CRM V1). */
const HOT_SCORE = 70;

type Props = {
  currentUserId: string;
  memberNames: MemberNames;
  members: MemberOption[];
  canAssignOthers: boolean;
  board: BoardData;
  /** Bước 2 "hẹn chăm lại" sau khi thắng — CHỈ true khi playbook win_followup tắt (B11). */
  winFollowupManual: boolean;
  /** Khung nav theo pack (mục 35.1 việc 8): tên gọi "cơ hội" theo ngành đang chọn — chưa chọn ngành thì dùng chuỗi mặc định t("title"). */
  dealLabel?: string;
  /** ?q= đọc sẵn từ searchParams phía server (page.tsx) — CẦN để SSR và bản
   *  dựng đầu tiên trên trình duyệt khớp nhau. Thiếu prop này thì SSR luôn
   *  dựng bằng "" (server không đọc được URL trình duyệt), còn trình duyệt
   *  dựng đúng bằng giá trị thật trên URL → hai bản KHÁC NHAU, React coi là
   *  lỗi "hydration" và có khi bỏ dở việc sửa lại, kẹt luôn ở bản SSR sai
   *  (đã thấy: lọc không có tác dụng dù URL có ?q=/&needs_action=1). Cùng
   *  nguyên do màn Khách (contacts-shell.tsx) đã truyền initialQ. */
  initialQ?: string;
  /** ?needs_action=1 đọc sẵn từ server — cùng lý do trên. */
  initialNeedsAction?: boolean;
};

export function DealsBoard({
  currentUserId,
  memberNames,
  members,
  canAssignOthers,
  board,
  winFollowupManual,
  dealLabel,
  initialQ = "",
  initialNeedsAction = false,
}: Props) {
  const t = useTranslations("deals");
  const tCommon = useTranslations("common");
  const tContacts = useTranslations("contacts");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);

  // Nguồn sự thật khi kéo-thả = state cục bộ (optimistic); server revalidate xong
  // props đổi thì đồng bộ lại NGAY TRONG RENDER (mẫu "adjusting state on prop
  // change" của React — không dùng effect để tránh render thừa).
  const [deals, setDeals] = useState<DealRow[]>(board.deals);
  const [syncedFrom, setSyncedFrom] = useState(board.deals);
  if (syncedFrom !== board.deals) {
    setSyncedFrom(board.deals);
    // Giữ lại các thẻ người dùng đã bấm "Tải thêm": server chỉ trả trang đầu,
    // vứt chúng đi thì cột tự co lại sau mỗi lần kéo-thả.
    setDeals((prev) => {
      const fresh = new Set(board.deals.map((d) => d.id));
      return [...board.deals, ...prev.filter((d) => !fresh.has(d.id))];
    });
  }

  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  // Bộ lọc nằm trên URL (luật luồng 4 + mục 36.9F — vốn từ ĐÓNG cho màn này):
  // ?q= và ?needs_action=1, cùng mẫu nuqs với màn Khách (?source=/?tier=/?sort=).
  // Chưa làm thì chip bộ lọc lưu sẵn (24p) không gắn được cho màn này (mục 36.3
  // bước 2). "1 | vắng" — KHÔNG lưu "false" khi tắt, xoá hẳn param.
  // withDefault("1") CHỈ gắn khi server đã thấy needs_action=1 thật trên URL —
  // gắn vô điều kiện thì lọc sẽ bật ép luôn cả khi URL không có tham số này.
  const needsActionParser = parseAsStringLiteral(["1"] as const);
  const [needsAction, setNeedsAction] = useQueryState(
    "needs_action",
    initialNeedsAction ? needsActionParser.withDefault("1") : needsActionParser,
  );
  const onlyNeedsAction = needsAction === "1";

  // Ô tìm cơ hội theo tên cơ hội + tên khách. Hoãn 300ms như Hộp thư để mỗi
  // phím gõ không thành một lượt hỏi CSDL.
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(initialQ));
  // Khởi tạo TỪ search (không phải ""): có sẵn ?q= trên URL (mở lại chip đã lưu)
  // thì khỏi chờ thêm 300ms debounce mới bắt đầu lọc.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);
  // "Có gì để lưu thành chip" — chỉ 2 tham số đã đẩy lên URL thật (q,
  // needs_action); stage/owner/sort còn "mới" ở mục 36.9F (chưa có UI lọc
  // tương ứng), không tính vào đây.
  const hasSavableFilter = search.trim() !== "" || onlyNeedsAction;
  const describeCurrentDealsFilter = () => {
    const parts: string[] = [];
    if (search.trim()) parts.push(`"${search.trim()}"`);
    if (onlyNeedsAction) parts.push(t("filterNeedsAction"));
    return parts.join(" · ");
  };

  // id các thẻ khớp từ khoá (null = không tìm → bảng giữ nguyên trạng). Tìm
  // chạy TRONG CSDL như Hộp thư — thẻ khớp nằm ngoài trần BOARD_DEAL_LIMIT vẫn
  // ra — rồi TRỘN kết quả vào state `deals` chung: kéo-thả/sửa trên thẻ tìm
  // được dùng đúng bộ máy optimistic sẵn có, không cần nhánh riêng.
  const [matchedIds, setMatchedIds] = useState<Set<string> | null>(null);
  // Ô trống → bỏ lọc NGAY TRONG RENDER (mẫu "adjusting state" như khối đồng bộ
  // board.deals ở trên) — không setState đồng bộ trong effect (lint cấm).
  if (!debouncedSearch.trim() && matchedIds !== null) setMatchedIds(null);
  useEffect(() => {
    if (!debouncedSearch.trim()) return;
    let cancelled = false; // gõ tiếp thì lượt hỏi cũ về muộn không đè lượt mới
    searchBoardDeals(supabase, board.pipeline.id, debouncedSearch)
      .then((rows) => {
        if (cancelled) return;
        setDeals((prev) => {
          const seen = new Set(prev.map((d) => d.id));
          return [...prev, ...rows.filter((d) => !seen.has(d.id))];
        });
        setMatchedIds(new Set(rows.map((d) => d.id)));
      })
      // Lỗi mạng: giữ nguyên bảng đang bày — thà không lọc còn hơn bày
      // "không khớp" giả trong khi thẻ vẫn có thật.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, supabase, board.pipeline.id]);
  const [dragDealId, setDragDealId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DealRow | null>(null);
  const [winTarget, setWinTarget] = useState<{ deal: DealRow; stageId: string } | null>(null);
  // Bước 2 sau khi thắng: hẹn ngày chăm lại (chỉ dùng khi winFollowupManual)
  const [followupTarget, setFollowupTarget] = useState<DealRow | null>(null);
  const [loseTarget, setLoseTarget] = useState<{ deal: DealRow; stageId: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const openStages = useMemo(
    () => board.stages.filter((s) => s.kind === "open"),
    [board.stages],
  );
  const wonStage = board.stages.find((s) => s.kind === "won") ?? null;
  const lostStage = board.stages.find((s) => s.kind === "lost") ?? null;

  // MỌI con số của bảng lấy từ CSDL (RPC deal_board_stats) chứ không đếm trên
  // tập thẻ đã tải: bảng chỉ tải BOARD_DEAL_LIMIT thẻ nên đếm tại chỗ sẽ đứng
  // yên ở trần đó mà không có dấu hiệu gì. Chỉ khi RPC không trả được mới lùi về
  // đếm trên tập đã tải — thà số nhỏ hơn thật còn hơn trang trắng.
  const stats = board.stats;
  // Đang tìm thì chỉ bày thẻ khớp từ khoá; hai con số TIỀN trên đầu bảng vẫn là
  // của CẢ bảng (CSDL đếm) — chúng mô tả bảng, không phải kết quả tìm.
  const searching = matchedIds !== null;
  const searchDeals = matchedIds
    ? deals.filter((d) => matchedIds.has(d.id))
    : deals;
  const visibleDeals = onlyNeedsAction
    ? searchDeals.filter((d) => needsNextAction(d))
    : searchDeals;
  const needsActionCount =
    stats?.needs_action ?? deals.filter((d) => needsNextAction(d)).length;
  // Hiện CẢ HAI số: tổng thật của các thẻ đang mở VÀ con số dự báo. Chỉ đưa mỗi
  // dự báo thì chủ tiệm cộng nhẩm các cột rồi kết luận phần mềm cộng sai — dự báo
  // luôn NHỎ HƠN tổng vì đã nhân tỉ lệ thắng của từng bước.
  const openTotal = stats?.open_total ?? sumValue(deals.filter((d) => d.status === "open"));
  const forecast = stats?.forecast ?? forecastValue(deals, board.stages);

  /** Nạp trang thẻ kế tiếp của một cột. Con số của cột đã đúng sẵn, đây chỉ là
   *  bày thêm thẻ cho khớp con số đó. */
  const loadMoreStage = (stageId: string, offset: number) => {
    if (loadingStage) return;
    setLoadingStage(stageId);
    fetchStageDeals(supabase, board.pipeline.id, stageId, offset)
      .then((rows) =>
        setDeals((prev) => {
          const seen = new Set(prev.map((d) => d.id));
          return [...prev, ...rows.filter((d) => !seen.has(d.id))];
        }),
      )
      // Nạp hụt thì cột giữ nguyên VÀ nút "Tải thêm" vẫn còn đó để bấm lại — con
      // số của cột vẫn là số thật nên không có gì bị giấu.
      .catch(() => {})
      .finally(() => setLoadingStage(null));
  };

  const patchDeal = (dealId: string, patch: Partial<DealRow>) =>
    setDeals((rows) => rows.map((d) => (d.id === dealId ? { ...d, ...patch } : d)));

  /** Kéo sang cột MỞ: đổi ngay trên UI, server lỗi thì hoàn lại. */
  const runMove = (deal: DealRow, stage: PipelineStage) => {
    const snapshot = deals;
    patchDeal(deal.id, {
      stage_id: stage.id,
      status: "open",
      lost_reason_id: null,
      stage_entered_at: new Date().toISOString(),
    });
    startTransition(async () => {
      const res = await moveDealStage(deal.id, stage.id);
      if (res.error) {
        setDeals(snapshot);
        toast.error(res.error);
      }
    });
  };

  const runWin = (deal: DealRow, stageId: string, valueVnd: number) => {
    const snapshot = deals;
    setWinTarget(null);
    patchDeal(deal.id, {
      stage_id: stageId,
      status: "won",
      value_vnd: valueVnd,
      stage_entered_at: new Date().toISOString(),
    });
    startTransition(async () => {
      const res = await winDeal(deal.id, stageId, valueVnd);
      if (res.error) {
        setDeals(snapshot);
        toast.error(res.error);
        return;
      }
      toast.success(t("toasts.won"));
      // Bước 2 (B11): playbook win_followup tắt thì mời hẹn ngày chăm lại bằng tay
      if (winFollowupManual) setFollowupTarget(deal);
    });
  };

  /** Bước 2: ghi việc hỏi thăm có hạn vào hồ sơ khách; lỗi thì giữ dialog để thử lại. */
  const runFollowup = (deal: DealRow, dueDate: string) => {
    startTransition(async () => {
      const res = await scheduleWinFollowup(deal.id, dueDate);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setFollowupTarget(null);
      toast.success(t("toasts.followupScheduled"));
    });
  };

  const runLose = (deal: DealRow, stageId: string, reasonId: string, note: string) => {
    const snapshot = deals;
    setLoseTarget(null);
    patchDeal(deal.id, {
      stage_id: stageId,
      status: "lost",
      lost_reason_id: reasonId,
      stage_entered_at: new Date().toISOString(),
    });
    startTransition(async () => {
      const res = await loseDeal(deal.id, stageId, reasonId, note || undefined);
      if (res.error) {
        setDeals(snapshot);
        toast.error(res.error);
        return;
      }
      toast.success(t("toasts.lost"));
    });
  };

  /** Điểm vào chung cho cả kéo-thả lẫn menu "Chuyển sang" (mobile/bàn phím). */
  const moveTo = (deal: DealRow, stage: PipelineStage) => {
    if (deal.stage_id === stage.id && deal.status !== "open") return;
    if (stage.kind === "won") {
      setWinTarget({ deal, stageId: stage.id });
      return;
    }
    if (stage.kind === "lost") {
      setLoseTarget({ deal, stageId: stage.id });
      return;
    }
    if (deal.stage_id === stage.id) return;
    runMove(deal, stage);
  };

  /** id thẻ lấy từ dataTransfer (chuẩn HTML5) — state chỉ là dự phòng. */
  const handleDrop = (stage: PipelineStage, droppedId: string) => {
    setOverStageId(null);
    const deal = deals.find((d) => d.id === (droppedId || dragDealId));
    setDragDealId(null);
    if (deal) moveTo(deal, stage);
  };

  const emptyValues = (): DealFormValues => ({
    title: "",
    contactId: "",
    value: "",
    expectedCloseDate: "",
    stageId: openStages[0]?.id ?? "",
    ownerId: currentUserId,
    nextActionDate: tomorrowVN(),
    nextActionNote: "",
  });

  const editValues = (deal: DealRow): DealFormValues => ({
    title: deal.title,
    contactId: deal.contact_id,
    value: String(deal.value_vnd),
    expectedCloseDate: deal.expected_close_date ?? "",
    stageId:
      deal.status === "open" ? deal.stage_id : (openStages[0]?.id ?? deal.stage_id),
    ownerId: deal.owner_id,
    nextActionDate: deal.next_action_at
      ? deal.next_action_at.slice(0, 10)
      : tomorrowVN(),
    nextActionNote: deal.next_action_note ?? "",
  });

  // Hàm render (không phải component lồng) — thẻ giữ nguyên định danh giữa các
  // lần render nên thao tác kéo không bị hủy giữa chừng.
  const renderCard = (deal: DealRow) => {
    const warn = needsNextAction(deal);
    const contactName = deal.contacts?.full_name ?? tContacts("owner.unassigned");
    const owner = ownerLabel(deal.owner_id, currentUserId, tContacts, memberNames);
    const age = daysInStage(deal);

    return (
      <article
        key={deal.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", deal.id);
          e.dataTransfer.effectAllowed = "move";
          setDragDealId(deal.id);
        }}
        onDragEnd={() => {
          setDragDealId(null);
          setOverStageId(null);
        }}
        className={cn(
          "cursor-grab space-y-2 rounded-lg border bg-card p-2.5 transition-colors active:cursor-grabbing",
          dragDealId === deal.id && "opacity-50",
        )}
      >
        <div className="flex items-start gap-1.5">
          {/* draggable={false}: thẻ vẫn là thứ được kéo, link không cướp thao tác kéo */}
          <Link
            href={`/app/deals/${deal.id}`}
            prefetch={false}
            draggable={false}
            className="min-w-0 flex-1 text-[13px] leading-snug font-medium break-words hover:underline"
          >
            {deal.title}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("card.menuAria", { deal: deal.title })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/app/deals/${deal.id}`}>{t("card.openDeal")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditing(deal)}>
                {t("card.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/app/contacts/${deal.contact_id}`}>
                  {t("card.openContact")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("card.moveTo")}</DropdownMenuLabel>
              {openStages
                .filter((s) => s.id !== deal.stage_id || deal.status !== "open")
                .map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => moveTo(deal, s)}>
                    {s.name}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              {wonStage && (
                <DropdownMenuItem onSelect={() => moveTo(deal, wonStage)}>
                  <Trophy className="size-4" />
                  {t("card.markWon")}
                </DropdownMenuItem>
              )}
              {lostStage && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => moveTo(deal, lostStage)}
                >
                  <ThumbsDown className="size-4" />
                  {t("card.markLost")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link
            href={`/app/contacts/${deal.contact_id}`}
            prefetch={false}
            className="min-w-0 truncate hover:text-foreground hover:underline"
          >
            {contactName}
          </Link>
          {(deal.contacts?.lead_score ?? 0) >= HOT_SCORE && (
            <Badge
              className="shrink-0 gap-0.5 bg-destructive/10 px-1.5 text-destructive"
              title={t("card.hotTooltip")}
            >
              <Flame className="size-3" />
              {deal.contacts?.lead_score}
            </Badge>
          )}
        </p>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">
            {formatMoney(deal.value_vnd, locale)}
          </span>
          <Avatar className="size-5" title={owner}>
            <AvatarFallback className="text-[10px]">
              {(owner[0] ?? "?").toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* CHỈ đơn đang mở mới nhắc việc kế tiếp. Đơn đã chốt/đã thua mà vẫn
              đeo "quá hạn" kèm một ngày từ tháng trước là nhắc một việc không
              còn tồn tại — và làm loãng cảnh báo của những đơn thật sự trễ.
              (Dòng tuổi thẻ bên dưới đã gác đúng như vậy từ trước.) */}
          {deal.status === "open" &&
            (warn ? (
              <Badge className="gap-1 bg-destructive/10 text-destructive">
                <AlertTriangle className="size-3" />
                {deal.next_action_at ? t("card.overdue") : t("card.noNextAction")}
              </Badge>
            ) : deal.next_action_at ? (
              <span className="text-xs text-muted-foreground">
                {t("card.nextAction", { date: formatDate(deal.next_action_at, locale) })}
              </span>
            ) : null)}
          {deal.status === "open" && age > 0 && (
            <span className="text-xs text-muted-foreground">
              {t("card.age", { days: age })}
            </span>
          )}
        </div>
      </article>
    );
  };

  const hasDeals = deals.length > 0;

  // Ở 1440px bảng còn ~550px nằm ngoài khung mà không có dấu hiệu nào: hai cột
  // cuối (Quay lại, Thua) coi như không tồn tại với người mới. Bám mép nào còn
  // cuộn được thì phủ một dải mờ + mũi tên ở đúng mép đó.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const syncEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft < max - 4;
    setEdges((cur) => (cur.left === left && cur.right === right ? cur : { left, right }));
  }, []);

  // Bước cuộn đo từ khoảng cách giữa hai cột thật, không ghim 280px: đổi bề
  // ngang cột hay khoảng cách trong bản thiết kế thì nút vẫn nhảy đúng một cột.
  const scrollOneStage = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cols = el.firstElementChild?.children;
    const first = cols?.[0] as HTMLElement | undefined;
    const second = cols?.[1] as HTMLElement | undefined;
    const step =
      first && second
        ? second.offsetLeft - first.offsetLeft
        : (first?.offsetWidth ?? el.clientWidth);
    el.scrollBy({ left: step, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncEdges();
    // Đổi bề ngang cửa sổ, mở/đóng thanh bên, hay đổi số cột đều phải tính lại
    const ro = new ResizeObserver(syncEdges);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [syncEdges, hasDeals, onlyNeedsAction, board.stages.length, deals.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 text-sm font-semibold">
          {dealLabel ? capitalizeFirst(dealLabel) : t("title")}
        </h1>
        {/* Hai con số này là TIỀN — thứ chủ tiệm mở màn Cơ hội để xem. Trước đó
            in 12px xám nhạt, nhỏ hơn cả giá trên từng thẻ, nên tổng cả bảng lại
            chìm hơn một dòng lẻ. Số in đậm màu chữ thường, nhãn mới để nhạt. */}
        <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            {t.rich("openTotal", {
              value: formatMoney(openTotal, locale),
              b: (c) => (
                <span className="text-[15px] font-semibold text-foreground tabular-nums">
                  {c}
                </span>
              ),
            })}
          </span>
          <span aria-hidden>·</span>
          <span>
            {t.rich("forecast", {
              value: formatMoney(Math.round(forecast), locale),
              b: (c) => (
                <span className="text-[15px] font-semibold text-foreground tabular-nums">
                  {c}
                </span>
              ),
            })}
          </span>
        </p>
        {/* Nhóm 2 nút để ở mobile chúng xuống dòng CÙNG NHAU, không tách rời */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Tìm ngay tại bảng: tiệm chạy vài tháng là không cuộn nổi 500 thẻ
              để mò một đơn — gõ tên khách/tên cơ hội, thẻ khớp hiện đúng cột. */}
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-8 w-44 pl-8 sm:w-64"
            />
          </div>
          <Button
            variant={onlyNeedsAction ? "default" : "outline"}
            size="sm"
            aria-pressed={onlyNeedsAction}
            onClick={() => setNeedsAction(onlyNeedsAction ? null : "1")}
          >
            <AlertTriangle className="size-4" />
            {/* Hiện chữ cả trên điện thoại: chỉ còn tam giác + con số thì không
                ai đoán ra nút này lọc cái gì. Hàng nút vốn đã tự xuống dòng. */}
            <span>{t("filterNeedsAction")}</span>
            <Badge variant="secondary">{needsActionCount}</Badge>
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={openStages.length === 0}
          >
            <Plus className="size-4" />
            {t("addNew")}
          </Button>
        </div>
      </div>
        {/* Chip bộ lọc lưu sẵn (24p) — ngay dưới hàng lọc, trên bảng Kanban
            (thẻ design man-bo-loc-luu-san.html). */}
        <SavedViewChips
          screen="deals"
          hasActiveFilter={hasSavableFilter}
          describeCurrentFilter={describeCurrentDealsFilter}
        />
      </div>

      {!hasDeals && !onlyNeedsAction ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
          <TileChart className="size-16" />
          <h2 className="text-base font-semibold">{t("empty.title")}</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("empty.description")}
          </p>
          <Button onClick={() => setCreateOpen(true)} disabled={openStages.length === 0}>
            <Plus className="size-4" />
            {t("empty.cta")}
          </Button>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={syncEdges}
            className="h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
          >
          <div className="flex h-full gap-3 p-3">
            {board.stages.map((stage) => {
              const stageDeals = visibleDeals.filter((d) => d.stage_id === stage.id);
              const allStageDeals = deals.filter((d) => d.stage_id === stage.id);
              // Con số của cột = CSDL đếm; số thẻ đang bày có thể ít hơn vì bảng
              // có trần tải. Chênh nhau ⇒ bày nút "Tải thêm", không im lặng.
              // ĐANG TÌM: đếm trên kết quả tìm của cột — thẻ bày 1 mà badge ghi
              // 12 thì trông như hỏng; "Tải thêm" cũng tắt vì danh sách khớp đã
              // tải trọn một lượt, không còn trang sau.
              const searchStageDeals = searching
                ? searchDeals.filter((d) => d.stage_id === stage.id)
                : null;
              const stageStat = stats?.stages[stage.id];
              const stageCount = searchStageDeals
                ? searchStageDeals.length
                : (stageStat?.n ?? allStageDeals.length);
              const stageTotal = searchStageDeals
                ? sumValue(searchStageDeals)
                : (stageStat?.total ?? sumValue(allStageDeals));
              const hasMore = !searching && allStageDeals.length < stageCount;
              return (
                <section
                  key={stage.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overStageId !== stage.id) setOverStageId(stage.id);
                  }}
                  onDragLeave={() =>
                    setOverStageId((cur) => (cur === stage.id ? null : cur))
                  }
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(stage, e.dataTransfer.getData("text/plain"));
                  }}
                  className={cn(
                    "flex w-[280px] shrink-0 snap-start flex-col rounded-lg border bg-muted/30 transition-colors",
                    overStageId === stage.id && "border-primary bg-primary-tint",
                  )}
                >
                  <header className="shrink-0 space-y-1 border-b px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                        {stage.name}
                      </span>
                      <Badge className={cn("font-semibold", STAGE_KIND_BADGE[stage.kind])}>
                        {stageCount}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(stageTotal, locale)}
                    </p>
                    {/* Cột Thắng/Thua cộng dồn TỪ TRƯỚC TỚI NAY, không theo bộ lọc
                        thời gian của Tổng quan — phải tự khai, nếu không chủ tiệm
                        so "Doanh thu 7 ngày" với cột này rồi tưởng phần mềm sai. */}
                    {stage.kind !== "open" && (
                      <p className="text-[11px] text-muted-foreground">
                        {t("column.allTime")}
                      </p>
                    )}
                  </header>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                    {stageDeals.length === 0 ? (
                      <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                        {/* Đang tìm mà cột rỗng thì nói RÕ là không khớp từ
                            khoá — "Kéo thẻ vào đây" lúc này là câu lạc đề. */}
                        {searching
                          ? t("column.emptySearch")
                          : onlyNeedsAction
                            ? t("column.emptyFiltered")
                            : t("column.empty")}
                      </p>
                    ) : (
                      stageDeals.map((deal) => renderCard(deal))
                    )}
                    {hasMore && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={loadingStage !== null}
                        onClick={() => loadMoreStage(stage.id, allStageDeals.length)}
                      >
                        {loadingStage === stage.id
                          ? tCommon("loading")
                          : tCommon("loadMore")}
                      </Button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          </div>
          {/* Dải mờ báo còn cột bên phải. Ở 375px cột kế chỉ hở ~70px nên dải
              phải hẹp lại, không thì nó phủ trắng đúng phần hé ra đó. */}
          {edges.right && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-background via-background/85 to-transparent sm:w-20"
              />
              {/* Trông như nút thì phải bấm được: cuộn sang đúng cột kế tiếp */}
              <button
                type="button"
                aria-label={t("scrollNextAria")}
                onClick={scrollOneStage}
                className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-md"
              >
                <ChevronRight className="size-5 text-foreground" />
              </button>
            </>
          )}
          {edges.left && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-background to-transparent"
            />
          )}
        </div>
      )}

      {createOpen && (
        <DealFormDialog
          mode="create"
          open={createOpen}
          onOpenChange={setCreateOpen}
          initialValues={emptyValues()}
          openStages={openStages}
          members={members}
          canAssignOthers={canAssignOthers}
        />
      )}
      {editing && (
        <DealFormDialog
          mode="edit"
          open
          onOpenChange={(o) => !o && setEditing(null)}
          dealId={editing.id}
          initialValues={editValues(editing)}
          openStages={openStages}
          members={members}
          canAssignOthers={canAssignOthers}
          stageLocked={editing.status !== "open"}
        />
      )}
      {winTarget && (
        <WinDealDialog
          open
          dealTitle={winTarget.deal.title}
          initialValue={winTarget.deal.value_vnd}
          pending={pending}
          onCancel={() => setWinTarget(null)}
          onConfirm={(value) => runWin(winTarget.deal, winTarget.stageId, value)}
        />
      )}
      {followupTarget && (
        <WinFollowupDialog
          open
          dealTitle={followupTarget.title}
          pending={pending}
          onSkip={() => setFollowupTarget(null)}
          onConfirm={(dueDate) => runFollowup(followupTarget, dueDate)}
        />
      )}
      {loseTarget && (
        <LoseDealDialog
          open
          dealTitle={loseTarget.deal.title}
          lostReasons={board.lostReasons}
          pending={pending}
          onCancel={() => setLoseTarget(null)}
          onConfirm={(reasonId, note) =>
            runLose(loseTarget.deal, loseTarget.stageId, reasonId, note)
          }
        />
      )}
    </div>
  );
}
