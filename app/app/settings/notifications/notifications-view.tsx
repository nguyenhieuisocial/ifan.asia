"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  BellRing,
  Bot,
  Check,
  ExternalLink,
  Link2,
  RefreshCw,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
import {
  connectZaloBot,
  createBotLinkCode,
  disconnectZaloBot,
  saveBotPrefs,
  sendBotTest,
  unlinkZaloBot,
} from "./actions";

/** jsonb từ RPC bot_notify_status (#53) — trường admin-only là null với member. */
export type BotNotifyStatus = {
  has_channel: boolean;
  has_token: boolean;
  bot_name: string | null;
  connected_at: string | null;
  quota_used: number | null;
  quota_limit: number | null;
  linked: boolean;
  linked_at: string | null;
  pref: Record<string, unknown>;
};

const BOT_PLATFORM_URL = "https://bot.zapps.me";

type PrefState = {
  enabled: boolean;
  digestHour: number;
  kinds: { sla: boolean; today: boolean; unread: boolean };
};

/** Đọc pref jsonb PHÒNG THỦ — thiếu/hỏng khóa nào dùng mặc định (khớp #54). */
function prefFromStatus(pref: Record<string, unknown>): PrefState {
  const kinds =
    pref.kinds !== null && typeof pref.kinds === "object"
      ? (pref.kinds as Record<string, unknown>)
      : {};
  const hour =
    typeof pref.digest_hour === "number" &&
    Number.isInteger(pref.digest_hour) &&
    pref.digest_hour >= 0 &&
    pref.digest_hour <= 23
      ? pref.digest_hour
      : 8;
  return {
    enabled: pref.enabled !== false,
    digestHour: hour,
    kinds: {
      sla: kinds.sla !== false,
      today: kinds.today !== false,
      unread: kinds.unread !== false,
    },
  };
}

