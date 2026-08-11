"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const OPEN_COUNT_KEY = "ifan_pwa_open_count";
const DISMISSED_UNTIL_KEY = "ifan_pwa_dismissed_until";
const MIN_OPENS_BEFORE_PROMPT = 3;
const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày

type BeforeInstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Mời cài lên màn hình chính (task #50, PWA bước 2 — thẻ design man-pwa.html
 * nhóm 1). Ba luật đã chốt lúc vẽ thẻ:
 * - Hiện sau ~3 lần mở app, KHÔNG hiện ngay lần đầu — người mới chưa biết
 *   iFan là gì mà đã đòi cài là phản tác dụng.
 * - Bấm "Để sau" là im 30 ngày, không hỏi lại mỗi lần mở.
 * - iOS Safari không có beforeinstallprompt (Apple không hỗ trợ) — hiện thẳng
 *   3 bước tay thay vì chờ một sự kiện không bao giờ tới.
 */
export function InstallPrompt() {
  const t = useTranslations("pwa.install");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // đã cài rồi, khỏi mời nữa

    const dismissedUntil = Number(localStorage.getItem(DISMISSED_UNTIL_KEY) ?? 0);
    if (Date.now() < dismissedUntil) return;

    const count = Number(localStorage.getItem(OPEN_COUNT_KEY) ?? 0) + 1;
    localStorage.setItem(OPEN_COUNT_KEY, String(count));
    if (count < MIN_OPENS_BEFORE_PROMPT) return;

    const revealForIOS = () => {
      setIos(true);
      setVisible(true);
    };
    if (isIOS()) {
      revealForIOS();
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_COOLDOWN_MS));
    setVisible(false);
    setShowIosSteps(false);
  };

  const install = async () => {
    if (ios) {
      setShowIosSteps(true);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible) return null;

  if (showIosSteps) {
    return (
      <div className="fixed inset-x-3 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom)_+_0.75rem)] z-50 mx-auto max-w-sm rounded-xl border bg-card p-4 shadow-lg sm:inset-x-auto sm:right-4 md:bottom-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-semibold">{t("iosTitle")}</p>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("close")}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("iosDescription")}</p>
        <ol className="mt-3 space-y-2 text-xs">
          {[t("iosStep1"), t("iosStep2"), t("iosStep3")].map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom)_+_0.75rem)] z-50 mx-auto flex max-w-sm items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 shadow-lg sm:inset-x-auto sm:right-4 md:bottom-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground">
        iF
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{t("title")}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("description")}</p>
        <div className="mt-2.5 flex gap-2">
          <Button size="sm" onClick={install}>
            {t("install")}
          </Button>
          <Button size="sm" variant="outline" onClick={dismiss}>
            {t("later")}
          </Button>
        </div>
      </div>
    </div>
  );
}
