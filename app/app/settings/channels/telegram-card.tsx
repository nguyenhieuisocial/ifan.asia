"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
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
import { formatVN } from "@/lib/datetime";
import { CHANNEL_LABELS } from "@/app/app/inbox/types";
import {
  connectTelegramChannel,
  disconnectTelegramChannel,
} from "../actions";

export type TelegramChannelRow = {
  id: string;
  external_id: string | null;
  display_name: string | null;
  status: string;
  connected_at: string | null;
};

const BOTFATHER_URL = "https://t.me/BotFather";

/** Mã lỗi từ server → key câu thông báo. Lỗi lạ rơi về câu chung. */
const TOAST_KEYS: Record<string, string> = {
  invalid_input: "invalidToken",
  bot_already_connected: "alreadyConnected",
  webhook_failed: "webhookFailed",
  forbidden: "forbidden",
  rate_limited: "rateLimited",
};

/**
 * Thẻ nối bot Telegram (ADR-0013 việc 7).
 *
 * Chủ tiệm chỉ dán MỘT thứ: token từ @BotFather. Địa chỉ nhận tin do máy tự
 * đăng ký — khác Zalo phải dán tay vì cổng của họ nằm ở trang khác.
 */
export function TelegramCard({ channel }: { channel: TelegramChannelRow | null }) {
  const t = useTranslations("settings.channels.telegram");
  const tCommon = useTranslations("common");
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [token, setToken] = useState("");
  const [pending, startTransition] = useTransition();

  const connected = channel !== null && channel.status !== "disconnected";

  const connect = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await connectTelegramChannel({ botToken: token.trim() });
      if (res.error) {
        toast.error(t(`toasts.${TOAST_KEYS[res.error] ?? "failed"}`));
        return;
      }
      toast.success(t("toasts.connected"));
      setToken("");
      setFormOpen(false);
    });
  };

  const disconnect = () => {
    if (!channel || pending) return;
    startTransition(async () => {
      const res = await disconnectTelegramChannel(channel.id);
      if (res.error) {
        toast.error(t(`toasts.${TOAST_KEYS[res.error] ?? "failed"}`));
        return;
      }
      toast.success(t("toasts.disconnected"));
      setConfirmOpen(false);
    });
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{CHANNEL_LABELS.telegram}</p>
        <span
          className={
            connected
              ? "rounded-full bg-status-active px-2 py-0.5 text-xs font-medium text-status-active-foreground"
              : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          }
        >
          {connected ? t("statusConnected") : t("statusDisconnected")}
        </span>
      </div>

      {!connected && (
        <div className="mt-3 space-y-3">
          <div className="rounded-md bg-muted/50 p-3 text-[13px]">
            <p className="font-medium">{t("whyTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t("why")}</p>
            <a
              href={BOTFATHER_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {t("botFatherLink")}
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
                {t("botIdMasked", { masked: `••••${channel.external_id.slice(-4)}` })}
              </p>
            )}
            {channel.connected_at && (
              <p className="text-muted-foreground">
                {t("connectedAt", { date: formatVN(channel.connected_at) })}
              </p>
            )}
          </div>
          <Button variant="outline" onClick={() => setConfirmOpen(true)}>
            {t("disconnect")}
          </Button>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("formTitle")}</DialogTitle>
            <DialogDescription>{t("formHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AAH..."
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">{t("tokenPrivacy")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={connect} disabled={pending || token.trim() === ""}>
              {t("connect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("disconnectTitle")}</DialogTitle>
            <DialogDescription>{t("disconnectHint")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={disconnect} disabled={pending}>
              {t("disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
