"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { memberLabel, type MemberNames } from "./types";

export type HandoffRow = {
  id: string;
  from_user_id: string | null;
  to_user_id: string;
  reason: string;
  created_by: string;
  created_at: string;
};

/**
 * Tóm tắt lần bàn giao GẦN NHẤT ngay dưới header hội thoại + lịch sử đầy đủ
 * trong dialog. Mục đích: người nhận mở hội thoại lên là biết ngay ai chuyển,
 * vì sao — không phải đọc lại từ đầu.
 */
export function HandoffBanner({
  conversationId,
  currentUserId,
  memberNames,
}: {
  conversationId: string;
  currentUserId: string;
  memberNames: MemberNames;
}) {
  const t = useTranslations("inbox.handoff");
  const tInbox = useTranslations("inbox");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["handoffs", conversationId],
    queryFn: async (): Promise<HandoffRow[]> => {
      const { data, error } = await supabase
        .from("conversation_handoffs")
        .select("id, from_user_id, to_user_id, reason, created_by, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as HandoffRow[];
    },
    staleTime: 30_000,
  });

  const rows = data ?? [];
  if (rows.length === 0) return null;
  const latest = rows[0];
  const who = (id: string | null) =>
    id ? memberLabel(id, currentUserId, tInbox, memberNames) : t("nobody");

  return (
    <div className="shrink-0 border-b bg-bubble-note/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13px] font-semibold">
          {t("bannerTitle", {
            from: who(latest.from_user_id),
            to: who(latest.to_user_id),
          })}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(latest.created_at, locale)}
        </span>
        {rows.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="size-3.5" />
            {t("historyButton", { count: rows.length })}
          </Button>
        )}
      </div>
      <p className="mt-0.5 text-[13px] break-words">
        <span className="text-muted-foreground">{t("reasonPrefix")} </span>
        {latest.reason}
      </p>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[85svh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{t("historyTitle")}</DialogTitle>
          </DialogHeader>
          <ol className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                  <span>{who(r.from_user_id)}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span>{who(r.to_user_id)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(r.created_at, locale)}
                </p>
                <p className="mt-1 text-[13px] break-words">{r.reason}</p>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </div>
  );
}
