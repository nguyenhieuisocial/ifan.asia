"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/config";
import { saveLivechatSettings } from "./actions";

export type LivechatSettings = {
  embedKey: string | null;
  enabled: boolean;
  greeting: string;
  origins: string[];
  /**
   * Mốc tin gần nhất khách gửi về từ website (channels.last_event_at). Đây là
   * BẰNG CHỨNG duy nhất đoạn mã đã nằm trên trang thật — cấu hình đúng không
   * chứng minh được điều đó. Không đổi khi bấm Lưu.
   */
  lastEventAt: string | null;
};

/**
 * 5 tình trạng THẬT của hộp chat, đọc từ cấu hình đã lưu:
 *   notSetUp  — chưa bấm Lưu lần nào (chưa có khóa nhúng)
 *   off       — chủ shop chủ động tắt
 *   noOrigins — bật rồi nhưng CHƯA khai website nào → thực tế không ai nhắn được
 *   noSignal  — cấu hình đủ nhưng CHƯA có tin nào về → chưa biết mã đã dán chưa
 *   live      — đã nhận tin thật từ website đã khai → chạy được, có kiểm chứng
 */
type LivechatStatus = "notSetUp" | "off" | "noOrigins" | "noSignal" | "live";

function livechatStatus(s: LivechatSettings): LivechatStatus {
  if (!s.embedKey) return "notSetUp";
  if (!s.enabled) return "off";
  if (s.origins.length === 0) return "noOrigins";
  // Cấu hình đúng KHÔNG có nghĩa là đoạn mã đã nằm trên website. Khoe "đang
  // chạy" lúc này là để chủ tiệm yên tâm ngồi chờ tin không bao giờ tới.
  if (!s.lastEventAt) return "noSignal";
  return "live";
}

const STATUS_TONE: Record<LivechatStatus, string> = {
  notSetUp: "bg-muted/50",
  off: "bg-muted/50",
  noOrigins: "bg-status-pending text-status-pending-foreground",
  noSignal: "bg-status-pending text-status-pending-foreground",
  live: "bg-status-closed text-status-closed-foreground",
};

function Step({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-tint text-[13px] font-semibold text-primary">
          {index}
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {description && (
              <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
            )}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

export function LivechatView({
  canManage,
  initial,
}: {
  canManage: boolean;
  initial: LivechatSettings;
}) {
  const t = useTranslations("livechat.settings");
  const tChannels = useTranslations("settings.channels");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [greeting, setGreeting] = useState(initial.greeting);
  const [originText, setOriginText] = useState(initial.origins.join("\n"));
  const [embedKey, setEmbedKey] = useState(initial.embedKey);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  // Trạng thái nói SỰ THẬT nên chỉ đọc phần ĐÃ LƯU — gõ dở trong ô nhập không
  // được phép làm dòng trạng thái đổi theo (trước đây hộp chat khoe "đang bật,
  // khách nhắn được" ngay lúc chưa khai website nào, tức là chưa ai nhắn được).
  const [saved, setSaved] = useState<LivechatSettings>(initial);

  const snippet = useMemo(
    () =>
      `<script src="${SITE_URL}/livechat.js" data-ifan-key="${embedKey ?? ""}" async></script>`,
    [embedKey],
  );

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Lock className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{tChannels("noPermission.title")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">
          {tChannels("noPermission.description")}
        </p>
      </div>
    );
  }

  const save = () => {
    if (pending) return;
    const origins = originText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    startTransition(async () => {
      const res = await saveLivechatSettings({ enabled, greeting, origins });
      if (res.error || !res.data) {
        toast.error(t(`toasts.${res.error ?? "failed"}`));
        return;
      }
      const next = res.data;
      setEmbedKey(next.embedKey);
      setOriginText(next.origins.join("\n"));
      // Giữ lastEventAt: bấm Lưu không làm hộp chat xuất hiện trên website, nên
      // nó không được phép làm dòng trạng thái nhảy sang "đang chạy".
      setSaved((prev) => ({
        ...prev,
        embedKey: next.embedKey,
        enabled: next.enabled,
        greeting: next.greeting,
        origins: next.origins,
      }));
      toast.success(t("toasts.saved"));
    });
  };

  const status = livechatStatus(saved);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard bị chặn (http/quyền) — chủ shop bôi đen ô mã để copy tay
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
        <div>
          <Link
            href="/app/settings/channels"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            {t("back")}
          </Link>
          <h1 className="mt-2 text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
        </div>

        <div className={cn("rounded-lg border p-3", STATUS_TONE[status])}>
          <p className="text-sm font-semibold">{t(`status.${status}.title`)}</p>
          <p className="mt-0.5 text-[13px]">{t(`status.${status}.detail`)}</p>
        </div>

        <Step index={1} title={t("enable.title")} description={t("enable.description")}>
          <Label className="cursor-pointer">
            <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {enabled ? t("enable.on") : t("enable.off")}
          </Label>
        </Step>

        <Step index={2} title={t("domains.title")} description={t("domains.description")}>
          <Textarea
            id="lc-origins"
            rows={3}
            value={originText}
            onChange={(e) => setOriginText(e.target.value)}
            placeholder={t("domains.placeholder")}
            spellCheck={false}
            className="font-mono"
            aria-label={t("domains.title")}
          />
          <p className="text-[13px] text-muted-foreground">{t("domains.hint")}</p>
        </Step>

        <Step index={3} title={t("greeting.title")} description={t("greeting.description")}>
          <Input
            id="lc-greeting"
            value={greeting}
            maxLength={300}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder={t("greeting.placeholder")}
            aria-label={t("greeting.title")}
          />
        </Step>

        <div className="flex justify-end">
          <Button onClick={save} disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
        </div>

        <Step index={4} title={t("snippet.title")} description={t("snippet.description")}>
          {embedKey ? (
            <>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                <code>{snippet}</code>
              </pre>
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? t("snippet.copied") : t("snippet.copy")}
              </Button>
              <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-muted-foreground">
                <li>{t("snippet.how1")}</li>
                <li>{t("snippet.how2")}</li>
                <li>{t("snippet.how3")}</li>
                <li>{t("snippet.how4")}</li>
              </ol>
            </>
          ) : (
            <p className="rounded-md bg-muted/50 p-3 text-[13px] text-muted-foreground">
              {t("snippet.locked")}
            </p>
          )}
        </Step>
      </div>
    </div>
  );
}
