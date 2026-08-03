"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AiFailureReason, ExtractedContact } from "@/lib/ai/gateway";
import {
  aiExtractContact,
  aiSuggestReplies,
  aiSummarizeConversation,
  applyExtractedContact,
} from "./ai-actions";

type AiAction = "summary" | "extract" | "suggest";

type Panel =
  | { kind: "summary"; text: string }
  | { kind: "extract"; data: ExtractedContact; contactId: string | null }
  | { kind: "suggest"; items: string[] };

/** Map reason của gateway → key toast trong messages `ai.errors.*`. */
const ERROR_KEYS: Record<Exclude<AiFailureReason, "not_configured">, string> = {
  quota_exceeded: "quotaExceeded",
  refused: "refused",
  rate_limited: "rateLimited",
  bad_key: "badKey",
  api_error: "apiError",
  unknown: "unknown",
};

const AI_ACTIONS: readonly AiAction[] = ["summary", "extract", "suggest"];

/** Các trường trích xuất được (khác null) — hiển thị trong card xác nhận. */
function extractRows(
  data: ExtractedContact,
): { field: string; value: string }[] {
  const rows: { field: string; value: string }[] = [];
  if (data.full_name) rows.push({ field: "fullName", value: data.full_name });
  if (data.phone) rows.push({ field: "phone", value: data.phone });
  if (data.email) rows.push({ field: "email", value: data.email });
  if (data.address) rows.push({ field: "address", value: data.address });
  if (data.need_summary)
    rows.push({ field: "needSummary", value: data.need_summary });
  return rows;
}

type Props = {
  conversationId: string;
  disabled: boolean;
  /** Chèn gợi ý trả lời vào ô soạn tin của MessageThread. */
  onInsert: (value: string) => void;
};

export function AiAssist({ conversationId, disabled, onInsert }: Props) {
  const t = useTranslations("ai");
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<AiAction | null>(null);
  const [notice, setNotice] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);

  const fail = (reason: AiFailureReason) => {
    if (reason === "not_configured") {
      setNotice(true);
      setPanel(null);
      return;
    }
    toast.error(t(`errors.${ERROR_KEYS[reason]}`));
  };

  const run = (action: AiAction) => {
    if (pending || disabled) return;
    setActiveAction(action);
    setNotice(false);
    startTransition(async () => {
      if (action === "summary") {
        const res = await aiSummarizeConversation(conversationId);
        if (res.ok) setPanel({ kind: "summary", text: res.data });
        else fail(res.reason);
      } else if (action === "extract") {
        const res = await aiExtractContact(conversationId);
        if (res.ok)
          setPanel({
            kind: "extract",
            data: res.data.extracted,
            contactId: res.data.contactId,
          });
        else fail(res.reason);
      } else {
        const res = await aiSuggestReplies(conversationId);
        if (res.ok) setPanel({ kind: "suggest", items: res.data });
        else fail(res.reason);
      }
      setActiveAction(null);
    });
  };

  const apply = (contactId: string, data: ExtractedContact) => {
    if (pending) return;
    startTransition(async () => {
      const res = await applyExtractedContact(contactId, {
        fullName: data.full_name ?? undefined,
        phone: data.phone ?? undefined,
        email: data.email ?? undefined,
        address: data.address ?? undefined,
      });
      if (res.error === "invalid_input") {
        toast.error(t("toasts.applyInvalid"));
      } else if (res.error) {
        toast.error(t("toasts.applyFailed"));
      } else {
        toast.success(t("toasts.applied"));
        setPanel(null);
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
    });
  };

  return (
    <div className="shrink-0 border-t px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5" />
          {t("title")}
        </span>
        {AI_ACTIONS.map((action) => (
          <Button
            key={action}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={disabled || pending}
            onClick={() => run(action)}
          >
            {pending && activeAction === action && (
              <Loader2 className="size-3 animate-spin" />
            )}
            {t(`actions.${action}`)}
          </Button>
        ))}
      </div>

      {notice && (
        <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {t("notConfigured")}
        </p>
      )}

      {panel && (
        <div className="relative mt-2 rounded-md border bg-muted/40 p-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 size-6"
            aria-label={t("dismiss")}
            onClick={() => setPanel(null)}
          >
            <X className="size-3.5" />
          </Button>

          {panel.kind === "summary" && (
            <div className="pr-6">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {t("summaryTitle")}
              </p>
              <p className="whitespace-pre-wrap text-[13px]">{panel.text}</p>
            </div>
          )}

          {panel.kind === "extract" && (
            <div className="pr-6">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {t("extractTitle")}
              </p>
              {extractRows(panel.data).length === 0 &&
              panel.data.tags.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  {t("extractEmpty")}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {extractRows(panel.data).map((row) => (
                    <p key={row.field} className="text-[13px]">
                      <span className="text-muted-foreground">
                        {t(`fields.${row.field}`)}:{" "}
                      </span>
                      {row.value}
                    </p>
                  ))}
                  {panel.data.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] text-muted-foreground">
                        {t("fields.tags")}:
                      </span>
                      {panel.data.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {panel.contactId ? (
                    <div className="pt-1">
                      <p className="mb-1.5 text-xs text-muted-foreground">
                        {t("extractHint")}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          if (panel.contactId) apply(panel.contactId, panel.data);
                        }}
                      >
                        {t("apply")}
                      </Button>
                    </div>
                  ) : (
                    <p className="pt-1 text-xs text-muted-foreground">
                      {t("noContact")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {panel.kind === "suggest" && (
            <div className="pr-6">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {t("suggestTitle")}
              </p>
              <p className="mb-1.5 text-xs text-muted-foreground">
                {t("suggestHint")}
              </p>
              <div className="space-y-1.5">
                {panel.items.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-start px-3 py-2 text-left text-[13px] font-normal whitespace-normal"
                    onClick={() => {
                      onInsert(item);
                      setPanel(null);
                    }}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
