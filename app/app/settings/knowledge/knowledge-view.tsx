"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import {
  KB_ANSWER_MAX,
  KB_CUSTOM_INSTRUCTION_MAX,
  KB_MAX_CHARS,
  KB_MAX_ENTRIES,
  KB_QUESTION_MAX,
  isKbEntryStale,
  kbUsage,
  type KbEntry,
} from "@/lib/ai/kb";
import {
  deleteKbEntry,
  previewAutopilotPrompt,
  publishKbEntry,
  saveCustomInstruction,
  saveKbEntry,
  unpublishKbEntry,
} from "./actions";

const MANAGE_ROLES = new Set(["owner", "admin", "manager"]);
const PUBLISH_ROLES = new Set(["owner", "admin"]);

const TOAST_KEYS = new Set([
  "saved",
  "deleted",
  "published",
  "unpublished",
  "notAuthenticated",
  "forbidden",
  "notFound",
  "invalidInput",
  "publishForbidden",
  "deleteForbidden",
  "limitEntries",
  "limitChars",
]);
const ERROR_TO_TOAST_KEY: Record<string, string> = {
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
  invalid_input: "invalidInput",
  publish_forbidden: "publishForbidden",
  delete_forbidden: "deleteForbidden",
  limit_entries: "limitEntries",
  limit_chars: "limitChars",
};
function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}

/**
 * Gợi ý UI thuần — KHÔNG phải chốt chặn thật. Chốt thật nằm trong
 * `buildAutopilotSystemPrompt()` (luật cứng đọc SAU CÙNG, luôn thắng). Bỏ sót
 * ở đây chỉ là thiếu một gợi ý sớm, không phải một lỗ hổng.
 */
const OVERRIDE_HINTS = [
  "hứa",
  "cam kết",
  "hoàn tiền",
  "đặt lịch",
  "chốt lịch",
  "nhận cọc",
  "nhận tiền",
  "giảm giá",
  "khuyến mãi",
  "chắc chắn khỏi",
];
function looksLikeOverrideAttempt(text: string): boolean {
  const low = text.toLowerCase();
  return OVERRIDE_HINTS.some((k) => low.includes(k));
}

