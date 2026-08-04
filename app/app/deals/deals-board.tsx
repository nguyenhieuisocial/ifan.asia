"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  Flame,
  MoreHorizontal,
  Plus,
  ThumbsDown,
  Trophy,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { ownerLabel, type MemberNames } from "../contacts/types";
import { loseDeal, moveDealStage, winDeal } from "./actions";
import { DealFormDialog, tomorrowVN, type DealFormValues } from "./deal-form-dialog";
import { LoseDealDialog, WinDealDialog } from "./close-deal-dialogs";
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
};

export function DealsBoard({
  currentUserId,
  memberNames,
  members,
  canAssignOthers,
  board,
}: Props) {
  const t = useTranslations("deals");
  const tContacts = useTranslations("contacts");
  const locale = useLocale() as Locale;

  // Nguồn sự thật khi kéo-thả = state cục bộ (optimistic); server revalidate xong
  // props đổi thì đồng bộ lại NGAY TRONG RENDER (mẫu "adjusting state on prop
  // change" của React — không dùng effect để tránh render thừa).
  const [deals, setDeals] = useState<DealRow[]>(board.deals);
  const [syncedFrom, setSyncedFrom] = useState(board.deals);
  if (syncedFrom !== board.deals) {
    setSyncedFrom(board.deals);
    setDeals(board.deals);
  }

  const [onlyNeedsAction, setOnlyNeedsAction] = useState(false);
  const [dragDealId, setDragDealId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DealRow | null>(null);
  const [winTarget, setWinTarget] = useState<{ deal: DealRow; stageId: string } | null>(null);
  const [loseTarget, setLoseTarget] = useState<{ deal: DealRow; stageId: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const openStages = useMemo(
    () => board.stages.filter((s) => s.kind === "open"),
    [board.stages],
  );
  const wonStage = board.stages.find((s) => s.kind === "won") ?? null;
  const lostStage = board.stages.find((s) => s.kind === "lost") ?? null;

  const needsActionCount = deals.filter((d) => needsNextAction(d)).length;
  const visibleDeals = onlyNeedsAction ? deals.filter((d) => needsNextAction(d)) : deals;
  // Hiện CẢ HAI số: tổng thật của các thẻ đang mở VÀ con số dự báo. Chỉ đưa mỗi
  // dự báo thì chủ tiệm cộng nhẩm các cột rồi kết luận phần mềm cộng sai — dự báo
  // luôn NHỎ HƠN tổng vì đã nhân tỉ lệ thắng của từng bước.
  const openTotal = sumValue(deals.filter((d) => d.status === "open"));
  const forecast = forecastValue(deals, board.stages);

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
          {warn ? (
            <Badge className="gap-1 bg-destructive/10 text-destructive">
              <AlertTriangle className="size-3" />
              {deal.next_action_at ? t("card.overdue") : t("card.noNextAction")}
            </Badge>
          ) : deal.next_action_at ? (
            <span className="text-xs text-muted-foreground">
              {t("card.nextAction", { date: formatDate(deal.next_action_at, locale) })}
            </span>
          ) : null}
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <h1 className="mr-1 text-sm font-semibold">{t("title")}</h1>
        <p className="text-xs text-muted-foreground">
          {t("openTotal", { value: formatMoney(openTotal, locale) })}
          {" · "}
          {t("forecast", { value: formatMoney(Math.round(forecast), locale) })}
        </p>
        {/* Nhóm 2 nút để ở mobile chúng xuống dòng CÙNG NHAU, không tách rời */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={onlyNeedsAction ? "default" : "outline"}
            size="sm"
            aria-pressed={onlyNeedsAction}
            onClick={() => setOnlyNeedsAction((v) => !v)}
          >
            <AlertTriangle className="size-4" />
            <span className="hidden sm:inline">{t("filterNeedsAction")}</span>
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
        <div className="min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-3 p-3">
            {board.stages.map((stage) => {
              const stageDeals = visibleDeals.filter((d) => d.stage_id === stage.id);
              const allStageDeals = deals.filter((d) => d.stage_id === stage.id);
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
                        {allStageDeals.length}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(sumValue(allStageDeals), locale)}
                    </p>
                    {/* Cột Thắng/Thua cộng dồn TỪ TRƯỚC TỚI NAY, không theo bộ lọc
                        thời gian của Tổng quan — phải tự khai, nếu không chủ tiệm
                        so "Doanh thu 7 ngày" với cột này rồi tưởng phần mềm sai. */}
                    {stage.kind !== "open" && (
                      <p className="text-[11px] text-muted-foreground/80">
                        {t("column.allTime")}
                      </p>
                    )}
                  </header>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                    {stageDeals.length === 0 ? (
                      <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                        {onlyNeedsAction ? t("column.emptyFiltered") : t("column.empty")}
                      </p>
                    ) : (
                      stageDeals.map((deal) => renderCard(deal))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
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
