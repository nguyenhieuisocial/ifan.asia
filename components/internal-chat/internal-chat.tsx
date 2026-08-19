"use client";

import { useEffect, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AtSign, ChevronDown, ChevronRight, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDateTime, formatTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { guiTinNoiBo, suaTinNoiBo, taiTraoDoiNoiBo, xoaTinNoiBo } from "./actions";
import {
  EDIT_WINDOW_MS,
  MAX_BODY_LENGTH,
  MESSAGE_LIMIT,
  type ChatEntityType,
  type ChatLoad,
  type ChatMessage,
} from "./types";

/**
 * Khung chat NỘI BỘ (thẻ `man-chat-noi-bo.html`).
 *
 * MÀU VÀ VỊ TRÍ KHÁC HẲN khung chat khách — cố ý, đây là quyết định 2 của thẻ:
 * "cách chắc chắn nhất để không gửi nhầm là làm cho nó không thể nhầm được".
 * Khung này còn không có đường nào nối tới `messages` (chat khách) — hai bảng
 * khác nhau, không có nút chuyển tin qua lại.
 */
export function InternalChat({
  entityType,
  entityId,
  defaultOpen = true,
  className,
}: {
  entityType: ChatEntityType;
  entityId: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const t = useTranslations("internalChat");
  const locale = useLocale() as Locale;

  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pending, startTransition] = useTransition();
  // Nhịp đếm để nút "Sửa" TỰ BIẾN MẤT khi hết 15 phút — thẻ đòi "quá hạn thì
  // nút sửa biến mất", không phải bấm rồi mới báo lỗi.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Tải bằng react-query (khuôn có sẵn của kho — xem `appointment-dialog.tsx`),
  // KHÔNG bằng useEffect + setState: quy tắc `react-hooks/set-state-in-effect`
  // của kho cấm gọi setState trong thân effect. `enabled: open` ⇒ khung còn gấp
  // thì không tốn một lượt hỏi máy chủ nào.
  const query = useQuery({
    queryKey: ["internal-chat", entityType, entityId],
    queryFn: () => taiTraoDoiNoiBo({ entityType, entityId }),
    enabled: open,
  });
  const state: ChatLoad | null = query.data ?? null;
  const load = async () => {
    await query.refetch();
  };

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNowMs(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, [open]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const res = await guiTinNoiBo({ entityType, entityId, body });
      // `mentionFailed` nghĩa là TIN ĐÃ GHI, chỉ phần gọi tên hỏng. Nếu xử lý
      // như lỗi gửi (giữ nguyên ô soạn, không tải lại) thì người dùng thấy ô
      // còn chữ, tưởng chưa gửi, bấm gửi lần nữa — thành hai tin. Vẫn báo,
      // nhưng vẫn dọn ô và tải lại.
      if (res.error && res.error !== "mentionFailed") {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      setDraft("");
      await load();
      if (res.error === "mentionFailed") toast.error(t("errors.mentionFailed"));
    });
  };

  const saveEdit = (messageId: string) => {
    const body = editDraft.trim();
    if (!body) {
      toast.error(t("errors.empty"));
      return;
    }
    startTransition(async () => {
      const res = await suaTinNoiBo({ messageId, body });
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      setEditingId(null);
      await load();
    });
  };

  const remove = (messageId: string) => {
    startTransition(async () => {
      const res = await xoaTinNoiBo({ messageId });
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      await load();
    });
  };

  const nameOf = (userId: string) =>
    state?.members.find((m) => m.userId === userId)?.displayName ??
    t("unknownMember", { id: userId.slice(0, 8) });

  return (
    <section
      className={cn(
        "rounded-md border border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-amber-700 dark:text-amber-300" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-amber-700 dark:text-amber-300" />
        )}
        <Lock className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
        <span className="flex-1 text-[13px] font-semibold text-amber-900 dark:text-amber-200">
          {t("title")}
        </span>
        <span className="shrink-0 text-[11px] text-amber-800/80 dark:text-amber-300/80">
          {t("customerCannotSee")}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-amber-200 px-3 py-2.5 dark:border-amber-900">
          {/* Hỏng đường truyền thì PHẢI nói ra — để nguyên chữ "Đang tải…" là
              nuốt lỗi thành một khung quay mãi mà không ai biết vì sao. */}
          {query.isError ? (
            <p className="rounded-md border border-dashed p-2.5 text-[12px] text-muted-foreground">
              {t("errors.loadFailed")}
            </p>
          ) : (
            state === null && <p className="text-[12px] text-muted-foreground">{t("loading")}</p>
          )}

          {state?.error && (
            <p className="rounded-md border border-dashed p-2.5 text-[12px] text-muted-foreground">
              {t(`errors.${state.error}`)}
            </p>
          )}

          {state && !state.error && (
            <>
              {state.atLimit && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t("limitNote", { n: MESSAGE_LIMIT })}
                </p>
              )}

              {state.messages.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">{t("empty")}</p>
              ) : (
                <ul className="space-y-2">
                  {state.messages.map((message) => (
                    <li key={message.id} className="flex gap-2">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[10px] font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                        {(nameOf(message.senderUserId)[0] ?? "?").toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {nameOf(message.senderUserId)}
                          </span>
                          {" · "}
                          <span title={formatDateTime(message.createdAt, locale)}>
                            {formatTime(message.createdAt, locale)}
                          </span>
                          {message.editedAt && !message.deletedAt && (
                            <span className="ml-1 italic">{t("edited")}</span>
                          )}
                        </p>

                        {message.deletedAt ? (
                          <p className="text-[12px] italic text-muted-foreground">
                            {t("deletedTrace", { time: formatTime(message.deletedAt, locale) })}
                          </p>
                        ) : editingId === message.id ? (
                          <div className="space-y-1.5 pt-1">
                            <Textarea
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              maxLength={MAX_BODY_LENGTH}
                              rows={2}
                            />
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                disabled={pending}
                                onClick={() => saveEdit(message.id)}
                              >
                                {t("saveEdit")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() => setEditingId(null)}
                              >
                                {t("cancelEdit")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap">
                            {message.body}
                          </p>
                        )}

                        {editingId !== message.id && (
                          <MessageActions
                            message={message}
                            isMine={message.senderUserId === state.currentUserId}
                            nowMs={nowMs}
                            pending={pending}
                            onEdit={() => {
                              setEditingId(message.id);
                              setEditDraft(message.body);
                            }}
                            onDelete={() => remove(message.id)}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {state.canWrite ? (
                <div className="space-y-1.5 pt-1">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={t("placeholder")}
                    maxLength={MAX_BODY_LENGTH}
                    rows={2}
                  />
                  {state.members.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <AtSign className="size-3 text-muted-foreground" />
                      {state.members
                        .filter((m) => m.userId !== state.currentUserId)
                        .map((m) => (
                          <button
                            key={m.userId}
                            type="button"
                            onClick={() =>
                              setDraft((cur) =>
                                cur.includes(`@${m.displayName}`)
                                  ? cur
                                  : `${cur}${cur && !cur.endsWith(" ") ? " " : ""}@${m.displayName} `,
                              )
                            }
                            className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-background/60"
                          >
                            {m.displayName}
                          </button>
                        ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {t("mentionNote")}
                    </p>
                    <Button size="sm" disabled={pending || !draft.trim()} onClick={send}>
                      <Send className="size-4" />
                      {pending ? t("sending") : t("send")}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">{t("readOnly")}</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Nút Sửa/Xoá. "Sửa" chỉ hiện với TIN CỦA CHÍNH MÌNH và còn trong 15 phút —
 * chủ tiệm cũng không sửa/xoá được tin người khác (thẻ quyết định 5: chat là
 * bằng chứng ai bảo làm gì). Chốt chặn thật nằm ở policy
 * `internal_messages_update_own`; đây chỉ là mặt tiền cho khớp.
 */
function MessageActions({
  message,
  isMine,
  nowMs,
  pending,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  isMine: boolean;
  nowMs: number;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("internalChat");
  if (!isMine || message.deletedAt) return null;
  const canEdit = nowMs - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS;
  return (
    <div className="flex gap-2 pt-0.5">
      {canEdit && (
        <button
          type="button"
          disabled={pending}
          onClick={onEdit}
          className="text-[11px] text-muted-foreground hover:text-foreground hover:underline disabled:opacity-60"
        >
          {t("edit")}
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={onDelete}
        className="text-[11px] text-muted-foreground hover:text-destructive hover:underline disabled:opacity-60"
      >
        {t("delete")}
      </button>
    </div>
  );
}
