"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Check, Image as ImageIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { INDUSTRIES, type Industry } from "@/lib/industries";
import { applyIndustryTemplate } from "../../actions";
import { removeTenantLogo, uploadTenantLogo } from "./actions";

export type PackContent = {
  terminology?: { contact?: string; deal?: string; deal_won?: string };
  sample_data?: {
    tags?: string[];
    quick_replies?: { title: string; content: string }[];
  };
};

type Props = {
  canManage: boolean;
  currentKey: Industry | null;
  packs: Partial<Record<Industry, PackContent>>;
  logoUrl: string | null;
};

/** Logo tiệm — kiểm sơ bộ phía client, server validate lại là chốt thật. */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Cài đặt → Ngành & giao diện. Chọn ngành = chọn TEMPLATE thông minh (Quy
 * hoạch mục 11): đổi từ vựng + gợi ý dữ liệu mẫu, KHÔNG xoá dữ liệu đang có.
 * Thẻ design: design-system/industry-settings.html (2 nhóm biến thể —
 * chủ/quản trị viên vs nhân viên thường).
 */
export function IndustryView({ canManage, currentKey, packs, logoUrl }: Props) {
  const t = useTranslations("settings.industry");
  const tIndustries = useTranslations("common.industries");
  const router = useRouter();
  const [previewKey, setPreviewKey] = useState<Industry | "">("");
  const [pending, startTransition] = useTransition();
  const [logoPending, startLogoTransition] = useTransition();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const currentPack = currentKey ? packs[currentKey] : undefined;
  const previewPack = previewKey ? packs[previewKey] : undefined;

  const apply = () => {
    if (!previewKey) return;
    startTransition(async () => {
      const res = await applyIndustryTemplate(previewKey);
      if (res.error) {
        toast.error(t("toasts.failed"));
        return;
      }
      toast.success(t("toasts.applied"));
      setPreviewKey("");
      router.refresh();
    });
  };

  const pickLogo = (picked: File | undefined) => {
    if (!picked) return;
    if (!ALLOWED_LOGO_TYPES.has(picked.type)) {
      toast.error(t("logo.toasts.invalidType"));
      return;
    }
    if (picked.size > LOGO_MAX_BYTES) {
      toast.error(t("logo.toasts.tooLarge"));
      return;
    }
    startLogoTransition(async () => {
      const res = await uploadTenantLogo(picked);
      if (res.error) {
        toast.error(t("logo.toasts.failed"));
        return;
      }
      toast.success(t("logo.toasts.uploaded"));
      router.refresh();
    });
  };

  const removeLogo = () => {
    startLogoTransition(async () => {
      const res = await removeTenantLogo();
      if (res.error) {
        toast.error(t("logo.toasts.failed"));
        return;
      }
      toast.success(t("logo.toasts.removed"));
      router.refresh();
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {/* Ngành đang dùng */}
        <section className="rounded-lg border bg-card p-4">
          <p className="text-[13px] text-muted-foreground">{t("currentLabel")}</p>
          {currentKey ? (
            <div className="mt-1 flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden />
              <span className="text-sm font-semibold">
                {tIndustries(`${currentKey}.label`)}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t("notChosen")}</p>
          )}
        </section>

        {/* Logo tiệm — thẻ design tep-dinh-kem.html nhóm 3 (chưa có)/nhóm 4 (đã có).
            Mọi vai xem được; chỉ owner/admin thấy nút thao tác (staff/viewer chỉ-đọc,
            đúng luật màn này — xem access.ts). */}
        <section className="rounded-lg border bg-card p-4">
          <p className="text-sm font-semibold">{t("logo.title")}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {t("logo.description")}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL ký riêng (bucket private), không hợp với next/image remote patterns
                <img src={logoUrl} alt="" className="size-full object-cover" />
              ) : (
                <ImageIcon className="size-6 text-muted-foreground/60" aria-hidden />
              )}
            </div>
            {canManage && (
              <div className="flex flex-col items-start gap-1.5">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={logoPending}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {logoUrl ? t("logo.change") : t("logo.upload")}
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={logoPending}
                      onClick={removeLogo}
                    >
                      {t("logo.remove")}
                    </Button>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{t("logo.hint")}</span>
              </div>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              pickLogo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </section>

        {!canManage && (
          <p className="text-[13px] text-muted-foreground">{t("onlyAdmin")}</p>
        )}

        {canManage && (
          <section className="rounded-lg border p-4">
            <h2 className="text-sm font-semibold">{t("changeTitle")}</h2>
            <Select
              value={previewKey}
              onChange={(e) => setPreviewKey(e.target.value as Industry | "")}
              aria-label={t("changeTitle")}
              className="mt-3"
            >
              <option value="" disabled>
                {t("selectPlaceholder")}
              </option>
              {INDUSTRIES.filter((key) => key !== currentKey).map((key) => (
                <option key={key} value={key}>
                  {tIndustries(`${key}.label`)}
                </option>
              ))}
            </Select>

            {previewKey && previewPack && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <Check className="size-3.5 text-primary" aria-hidden />
                  {t("preview.title")}
                </p>
                <div className="mt-3 space-y-2 text-[13px]">
                  {(
                    [
                      ["contact", "contact"],
                      ["deal", "deal"],
                      ["dealWon", "deal_won"],
                    ] as const
                  ).map(([labelKey, field]) => (
                    <div key={field} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-muted-foreground">
                        {t(`preview.${labelKey}`)}
                      </span>
                      <span className="text-muted-foreground line-through decoration-muted-foreground/50">
                        {currentPack?.terminology?.[field] ?? "—"}
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="font-medium">
                        {previewPack.terminology?.[field] ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("preview.sampleData", {
                    tags: previewPack.sample_data?.tags?.length ?? 0,
                    replies: previewPack.sample_data?.quick_replies?.length ?? 0,
                  })}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button disabled={pending} onClick={apply}>
                    {t("confirm")}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setPreviewKey("")}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
