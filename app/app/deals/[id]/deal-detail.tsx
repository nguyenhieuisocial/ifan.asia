"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CircleCheck,
  Flame,
  Handshake,
  Layers,
  MessagesSquare,
  Pencil,
  Phone,
  ThumbsDown,
  Trophy,
  User,
} from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import {
  ownerLabel,
  type ActivityRow,
  type ConversationLite,
  type MemberNames,
} from "../../contacts/types";
import { loseDeal, moveDealStage, scheduleWinFollowup, winDeal } from "../actions";
import { LoseDealDialog, WinDealDialog, WinFollowupDialog } from "../close-deal-dialogs";
import { DealFormDialog, tomorrowVN } from "../deal-form-dialog";
import { RescheduleDialog } from "../reschedule-dialog";
import {
  dealSlaState,
  STAGE_KIND_BADGE,
  type DealDetailRow,
  type DealSlaPolicy,
  type LostReason,
  type MemberOption,
  type PipelineStage,
  type StageHistoryRow,
} from "../types";
import { DealTimeline } from "./deal-timeline";

/** Điểm lead từ mức này coi là khách "nóng" — cùng ngưỡng với bảng Kanban. */
const HOT_SCORE = 70;

/** Field panel phải: nhãn 12 muted trên / giá trị 14 dưới (mẫu hồ sơ khách). */
function InfoField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm break-words">{children}</div>
    </div>
  );
}

type Props = {
  deal: DealDetailRow;
  stages: PipelineStage[];
  activities: ActivityRow[];
  history: StageHistoryRow[];
  /** Hội thoại inbox của khách (B05) — mới nhất trước; rỗng thì ẩn nút "Mở hội thoại". */
  conversations: ConversationLite[];
  lostReasons: LostReason[];
  slaPolicy: DealSlaPolicy | null;
  /** Số phút đã quá hạn việc kế tiếp — tính ở server để client hydrate không lệch. */
  overdue: number;
  /** Mốc "bây giờ" của lần dựng trang (ms) — dùng chung cho mọi phép đếm. */
  now: number;
  currentUserId: string;
  memberNames: MemberNames;
  members: MemberOption[];
  canAssignOthers: boolean;
  /** Bước 2 "hẹn chăm lại" sau khi thắng — CHỈ true khi playbook win_followup tắt (B11). */
  winFollowupManual: boolean;
};

