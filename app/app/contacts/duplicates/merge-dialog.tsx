"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Check, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { mergeContactPair } from "../merge-actions";
import { ownerLabel, TIER_BADGE, type MemberNames, type Tier } from "../types";
import {
  defaultChoices,
  fieldValue,
  MERGE_FIELDS,
  movedTotals,
  type DuplicatePair,
  type FieldChoice,
  type MergeCandidate,
  type MergeField,
} from "./types";

/** Nút chọn giữ giá trị của bên nào cho MỘT field. */
function SideButton({
  label,
  value,
  selected,
  emptyLabel,
  onSelect,
}: {
  label: string;
  value: React.ReactNode;
  selected: boolean;
  emptyLabel: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-w-0 flex-1 items-start gap-2 rounded-md border p-2 text-left transition-colors",
        selected ? "border-primary bg-primary-tint" : "border-border hover:bg-muted/50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40",
        )}
      >
        {selected && <Check className="size-3" />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block truncate text-[13px]">
          {value || <span className="text-muted-foreground">{emptyLabel}</span>}
        </span>
      </span>
    </button>
  );
}

type FormProps = {
  pair: DuplicatePair;
  currentUserId: string;
  memberNames: MemberNames;
  onDone: () => void;
  onMerged: () => void;
};

/**
 * Thân dialog — nằm trong DialogContent và mang key theo cặp nên tự unmount khi
 * đóng / đổi cặp, state lựa chọn tự reset (không cần effect đồng bộ).
 */
function MergeForm({
  pair,
  currentUserId,
  memberNames,
  onDone,
  onMerged,
}: FormProps) {
  const t = useTranslations("contacts.merge");
  const tContacts = useTranslations("contacts");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();

  // Gợi ý giữ hồ sơ CŨ hơn: thường mang nhiều lịch sử và liên kết nhất
  const suggestedWinnerId =
    pair.a.created_at <= pair.b.created_at ? pair.a.id : pair.b.id;
  const [winnerId, setWinnerId] = useState(suggestedWinnerId);
  // Chỉ giữ phần người dùng bấm khác mặc định — đổi hồ sơ chính là xóa hết
  const [overrides, setOverrides] = useState<Partial<FieldChoice>>({});

  const winner: MergeCandidate = pair.a.id === winnerId ? pair.a : pair.b;
  const loser: MergeCandidate = pair.a.id === winnerId ? pair.b : pair.a;
  const choices: FieldChoice = { ...defaultChoices(winner, loser), ...overrides };

  const pickWinner = (id: string) => {
    setWinnerId(id);
    setOverrides({});
  };

  const renderValue = (c: MergeCandidate, f: MergeField): React.ReactNode => {
    const v = fieldValue(c, f);
    if (!v) return null;
    if (f === "tier") {
      return (
        <Badge className={cn("font-semibold", TIER_BADGE[v as Tier])}>
          {tContacts(`tier.${v as Tier}`)}
        </Badge>
      );
    }
    if (f === "owner_id") return ownerLabel(v, currentUserId, tContacts, memberNames);
    return v;
  };

  // Chỉ những mục hai bên THỰC SỰ khác nhau mới cần người dùng quyết
  const conflicts = MERGE_FIELDS.filter((f) => {
    const lv = fieldValue(loser, f);
    return lv && fieldValue(winner, f) !== lv;
  });

  const moved = movedTotals(loser);

  const submit = () =>
    startTransition(async () => {
      const res = await mergeContactPair(winner.id, loser.id, choices);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("toasts.merged", { name: winner.full_name }));
      onDone();
      onMerged();
    });

  return (
    <>
      <div className="space-y-4">
        {/* Bước 1: chọn hồ sơ chính */}
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold">{t("dialog.pickWinner")}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[pair.a, pair.b].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pickWinner(c.id)}
                aria-pressed={c.id === winnerId}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  c.id === winnerId
                    ? "border-primary bg-primary-tint"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span className="flex items-center gap-1.5">
                  {c.id === winnerId && (
                    <Crown aria-hidden className="size-4 shrink-0 text-primary" />
                  )}
                  <span className="truncate text-sm font-semibold">{c.full_name}</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("dialog.winnerHint", {
                    deals: c.deal_count,
                    conversations: c.conversation_count,
                  })}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Bước 2: chọn giá trị giữ từng field */}
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold">{t("dialog.pickFields")}</h3>
          {conflicts.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {t("dialog.noFieldConflict")}
            </p>
          ) : (
            <div className="space-y-2">
              {conflicts.map((f) => (
                <div key={f} className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t(`fields.${f}`)}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <SideButton
                      label={t("dialog.fromWinner")}
                      value={renderValue(winner, f)}
                      emptyLabel={tCommon("notSet")}
                      selected={choices[f] === "winner"}
                      onSelect={() => setOverrides({ ...overrides, [f]: "winner" })}
                    />
                    <SideButton
                      label={t("dialog.fromLoser")}
                      value={renderValue(loser, f)}
                      emptyLabel={tCommon("notSet")}
                      selected={choices[f] === "loser"}
                      onSelect={() => setOverrides({ ...overrides, [f]: "loser" })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Bước 3: nói rõ cái gì sẽ chuyển TRƯỚC khi bấm */}
        <section className="rounded-lg border bg-muted/40 p-3">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
            {t("dialog.willMoveTitle")}
            <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-normal text-muted-foreground">
              {winner.full_name}
            </span>
          </h3>
          <ul className="mt-2 grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2">
            {(
              [
                ["conversations", moved.conversations],
                ["deals", moved.deals],
                ["activities", moved.activities],
                ["tags", moved.tags],
                ["identities", moved.identities],
              ] as const
            ).map(([key, n]) => (
              <li key={key} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t(`moved.${key}`)}</span>
                <span className="font-medium tabular-nums">{n}</span>
              </li>
            ))}
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("moved.revenue")}</span>
              <span className="font-medium tabular-nums">
                {formatMoney(winner.total_revenue + loser.total_revenue, locale)}
              </span>
            </li>
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t("dialog.loserFate", { name: loser.full_name })}
          </p>
        </section>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          {tCommon("cancel")}
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? tCommon("loading") : t("dialog.confirm")}
        </Button>
      </DialogFooter>
    </>
  );
}

type Props = {
  pair: DuplicatePair | null;
  currentUserId: string;
  memberNames: MemberNames;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void;
};

export function MergeDialog({
  pair,
  currentUserId,
  memberNames,
  onOpenChange,
  onMerged,
}: Props) {
  const t = useTranslations("contacts.merge");
  return (
    <Dialog open={pair !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>
        {pair && (
          <MergeForm
            key={`${pair.a_id}:${pair.b_id}`}
            pair={pair}
            currentUserId={currentUserId}
            memberNames={memberNames}
            onDone={() => onOpenChange(false)}
            onMerged={onMerged}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
