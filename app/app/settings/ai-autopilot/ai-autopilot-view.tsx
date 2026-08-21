"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bot, ChevronRight, Lock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import {
  AUTOPILOT_DAILY_CAP_MAX,
  AUTOPILOT_DAILY_CAP_MIN,
  AUTOPILOT_TURNS_MAX,
  AUTOPILOT_TURNS_MIN,
  canEnableAutopilot,
  REPLY_LOG_LIMIT_MAX,
  REPLY_LOG_PAGE_SIZE,
  type AutopilotConfig,
  type AutopilotScope,
  type AutopilotSourceStatus,
  type ReplyLogRow,
} from "@/lib/ai/autopilot";
import { saveAutopilotConfig } from "./actions";

export type AiAutopilotSettings = {
  config: AutopilotConfig;
  source: AutopilotSourceStatus;
  log: ReplyLogRow[];
  /** TỔNG dòng nhật ký của tiệm — màn PHẢI nói ra khi danh sách bị cắt. */
  logTotal: number;
  /** Số dòng trang hiện tại đang xin (từ `?log=`). */
  logLimit: number;
};

const TOAST_KEYS = new Set([
  "notAuthenticated",
  "forbidden",
  "notFound",
  "invalidInput",
  "noSource",
  "saveFailed",
]);
const ERROR_TO_TOAST_KEY: Record<string, string> = {
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
  invalid_input: "invalidInput",
  no_source: "noSource",
};
function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}

/** Clamp số nguyên vào [min, max] — ô nhập trống hay gõ chữ đều rơi về min, không phải NaN lọt qua. */
function clampInt(raw: string, min: number, max: number): number {
  const n = Number(raw.replace(/\D/g, ""));
  if (!Number.isFinite(n) || n < min) return min;
  return Math.min(n, max);
}