export function DealDetail({
  deal,
  stages,
  activities,
  history,
  conversations,
  lostReasons,
  slaPolicy,
  overdue,
  now,
  currentUserId,
  memberNames,
  members,
  canAssignOthers,
  winFollowupManual,
}: Props) {
  const t = useTranslations("deals.detail");
  const tDeals = useTranslations("deals");
  const tContacts = useTranslations("contacts");
  const tCommon = useTranslations("common");
  const tDuration = useTranslations("sla.duration");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  // B17: dialog nhanh "Hẹn tiếp" — 2 trường, không mở form sửa đầy đủ
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [winOpen, setWinOpen] = useState(false);
  // Bước 2 sau khi thắng: hẹn ngày chăm lại (chỉ dùng khi winFollowupManual)
  const [followupOpen, setFollowupOpen] = useState(false);
  const [loseOpen, setLoseOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const openStages = stages.filter((s) => s.kind === "open");
  const wonStage = stages.find((s) => s.kind === "won") ?? null;
  const lostStage = stages.find((s) => s.kind === "lost") ?? null;
  const stageNames = Object.fromEntries(stages.map((s) => [s.id, s.name]));
  const currentStage = stages.find((s) => s.id === deal.stage_id) ?? null;
  const contact = deal.contacts;
  const owner = ownerLabel(deal.owner_id, currentUserId, tContacts, memberNames);

  /** Số phút → "30 phút" / "2 giờ" / "3 ngày" (làm tròn xuống, như màn Cam kết). */
  const duration = (minutes: number) => {
    if (minutes >= 1440) return tDuration("days", { n: Math.floor(minutes / 1440) });
    if (minutes >= 60) return tDuration("hours", { n: Math.floor(minutes / 60) });
    return tDuration("minutes", { n: Math.max(minutes, 0) });
  };

  const missingNextAction = deal.status === "open" && !deal.next_action_at;
  const slaState = dealSlaState(overdue, slaPolicy);

  const run = (action: () => Promise<{ error: string | null }>, okMessage: string) =>
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(okMessage);
      router.refresh();
    });

  const moveTo = (stage: PipelineStage) =>
    run(() => moveDealStage(deal.id, stage.id), t("toasts.moved", { stage: stage.name }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 space-y-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* KHÔNG dùng common.back ("Quay lại") ở đây: tenant được tự đặt tên bước,
              và "Quay lại" là tên bước có thật (khách quay lại dùng dịch vụ) — hai nút
              trùng chữ trên cùng màn sẽ bị bấm nhầm. Dùng đích đến cho rõ nghĩa.
              Lùi về màn VỪA ĐỨNG; chỉ khi mở thẳng link mới về bảng Cơ hội. */}
          <BackButton fallbackHref="/app/deals">{t("backToBoard")}</BackButton>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-lg font-semibold break-words">{deal.title}</h1>
              <Badge
                className={cn(
                  "font-semibold",
                  STAGE_KIND_BADGE[currentStage?.kind ?? "open"],
                )}
              >
                {currentStage?.name ?? t("unknownStage")}
              </Badge>
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {formatMoney(deal.value_vnd, locale)}
              </span>
              {" · "}
              {t("ownerLine", { owner })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {contact?.phone && (
              <Button asChild variant="outline" size="sm">
                <a href={`tel:${contact.phone}`}>
                  <Phone className="size-4" />
                  {t("call")}
                </a>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/contacts/${deal.contact_id}`}>
                <User className="size-4" />
                {t("openContact")}
              </Link>
            </Button>
            {/* B05: từ cơ hội về thẳng hội thoại gốc 1 chạm — conversations xếp
                theo tin cuối nên [0] là hội thoại mới nhất; khách chưa nhắn qua
                kênh nào thì ẩn nút, không dẫn vào Hộp thư trống. */}
            {conversations.length > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/inbox?c=${conversations[0].id}`}>
                  <MessagesSquare className="size-4" />
                  {t("openConversation")}
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              {t("edit")}
            </Button>
            {wonStage && deal.status !== "won" && (
              <Button variant="outline" size="sm" onClick={() => setWinOpen(true)}>
                <Trophy className="size-4" />
                {tDeals("card.markWon")}
              </Button>
            )}
            {lostStage && deal.status !== "lost" && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setLoseOpen(true)}
              >
                <ThumbsDown className="size-4" />
                {tDeals("card.markLost")}
              </Button>
            )}
          </div>
        </div>

        {/* Stepper: bấm thẳng vào bước muốn chuyển (spec §4.5) — 375px thì xuống dòng */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("stageBar")}</span>
          {openStages.map((s) => {
            const active = s.id === deal.stage_id && deal.status === "open";
            return (
              <Button
                key={s.id}
                size="sm"
                variant={active ? "default" : "outline"}
                disabled={pending || active}
                aria-current={active ? "step" : undefined}
                onClick={() => moveTo(s)}
              >
                {active && <CircleCheck className="size-4" />}
                {s.name}
              </Button>
            );
          })}
          {deal.status !== "open" && (
            <span className="text-xs text-muted-foreground">{t("reopenHint")}</span>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <DealTimeline
            dealId={deal.id}
            activities={activities}
            history={history}
            conversations={conversations}
            stageNames={stageNames}
            now={now}
          />

          <div className="space-y-4">
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarClock className="size-4 text-muted-foreground" />
                  {t("nextAction.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4">
                {deal.status !== "open" ? (
                  <p className="text-[13px] text-muted-foreground">
                    {t("nextAction.closed")}
                  </p>
                ) : missingNextAction ? (
                  <Badge className="gap-1 bg-destructive/10 text-destructive">
                    <AlertTriangle className="size-3" />
                    {tDeals("card.noNextAction")}
                  </Badge>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      {formatDate(deal.next_action_at as string, locale)}
                    </p>
                    {deal.next_action_note && (
                      <p className="text-[13px] whitespace-pre-wrap">
                        {deal.next_action_note}
                      </p>
                    )}
                    <Badge
                      className={cn(
                        "gap-1",
                        slaState === "ontime"
                          ? "bg-muted text-muted-foreground"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {slaState !== "ontime" && <AlertTriangle className="size-3" />}
                      {slaState === "ontime"
                        ? t("nextAction.ontime")
                        : slaState === "breached"
                          ? t("nextAction.breached", { late: duration(overdue) })
                          : t("nextAction.overdue", { late: duration(overdue) })}
                    </Badge>
                  </>
                )}
                {slaPolicy ? (
                  <p className="text-xs text-muted-foreground">
                    {t("nextAction.commitment", {
                      policy: slaPolicy.name,
                      warn: duration(slaPolicy.warn_after_minutes),
                      breach: duration(slaPolicy.breach_after_minutes),
                    })}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("nextAction.noCommitment")}
                  </p>
                )}
                {/* B17: cơ hội MỞ dời hẹn bằng dialog 2 trường (2 chạm xong);
                    cơ hội đã đóng không có việc kế tiếp → mở form sửa như cũ */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    deal.status === "open"
                      ? setRescheduleOpen(true)
                      : setEditOpen(true)
                  }
                >
                  <CalendarClock className="size-4" />
                  {t("nextAction.change")}
                </Button>
              </CardContent>
            </Card>

            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Handshake className="size-4 text-muted-foreground" />
                  {t("info.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4">
                <InfoField label={t("info.contact")}>
                  {contact ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/app/contacts/${contact.id}`}
                        className="text-primary hover:underline"
                      >
                        {contact.full_name}
                      </Link>
                      {contact.lead_score >= HOT_SCORE && (
                        <Badge className="gap-0.5 bg-destructive/10 px-1.5 text-destructive">
                          <Flame className="size-3" />
                          {contact.lead_score}
                        </Badge>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{tCommon("notSet")}</span>
                  )}
                </InfoField>
                <InfoField label={t("info.company")}>
                  {contact?.companies ? (
                    <Link
                      href={`/app/companies/${contact.companies.id}`}
                      className="flex items-center gap-1.5 text-primary hover:underline"
                    >
                      <Building2 className="size-3.5" />
                      {contact.companies.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{tCommon("notSet")}</span>
                  )}
                </InfoField>
                <InfoField label={t("info.value")}>
                  {formatMoney(deal.value_vnd, locale)}
                </InfoField>
                <InfoField label={t("info.expectedClose")}>
                  {deal.expected_close_date ? (
                    formatDate(deal.expected_close_date, locale)
                  ) : (
                    <span className="text-muted-foreground">{tCommon("notSet")}</span>
                  )}
                </InfoField>
                <InfoField label={t("info.owner")}>{owner}</InfoField>
                <InfoField label={t("info.createdAt")}>
                  {formatDate(deal.created_at, locale)}
                </InfoField>
                {deal.status === "won" && deal.won_at && (
                  <InfoField label={t("info.wonAt")}>
                    {formatDate(deal.won_at, locale)}
                  </InfoField>
                )}
                {deal.status === "lost" && (
                  <InfoField label={t("info.lostReason")}>
                    {deal.lost_reasons?.name ?? tCommon("notSet")}
                  </InfoField>
                )}
              </CardContent>
            </Card>

            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Layers className="size-4 text-muted-foreground" />
                  {t("history.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4">
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("history.empty")}</p>
                ) : (
                  history.map((h) => {
                    // Chặng chưa đóng: đếm tới "bây giờ" của lần dựng trang
                    const seconds =
                      h.duration_seconds ??
                      Math.max(
                        0,
                        Math.floor((now - new Date(h.entered_at).getTime()) / 1000),
                      );
                    return (
                      <div key={h.id} className="rounded-md border p-2">
                        <p className="text-[13px] font-medium break-words">
                          {stageNames[h.to_stage_id] ?? t("unknownStage")}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("history.entered", {
                            date: formatDate(h.entered_at, locale),
                          })}
                          {" · "}
                          {h.exited_at
                            ? t("history.stayed", {
                                duration: duration(Math.floor(seconds / 60)),
                              })
                            : t("history.current", {
                                duration: duration(Math.floor(seconds / 60)),
                              })}
                        </p>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {editOpen && (
        <DealFormDialog
          mode="edit"
          open
          onOpenChange={setEditOpen}
          dealId={deal.id}
          initialValues={{
            title: deal.title,
            contactId: deal.contact_id,
            value: String(deal.value_vnd),
            expectedCloseDate: deal.expected_close_date ?? "",
            stageId:
              deal.status === "open"
                ? deal.stage_id
                : (openStages[0]?.id ?? deal.stage_id),
            ownerId: deal.owner_id,
            nextActionDate: deal.next_action_at
              ? deal.next_action_at.slice(0, 10)
              : tomorrowVN(),
            nextActionNote: deal.next_action_note ?? "",
          }}
          openStages={openStages}
          members={members}
          canAssignOthers={canAssignOthers}
          stageLocked={deal.status !== "open"}
          lockedContactName={contact?.full_name}
          onSuccess={() => router.refresh()}
        />
      )}
      {rescheduleOpen && (
        <RescheduleDialog
          open
          onOpenChange={setRescheduleOpen}
          dealId={deal.id}
          dealTitle={deal.title}
          initialDate={
            deal.next_action_at ? deal.next_action_at.slice(0, 10) : tomorrowVN()
          }
          initialNote={deal.next_action_note ?? ""}
          onSuccess={() => router.refresh()}
        />
      )}
      {winOpen && wonStage && (
        <WinDealDialog
          open
          dealTitle={deal.title}
          initialValue={deal.value_vnd}
          pending={pending}
          onCancel={() => setWinOpen(false)}
          onConfirm={(value) => {
            setWinOpen(false);
            startTransition(async () => {
              const res = await winDeal(deal.id, wonStage.id, value);
              if (res.error) {
                toast.error(res.error);
                return;
              }
              toast.success(tDeals("toasts.won"));
              // Bước 2 (B11): playbook win_followup tắt thì mời hẹn ngày chăm lại bằng tay
              if (winFollowupManual) setFollowupOpen(true);
              router.refresh();
            });
          }}
        />
      )}
      {followupOpen && (
        <WinFollowupDialog
          open
          dealTitle={deal.title}
          pending={pending}
          onSkip={() => setFollowupOpen(false)}
          onConfirm={(dueDate) =>
            startTransition(async () => {
              const res = await scheduleWinFollowup(deal.id, dueDate);
              if (res.error) {
                toast.error(res.error);
                return; // giữ dialog để chọn lại ngày hoặc Bỏ qua
              }
              setFollowupOpen(false);
              toast.success(tDeals("toasts.followupScheduled"));
              router.refresh();
            })
          }
        />
      )}
      {loseOpen && lostStage && (
        <LoseDealDialog
          open
          dealTitle={deal.title}
          lostReasons={lostReasons}
          pending={pending}
          onCancel={() => setLoseOpen(false)}
          onConfirm={(reasonId, note) => {
            setLoseOpen(false);
            run(
              () => loseDeal(deal.id, lostStage.id, reasonId, note || undefined),
              tDeals("toasts.lost"),
            );
          }}
        />
      )}
    </div>
  );
}
