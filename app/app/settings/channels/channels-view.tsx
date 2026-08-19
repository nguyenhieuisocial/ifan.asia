"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Clock, Copy, ExternalLink, Lock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/config";
import { formatVN } from "@/lib/datetime";
import { CHANNEL_LABELS } from "@/app/app/inbox/types";
import { connectZaloChannel, disconnectZaloChannel } from "../actions";
import { TelegramCard, type TelegramChannelRow } from "./telegram-card";

export type ZaloChannelRow = {
  id: string;
  external_id: string | null;
  display_name: string | null;
  status: string;
  connected_at: string | null;
};

export type LiveChatChannelRow = {
  id: string;
  status: string;
  last_event_at: string | null;
  /** Số website đã khai. 0 = đoạn mã bị chặn ở mọi trang → thực tế chưa ai nhắn được. */
  origin_count: number;
};

export type StorefrontChannelRow = {
  enabled: boolean;
  leadFormEnabled: boolean;
};

/**
 * URL webhook — dán vào cấu hình app tại developers.zalo.me.
 * Dẫn từ SITE_URL (luật D1: mọi địa chỉ MỘT nguồn — NEXT_PUBLIC_SITE_URL),
 * không hard-code tên miền deploy: đổi domain là màn này tự đúng theo.
 */
const ZALO_WEBHOOK_URL = `${SITE_URL}/api/webhooks/zalo`;
/** Hồ sơ xác thực OA (nguồn đã dẫn trong nghiên cứu khả thi). */
const ZALO_VERIFY_DOCS_URL =
  "https://oa.zalo.me/home/documents/guides/ho-so-xac-thuc_74";

/** Các kênh đợt sau — hiện card mờ "sắp có" theo grid spec §4.1. */
const UPCOMING_CHANNELS = [
  "facebook",
  "instagram",
  "gmail",
  "tiktok_shop",
] as const;

const CONNECT_TOAST_KEYS: Record<string, string> = {
  oa_already_connected: "oaTaken",
  forbidden: "forbidden",
  rate_limited: "tryLater",
};

type ConnectFormValues = {
  oaId: string;
  oaName: string;
  accessToken: string;
  refreshToken: string;
};

const EMPTY_FORM: ConnectFormValues = {
  oaId: "",
  oaName: "",
  accessToken: "",
  refreshToken: "",
};

/** Form kết nối — nằm trong DialogContent nên tự reset state khi đóng. */
function ConnectForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("settings.channels.zalo");
  const tCommon = useTranslations("common");
  const [values, setValues] = useState<ConnectFormValues>(EMPTY_FORM);
  const [pending, startTransition] = useTransition();

  const set = (patch: Partial<ConnectFormValues>) =>
    setValues((v) => ({ ...v, ...patch }));

  const submit = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await connectZaloChannel(values);
      if (res.error) {
        toast.error(t(`toasts.${CONNECT_TOAST_KEYS[res.error] ?? "failed"}`));
        return;
      }
      toast.success(t("toasts.connected"));
      onDone();
    });
  };

  const field = (
    id: string,
    key: keyof ConnectFormValues,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <Input
        id={id}
        value={values[key]}
        onChange={(e) => set({ [key]: e.target.value })}
        autoComplete="off"
        {...props}
      />
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-3"
    >
      <p className="text-[13px] text-muted-foreground">{t("form.hint")}</p>
      {field("zc-oa-id", "oaId", t("form.oaId"), {
        placeholder: t("form.oaIdPlaceholder"),
        required: true,
        autoFocus: true,
        inputMode: "numeric",
      })}
      {field("zc-oa-name", "oaName", t("form.oaName"), {
        placeholder: t("form.oaNamePlaceholder"),
      })}
      {field("zc-access", "accessToken", t("form.accessToken"), {
        type: "password",
        required: true,
      })}
      {field("zc-refresh", "refreshToken", t("form.refreshToken"), {
        type: "password",
        required: true,
      })}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {t("form.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Pill trạng thái kênh theo luật màu (xanh lá = hoạt động, đỏ = lỗi). */
function StatusPill({ status }: { status: string }) {
  const t = useTranslations("settings.channels.status");
  const styles: Record<string, { key: string; className: string }> = {
    active: {
      key: "connected",
      className: "bg-status-closed text-status-closed-foreground",
    },
    token_expired: {
      key: "tokenExpired",
      className: "bg-destructive/10 text-destructive",
    },
    pending_platform: {
      key: "pending",
      className: "bg-status-pending text-status-pending-foreground",
    },
    disconnected: {
      key: "notConnected",
      className: "bg-muted text-muted-foreground",
    },
    // Đã bật nhưng còn thiếu một bước bắt buộc → chưa chạy thật
    needs_setup: {
      key: "needsSetup",
      className: "bg-status-pending text-status-pending-foreground",
    },
  };
  const s = styles[status] ?? styles.disconnected;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold",
        s.className,
      )}
    >
      {t(s.key)}
    </span>
  );
}