/** Khu quản bot của tiệm — chỉ owner/admin thấy. */
function BotCard({ status }: { status: BotNotifyStatus }) {
  const t = useTranslations("settings.notifications.bot");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const [token, setToken] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const connect = () => {
    if (pending || token.trim().length < 10) return;
    startTransition(async () => {
      const res = await connectZaloBot({ token });
      if (res.error) {
        const key =
          res.error === "token_invalid"
            ? "tokenInvalid"
            : res.error === "forbidden"
              ? "forbidden"
              : res.error === "rate_limited"
                ? "tryLater"
                : "failed";
        toast.error(t(`toasts.${key}`));
        return;
      }
      setToken("");
      // Token đã lưu nhưng chưa đăng ký được webhook → nói rõ, đừng im lặng.
      if (res.webhook === "failed") toast.warning(t("toasts.webhookFailed"));
      else toast.success(t("toasts.connected"));
    });
  };

  const disconnect = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await disconnectZaloBot();
      setConfirmOpen(false);
      if (res.error) {
        toast.error(t("toasts.failed"));
        return;
      }
      toast.success(t("toasts.disconnected"));
    });
  };

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="size-4 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">{t("title")}</h2>
        <Badge variant={status.has_token ? "secondary" : "outline"}>
          {t(status.has_token ? "connected" : "notConnected")}
        </Badge>
      </div>

      {status.has_token ? (
        <div className="mt-2 space-y-1 text-[13px] text-muted-foreground">
          {status.bot_name && <p>{t("connectedAs", { name: status.bot_name })}</p>}
          {status.connected_at && (
            <p>{t("connectedAt", { date: formatDateTime(status.connected_at, locale) })}</p>
          )}
          {status.quota_used !== null && status.quota_limit !== null && (
            <p>
              {t("quota", { used: status.quota_used, limit: status.quota_limit })}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-muted-foreground">{t("setupHint")}</p>
      )}

      <div className="mt-3 space-y-2">
        <Label htmlFor="bot-token">{t("tokenLabel")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="bot-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t("tokenPlaceholder")}
            autoComplete="off"
            className="sm:max-w-sm"
          />
          <Button
            onClick={connect}
            disabled={pending || token.trim().length < 10}
          >
            {t("connect")}
          </Button>
        </div>
        {status.has_token && (
          <p className="text-xs text-muted-foreground">{t("replaceHint")}</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={BOT_PLATFORM_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            {t("openPlatform")}
          </a>
        </Button>
        {status.has_token && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmOpen(true)}
          >
            {t("disconnect")}
          </Button>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>{t("confirmDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={disconnect} disabled={pending}>
              {t("disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Khu ghép nối Zalo cá nhân — mọi thành viên. */
function LinkCard({ status }: { status: BotNotifyStatus }) {
  const t = useTranslations("settings.notifications.link");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const createCode = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await createBotLinkCode();
      if (res.error || !res.code) {
        toast.error(t(res.error === "no_bot" ? "toasts.noBot" : "toasts.failed"));
        return;
      }
      setCode(res.code);
    });
  };

  const unlink = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await unlinkZaloBot();
      if (res.error) {
        toast.error(t("toasts.failed"));
        return;
      }
      toast.success(t("toasts.unlinked"));
    });
  };

  const test = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await sendBotTest();
      if (res.error) {
        const key =
          res.error === "not_configured"
            ? "testNotConfigured"
            : res.error === "quota_exceeded"
              ? "testQuota"
              : res.error === "rate_limited"
                ? "tryLater"
                : "testFailed";
        toast.error(t(`toasts.${key}`));
        return;
      }
      toast.success(t("toasts.testSent"));
    });
  };

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="size-4 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">{t("title")}</h2>
        {status.linked && (
          <Badge variant="secondary">
            <Check className="size-3" />
            {t("linkedBadge")}
          </Badge>
        )}
      </div>

      {status.linked ? (
        <div className="mt-2 space-y-3">
          <p className="text-[13px] text-muted-foreground">
            {status.linked_at
              ? t("linkedSince", { date: formatDateTime(status.linked_at, locale) })
              : t("linkedBadge")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={pending} onClick={test}>
              <Send className="size-4" />
              {t("sendTest")}
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={unlink}>
              {t("unlink")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
            <li>{t("step1")}</li>
            <li>
              {status.bot_name
                ? t("step2Named", { name: status.bot_name })
                : t("step2")}
            </li>
            <li>{t("step3")}</li>
          </ol>

          {code ? (
            <div className="rounded-md border border-dashed p-3">
              <p className="text-xs text-muted-foreground">{t("codeLabel")}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.3em]">
                {code}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("codeHint", { command: `/link ${code}` })}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("codeTtl")}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={pending} onClick={createCode}>
              {t(code ? "recreate" : "create")}
            </Button>
            {code && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => router.refresh()}
              >
                <RefreshCw className="size-4" />
                {t("checkLinked")}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Khu chọn loại thông báo + giờ nhận bản tin. */
function PrefsCard({ status }: { status: BotNotifyStatus }) {
  const t = useTranslations("settings.notifications.prefs");
  const [pref, setPref] = useState<PrefState>(() => prefFromStatus(status.pref));
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await saveBotPrefs(pref);
      if (res.error) {
        toast.error(t("toasts.failed"));
        return;
      }
      toast.success(t("toasts.saved"));
    });
  };

  const kindRow = (key: "sla" | "today" | "unread") => (
    <label className="flex items-center gap-2 text-[13px]">
      <Checkbox
        checked={pref.kinds[key]}
        onChange={(e) =>
          setPref((p) => ({
            ...p,
            kinds: { ...p.kinds, [key]: e.target.checked },
          }))
        }
      />
      <span>{t(`kinds.${key}`)}</span>
    </label>
  );

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <BellRing className="size-4 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">{t("title")}</h2>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>

      <div className="mt-3 space-y-2">
        <label className="flex items-center gap-2 text-[13px] font-medium">
          <Checkbox
            checked={pref.enabled}
            onChange={(e) => setPref((p) => ({ ...p, enabled: e.target.checked }))}
          />
          <span>{t("enabled")}</span>
        </label>

        <div className="space-y-2 pl-6">
          {kindRow("unread")}
          {kindRow("today")}
          {kindRow("sla")}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Label htmlFor="digest-hour" className="shrink-0">
            {t("digestHour")}
          </Label>
          <Select
            id="digest-hour"
            value={String(pref.digestHour)}
            onChange={(e) =>
              setPref((p) => ({ ...p, digestHour: Number(e.target.value) }))
            }
            className="w-28"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">{t("digestHint")}</p>
      </div>

      <div className="mt-3">
        <Button size="sm" onClick={save} disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </section>
  );
}

export function NotificationsView({
  canManage,
  status,
}: {
  canManage: boolean;
  status: BotNotifyStatus;
}) {
  const t = useTranslations("settings.notifications");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {canManage && <BotCard status={status} />}

        {status.has_channel ? (
          <>
            <LinkCard status={status} />
            <PrefsCard status={status} />
          </>
        ) : (
          /*
            Trước 13/08 nhánh này chỉ hiện cho NHÂN VIÊN. Chủ tiệm — người duy
            nhất sửa được — lại là người duy nhất không thấy gì, nên màn hình
            đứng im không nói bước kế tiếp là gì. Founder đã mắc đúng bẫy này:
            không thấy chỗ lấy mã nên đi tìm mã ở chỗ khác.
          */
          <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">
            {canManage ? t("ownerNoBotYet") : t("noBotYet")}
          </p>
        )}
      </div>
    </div>
  );
}