export function KnowledgeView({
  role,
  initialEntries,
  initialCustomInstruction,
}: {
  role: string;
  initialEntries: KbEntry[];
  initialCustomInstruction: string | null;
}) {
  const t = useTranslations("settings.knowledgeBase");
  const locale = useLocale() as "vi" | "en";
  const canManage = MANAGE_ROLES.has(role);
  const canPublish = PUBLISH_ROLES.has(role);

  const [entries, setEntries] = useState(initialEntries);
  const [pending, startTransition] = useTransition();

  // --- soạn/sửa mục ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const usage = useMemo(() => kbUsage(entries), [entries]);

  function openNew() {
    setEditingId(null);
    setQuestion("");
    setAnswer("");
    setFormOpen(true);
  }
  function openEdit(e: KbEntry) {
    setEditingId(e.id);
    setQuestion(e.question);
    setAnswer(e.answer);
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setQuestion("");
    setAnswer("");
  }

  function submitEntry() {
    if (pending || !question.trim() || !answer.trim()) return;
    startTransition(async () => {
      const res = await saveKbEntry({
        id: editingId ?? undefined,
        question: question.trim(),
        answer: answer.trim(),
      });
      if (res.error || !res.entries) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      setEntries(res.entries);
      toast.success(t("toasts.saved"));
      closeForm();
    });
  }

  function togglePublish(e: KbEntry) {
    if (pending) return;
    startTransition(async () => {
      const res = e.status === "published" ? await unpublishKbEntry(e.id) : await publishKbEntry(e.id);
      if (res.error || !res.entries) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      setEntries(res.entries);
      toast.success(t(e.status === "published" ? "toasts.unpublished" : "toasts.published"));
    });
  }

  // --- xoá (hỏi lại một lần) ---
  const [deleteTarget, setDeleteTarget] = useState<KbEntry | null>(null);
  function confirmDelete() {
    if (!deleteTarget || pending) return;
    const target = deleteTarget;
    startTransition(async () => {
      const res = await deleteKbEntry(target.id);
      if (res.error || !res.entries) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      setEntries(res.entries);
      toast.success(t("toasts.deleted"));
      setDeleteTarget(null);
    });
  }

  // --- lời dặn riêng ---
  const [instruction, setInstruction] = useState(initialCustomInstruction ?? "");
  const [savedInstruction, setSavedInstruction] = useState(initialCustomInstruction ?? "");
  const [instrPending, startInstrTransition] = useTransition();
  const instrDirty = instruction !== savedInstruction;
  function saveInstruction() {
    if (instrPending || !instrDirty) return;
    startInstrTransition(async () => {
      const res = await saveCustomInstruction(instruction);
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      setSavedInstruction(res.customInstruction ?? "");
      setInstruction(res.customInstruction ?? "");
      toast.success(t("toasts.saved"));
    });
  }

  // --- "Xem AI đang đọc gì" — hộp phủ, dựng ĐÚNG bằng buildAutopilotSystemPrompt ---
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  function openPreview() {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewText(null);
    previewAutopilotPrompt().then((res) => {
      setPreviewLoading(false);
      if (res.error || !res.prompt) {
        toast.error(t("preview.error"));
        setPreviewOpen(false);
        return;
      }
      setPreviewText(res.prompt);
    });
  }

  const sorted = useMemo(
    () => [...entries].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    [entries],
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-24 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" onClick={openPreview} className="shrink-0">
              <BookOpen className="mr-1.5 size-3.5" aria-hidden />
              {t("preview.trigger")}
            </Button>
          )}
        </div>

        {/* ---- danh sách ---- */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("title")}</h2>
            <span className="text-xs text-muted-foreground">
              {t("usage", {
                count: usage.count,
                max: KB_MAX_ENTRIES,
                chars: usage.chars,
                maxChars: KB_MAX_CHARS,
              })}
            </span>
          </div>

          {sorted.length === 0 ? (
            <div className="mt-3 rounded-md border border-dashed p-6 text-center">
              <p className="text-sm font-medium">{t("empty.title")}</p>
              <p className="mx-auto mt-1.5 max-w-xs text-[13px] text-muted-foreground">{t("empty.body")}</p>
              <Button size="sm" className="mt-3" onClick={openNew}>
                {t("empty.cta")}
              </Button>
            </div>
          ) : (
            <>
              <ul className="mt-3 divide-y">
                {sorted.map((e) => {
                  const stale = e.status === "published" && isKbEntryStale(e.updatedAt);
                  return (
                    <li key={e.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold">{e.question}</p>
                        <Badge
                          className="shrink-0"
                          variant={e.status === "published" ? "default" : "secondary"}
                        >
                          {e.status === "published" ? t("entry.published") : t("entry.draft")}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{e.answer}</p>
                      <p
                        className={
                          e.status === "draft"
                            ? "mt-1 text-xs font-medium text-[--color-brand,#C94C18]"
                            : stale
                              ? "mt-1 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400"
                              : "mt-1 text-xs text-muted-foreground"
                        }
                      >
                        {stale && <AlertTriangle className="size-3" aria-hidden />}
                        {e.status === "draft"
                          ? t("entry.draftHint")
                          : stale
                            ? t("entry.stale", { date: formatDate(e.updatedAt, locale) })
                            : e.updatedByName
                              ? t("entry.updatedBy", { date: formatDate(e.updatedAt, locale), name: e.updatedByName })
                              : t("entry.updatedAt", { date: formatDate(e.updatedAt, locale) })}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => openEdit(e)}>
                          {t("entry.edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs"
                          disabled={!canPublish || pending}
                          onClick={() => togglePublish(e)}
                          title={!canPublish ? t("entry.publishHint") : undefined}
                        >
                          {e.status === "published" ? t("entry.unpublish") : t("entry.publish")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-destructive/30 px-2.5 text-xs text-destructive hover:bg-destructive/10"
                          disabled={!canPublish || pending}
                          onClick={() => setDeleteTarget(e)}
                        >
                          {t("entry.delete")}
                        </Button>
                        {!canPublish && (
                          <span className="text-xs text-muted-foreground">{t("entry.publishHint")}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Button size="sm" variant="outline" className="mt-3" onClick={openNew}>
                {t("entry.add")}
              </Button>
            </>
          )}
        </div>

        {/* ---- soạn/sửa (hộp phủ) ---- */}
        <Dialog open={formOpen} onOpenChange={(v) => (v ? setFormOpen(true) : closeForm())}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? t("entry.edit") : t("entry.add")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="kb-question">{t("entry.questionLabel")}</Label>
                <Input
                  id="kb-question"
                  value={question}
                  maxLength={KB_QUESTION_MAX}
                  placeholder={t("entry.questionPlaceholder")}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kb-answer">{t("entry.answerLabel")}</Label>
                <Textarea
                  id="kb-answer"
                  value={answer}
                  maxLength={KB_ANSWER_MAX}
                  rows={4}
                  placeholder={t("entry.answerPlaceholder")}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeForm} disabled={pending}>
                {t("entry.cancel")}
              </Button>
              <Button onClick={submitEntry} disabled={pending || !question.trim() || !answer.trim()}>
                {pending && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />}
                {t("entry.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---- xoá: hỏi lại một lần, nói AI mất gì ---- */}
        <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
              <DialogDescription>
                {deleteTarget && t("deleteDialog.description", { question: deleteTarget.question })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={pending}>
                {t("deleteDialog.cancel")}
              </Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={pending}>
                {t("deleteDialog.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---- lời dặn riêng — chỉ owner/admin/manager thấy ---- */}
        {canManage ? (
          <div className="rounded-lg border p-4">
            <h2 className="text-sm font-semibold">{t("customInstruction.title")}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("customInstruction.description")}</p>
            <Textarea
              className="mt-3"
              rows={3}
              maxLength={KB_CUSTOM_INSTRUCTION_MAX}
              placeholder={t("customInstruction.placeholder")}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {t("customInstruction.counter", { count: instruction.length })}
              </span>
              <Button size="sm" onClick={saveInstruction} disabled={!instrDirty || instrPending}>
                {t("customInstruction.save")}
              </Button>
            </div>
            {looksLikeOverrideAttempt(instruction) && (
              <div className="mt-2.5 flex gap-2 rounded-md bg-destructive/10 p-3 text-[12.5px] leading-relaxed text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{t("customInstruction.warning")}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border p-4">
            <h2 className="text-sm font-semibold text-muted-foreground">{t("customInstruction.title")}</h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{t("customInstruction.noPermission")}</p>
          </div>
        )}
      </div>

      {/* ---- "Xem AI đang đọc gì" — hộp phủ, KHÔNG phải trang riêng ---- */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("preview.title")}</DialogTitle>
            <DialogDescription>{t("preview.description")}</DialogDescription>
          </DialogHeader>
          {previewLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("preview.loading")}</p>
          ) : (
            <pre className="max-h-[60vh] overflow-y-auto rounded-md bg-muted/60 p-3 text-xs whitespace-pre-wrap">
              {previewText}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