function ZaloCard({ channel }: { channel: ZaloChannelRow | null }) {
  const t = useTranslations("settings.channels.zalo");
  const tCommon = useTranslations("common");
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const connected = channel !== null && channel.status !== "disconnected";
  const status = connected ? channel.status : "disconnected";

  const disconnect = () => {
    if (!channel || pending) return;
    startTransition(async () => {
      const res = await disconnectZaloChannel(channel.id);
      if (res.error) {
        toast.error(t(`toasts.${CONNECT_TOAST_KEYS[res.error] ?? "failed"}`));
        return;
      }
      toast.success(t("toasts.disconnected"));
      setConfirmOpen(false);
    });
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{CHANNEL_LABELS.zalo_oa}</p>
        <StatusPill status={status} />
      </div>

      {!connected && (
        <div className="mt-3 space-y-3">
          <div className="rounded-md bg-muted/50 p-3 text-[13px]">
            <p className="font-medium">{t("requirementsTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t("requirements")}</p>
            <a
              href={ZALO_VERIFY_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {t("docsLink")}
              <ExternalLink className="size-3.5" />
            </a>
          </div>
          <Button onClick={() => setFormOpen(true)}>{t("connect")}</Button>
        </div>
      )}

      {connected && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1 text-[13px]">
            {channel.display_name && (
              <p className="font-medium">{channel.display_name}</p>
            )}
            {channel.external_id && (
              <p className="text-muted-foreground">
                {t("oaIdMasked", {
                  masked: `••••${channel.external_id.slice(-4)}`,
                })}
              </p>
            )}
            {channel.connected_at && (
              <p className="text-muted-foreground">
                {t("connectedAt", { date: formatVN(channel.connected_at) })}
              </p>
            )}
          </div>
          {channel.status === "token_expired" && (
            <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-3 text-[13px] text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {t("tokenExpiredHint")}
            </p>
          )}
          {/* Chờ nền tảng duyệt là trạng thái KHÔNG có việc gì để bấm — nếu thẻ im
              lặng thì nút duy nhất còn lại là Ngắt kết nối, và chủ tiệm sẽ bấm nó. */}
          {channel.status === "pending_platform" && (
            <div className="rounded-md bg-status-pending p-3 text-[13px] text-status-pending-foreground">
              <p className="flex items-start gap-1.5">
                <Clock className="mt-0.5 size-4 shrink-0" />
                {t("pendingHint")}
              </p>
              <a
                href={ZALO_VERIFY_DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 font-medium underline"
              >
                {t("docsLink")}
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          )}
          <div className="flex gap-2">
            {channel.status === "token_expired" && (
              <Button onClick={() => setFormOpen(true)}>{t("reconnect")}</Button>
            )}
            {/* ghost: ngắt kết nối không bao giờ được là nút nổi nhất trên thẻ,
                kể cả khi nó là nút duy nhất (trạng thái hoạt động / chờ duyệt). */}
            <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
              {t("disconnect.button")}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("form.title")}</DialogTitle>
          </DialogHeader>
          <ConnectForm onDone={() => setFormOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("disconnect.title")}</DialogTitle>
            <DialogDescription>{t("disconnect.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={disconnect} disabled={pending}>
              {t("disconnect.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WebhookCard() {
  const t = useTranslations("settings.channels.webhook");
  const tLoi = useTranslations("errors");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ZALO_WEBHOOK_URL);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Bắt lỗi RỖNG = hỏng trong im lặng: trình duyệt từ chối chép (không phải
      // HTTPS, mất quyền, Safari cũ) thì không icon, không toast, không gì cả —
      // người dùng bấm mãi và không hiểu vì sao. Phải nói ra và chỉ đường làm tay.
      toast.error(tLoi("copyFailed"));
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-semibold">{t("title")}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 text-xs">
          {ZALO_WEBHOOK_URL}
        </code>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {t("copy")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Live Chat — kênh DUY NHẤT chủ shop tự bật được ngay, không chờ nền tảng nào
 * duyệt. Cấu hình chi tiết + mã nhúng nằm ở màn riêng (spec §4.5).
 */
function LiveChatCard({ channel }: { channel: LiveChatChannelRow | null }) {
  const t = useTranslations("livechat.card");
  const enabled = channel !== null && channel.status === "active";
  // Bật mà chưa khai website nào thì đoạn mã bị chặn ở MỌI trang — không được
  // phép hiện "Hoạt động", vì thực tế khách chưa nhắn được câu nào.
  const configured = enabled && channel.origin_count > 0;
  // Khai đủ website vẫn CHƯA chứng minh được đoạn mã đã dán lên website. Tin
  // gần nhất là bằng chứng duy nhất; chưa có tin nào thì chưa gắn "Hoạt động".
  const running = configured && channel.last_event_at !== null;
  const needsSetup = enabled && !running;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{CHANNEL_LABELS.livechat}</p>
        <StatusPill
          status={running ? "active" : needsSetup ? "needs_setup" : "disconnected"}
        />
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">{t("description")}</p>
      {needsSetup && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-status-pending p-3 text-[13px] text-status-pending-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {configured ? t("needsSnippet") : t("needsOrigins")}
        </p>
      )}
      {running && channel.last_event_at && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t("lastMessageAt", { date: formatVN(channel.last_event_at) })}
        </p>
      )}
      <Button asChild className="mt-3" variant={running ? "outline" : "default"}>
        <Link href="/app/settings/channels/livechat">
          {running ? t("manage") : t("setup")}
        </Link>
      </Button>
    </div>
  );
}

/** Mặt tiền công khai /t/[slug] + form thu lead (ADR-0008, task #88). */
function StorefrontCard({ channel }: { channel: StorefrontChannelRow | null }) {
  const t = useTranslations("storefront.card");
  const enabled = channel?.enabled ?? false;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{t("title")}</p>
        <StatusPill status={enabled ? "active" : "disconnected"} />
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">{t("description")}</p>
      <Button asChild className="mt-3" variant={enabled ? "outline" : "default"}>
        <Link href="/app/settings/channels/storefront">
          {enabled ? t("manage") : t("setup")}
        </Link>
      </Button>
    </div>
  );
}

function UpcomingChannels() {
  const tShell = useTranslations("shell");
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {UPCOMING_CHANNELS.map((key) => (
        <div
          key={key}
          className="flex items-center justify-between gap-2 rounded-lg border p-3 opacity-60"
        >
          <p className="truncate text-[13px] font-medium">
            {CHANNEL_LABELS[key]}
          </p>
          <Badge variant="secondary" className="shrink-0">
            {tShell("comingSoon")}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export function ChannelsView({
  canManage,
  channel,
  liveChatChannel,
  storefrontChannel,
  telegramChannel,
}: {
  canManage: boolean;
  channel: ZaloChannelRow | null;
  liveChatChannel: LiveChatChannelRow | null;
  storefrontChannel: StorefrontChannelRow | null;
  telegramChannel: TelegramChannelRow | null;
}) {
  const t = useTranslations("settings.channels");

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("noPermission.title")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">
          {t("noPermission.description")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <LiveChatCard channel={liveChatChannel} />
        <StorefrontCard channel={storefrontChannel} />
        <ZaloCard channel={channel} />
        <TelegramCard channel={telegramChannel} />
        <WebhookCard />
        <UpcomingChannels />
      </div>
    </div>
  );
}