export function AiAutopilotView({
  canManage,
  initial,
}: {
  canManage: boolean;
  initial: AiAutopilotSettings;
}) {
  const t = useTranslations("settings.aiAutopilot");
  const tOutcome = useTranslations("settings.aiAutopilot.log.outcomes");
  const locale = useLocale() as "vi" | "en";

  const [enabled, setEnabled] = useState(initial.config.enabled);
  const [scope, setScope] = useState<AutopilotScope>(initial.config.scope);
  const [maxTurns, setMaxTurns] = useState(String(initial.config.maxTurnsPerConversation));
  const [dailyCap, setDailyCap] = useState(String(initial.config.dailyCap));
  const [savedConfig, setSavedConfig] = useState(initial.config);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("noPermission.title")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">{t("noPermission.description")}</p>
      </div>
    );
  }

  const canEnable = canEnableAutopilot(initial.source);
  // Ca "bẫy im lặng" (thẻ man-ai-truc-viec.html): chọn ngoài giờ mà chưa khai
  // giờ — vẫn cho gạt công tắc (tiệm CÓ dịch vụ nên qua được cửa canEnable),
  // nhưng phải nói ra chứ không để AI tự nhiên không bao giờ trả lời.
  const scopeGap = scope === "outside_hours" && !initial.source.hasBusinessHours;

  const dirty =
    enabled !== savedConfig.enabled ||
    scope !== savedConfig.scope ||
    Number(maxTurns) !== savedConfig.maxTurnsPerConversation ||
    Number(dailyCap) !== savedConfig.dailyCap;

  const save = () => {
    if (pending || !dirty) return;
    startTransition(async () => {
      const res = await saveAutopilotConfig({
        enabled,
        scope,
        maxTurnsPerConversation: clampInt(maxTurns, AUTOPILOT_TURNS_MIN, AUTOPILOT_TURNS_MAX),
        dailyCap: clampInt(dailyCap, AUTOPILOT_DAILY_CAP_MIN, AUTOPILOT_DAILY_CAP_MAX),
      });
      if (res.error || !res.config) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      setSavedConfig(res.config);
      setEnabled(res.config.enabled);
      setScope(res.config.scope);
      setMaxTurns(String(res.config.maxTurnsPerConversation));
      setDailyCap(String(res.config.dailyCap));
      toast.success(t("toasts.saved"));
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-24 sm:p-6">
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>

          {!canEnable ? (
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-muted-foreground" aria-hidden />
                <h2 className="text-sm font-semibold text-muted-foreground">{t("locked.title")}</h2>
              </div>
              <p className="mt-2.5 rounded-md bg-muted/60 p-3 text-[13px] leading-relaxed text-muted-foreground">
                {t("locked.body")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href="/app/settings/services">{t("locked.ctaServices")}</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/app/settings/channels/storefront">{t("locked.ctaHours")}</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-[--color-brand,#C94C18]" aria-hidden />
                <h2 className="text-sm font-semibold">{t("title")}</h2>
              </div>

              <label className="mt-3 flex items-center gap-2.5">
                <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span className="text-sm font-medium">
                  {enabled ? t("enabledOn") : t("enabledOff")}
                </span>
              </label>

              {enabled && (
                <>
                  <div className="mt-4 space-y-1.5">
                    <Label htmlFor="ai-scope">{t("scope.label")}</Label>
                    <Select
                      id="ai-scope"
                      value={scope}
                      onChange={(e) => setScope(e.target.value as AutopilotScope)}
                      className="w-full sm:w-64"
                    >
                      <option value="outside_hours">{t("scope.outsideHours")}</option>
                      <option value="always">{t("scope.always")}</option>
                    </Select>
                  </div>

                  {scopeGap && (
                    <div className="mt-3 rounded-md bg-amber-500/10 p-3 text-[13px] leading-relaxed text-amber-800 dark:text-amber-300">
                      <p>{t("scopeGap.body")}</p>
                      <Button asChild size="sm" className="mt-2">
                        <Link href="/app/settings/channels/storefront">{t("scopeGap.cta")}</Link>
                      </Button>
                    </div>
                  )}

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-daily-cap">{t("dailyCapLabel")}</Label>
                      <Input
                        id="ai-daily-cap"
                        value={dailyCap}
                        inputMode="numeric"
                        onChange={(e) =>
                          setDailyCap(e.target.value.replace(/\D/g, "").slice(0, 3))
                        }
                        className="w-28"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-turns">{t("turnsLabel")}</Label>
                      <Input
                        id="ai-turns"
                        value={maxTurns}
                        inputMode="numeric"
                        onChange={(e) =>
                          setMaxTurns(e.target.value.replace(/\D/g, "").slice(0, 2))
                        }
                        className="w-28"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{t("turnsHint")}</p>
                </>
              )}
            </div>
          )}

          <div id="log" className="scroll-mt-4 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">{t("log.title")}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("log.description")}</p>
            {initial.log.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">{t("log.empty")}</p>
            ) : (
              <>
                <ul className="mt-3 divide-y">
                  {initial.log.map((row) => (
                    <li key={row.id} className="py-1">
                      {/* Mỗi dòng là một ĐƯỜNG VỀ hội thoại. Trước đây
                          `conversationId` được tải xuống trình duyệt rồi vứt —
                          chủ tiệm đọc "AI không trả lời" xong không có cách nào
                          đi tiếp tới khách đang chờ. 44px chiều cao cho ngón tay. */}
                      <Link
                        href={`/app/inbox?c=${row.conversationId}`}
                        className="flex min-h-[44px] items-center gap-3 rounded-md px-2 text-[13px] hover:bg-muted/60"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {row.contactName ?? t("log.contactUnknown")}
                        </span>
                        <span
                          className={
                            row.outcome === "sent"
                              ? "shrink-0 text-[--color-brand,#C94C18]"
                              : row.outcome === "error"
                                ? "shrink-0 text-destructive"
                                : "shrink-0 text-muted-foreground"
                          }
                        >
                          {tOutcome(row.outcome)}
                        </span>
                        <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">
                          {formatDateTime(row.createdAt, locale)}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </Link>

                      {/* ⭐ XUNG ĐỘT DỮ LIỆU — lý do cả cột này tồn tại.
                          AI đã phát hiện kho tri thức nói khác dữ liệu gốc và
                          ghi lại "để tiệm THẤY mà sửa" (migration #116). Từ lúc
                          có cột tới nay KHÔNG màn nào đọc nó: giá cũ / giờ cũ
                          nằm trong kho mãi, AI biết, chủ tiệm không bao giờ biết. */}
                      {row.dataConflict && (
                        <div className="mx-2 mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
                          <p className="flex items-start gap-2 text-[13px] font-medium">
                            <TriangleAlert
                              className="mt-0.5 size-4 shrink-0 text-amber-600"
                              aria-hidden
                            />
                            <span>{t("log.conflictTitle")}</span>
                          </p>
                          <p className="mt-1 pl-6 text-[13px] text-muted-foreground">
                            {row.dataConflict}
                          </p>
                          <Link
                            href="/app/settings/knowledge"
                            className="ml-6 mt-1.5 inline-flex min-h-[44px] items-center text-[13px] font-medium underline underline-offset-4"
                          >
                            {t("log.conflictCta")}
                          </Link>
                        </div>
                      )}

                      {/* Mục KB đã dùng — phân biệt "AI kém" với "một mục KB
                          viết sai" (migration #113 ghi "BẮT BUỘC"). Bấm thẳng
                          tới mục để sửa, không phải đi mò cả kho. */}
                      {row.kbRefs.length > 0 && (
                        <p className="mx-2 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-0 text-xs text-muted-foreground">
                          <span>{t("log.kbUsed")}</span>
                          {row.kbRefs.map((k) =>
                            k.question === null ? (
                              <span key={k.id} className="italic">
                                {t("log.kbDeleted")}
                              </span>
                            ) : (
                              <Link
                                key={k.id}
                                href={`/app/settings/knowledge#kb-${k.id}`}
                                className="inline-flex min-h-[44px] items-center underline underline-offset-4"
                              >
                                {k.question}
                              </Link>
                            ),
                          )}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                {/* Danh sách bị cắt thì PHẢI NÓI RA — im lặng cắt là để chủ tiệm
                    tưởng mình đã xem hết. */}
                {initial.logTotal > initial.log.length ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {t("log.showing", {
                        shown: initial.log.length,
                        total: initial.logTotal,
                      })}
                    </p>
                    {/* Chạm trần cứng thì KHÔNG hiện nút nữa: bấm cũng không ra
                        thêm dòng nào (parseLogLimit kẹp lại), mà một cái nút bấm
                        mãi không đổi gì còn khó hiểu hơn là nói thẳng ra.
                        `#log` để tải xong quay lại đúng khối nhật ký, không quăng
                        người đọc lên đầu trang — nên KHÔNG đặt `scroll={false}`. */}
                    {initial.logLimit >= REPLY_LOG_LIMIT_MAX ? (
                      <p className="text-xs text-muted-foreground">{t("log.capReached")}</p>
                    ) : (
                      <Button asChild variant="outline" size="sm" className="min-h-[44px] w-full">
                        <Link
                          href={`/app/settings/ai-autopilot?log=${Math.min(
                            initial.logLimit + REPLY_LOG_PAGE_SIZE,
                            REPLY_LOG_LIMIT_MAX,
                          )}#log`}
                        >
                          {t("log.loadMore")}
                        </Link>
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("log.showingAll", { total: initial.logTotal })}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {canEnable && (
        <div className="border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <Button onClick={save} disabled={!dirty || pending} size="sm">
              {pending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
