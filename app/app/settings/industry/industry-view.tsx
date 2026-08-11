"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { INDUSTRIES, type Industry } from "@/lib/industries";
import { applyIndustryTemplate } from "../../actions";

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
};

/**
 * Cài đặt → Ngành & giao diện. Chọn ngành = chọn TEMPLATE thông minh (Quy
 * hoạch mục 11): đổi từ vựng + gợi ý dữ liệu mẫu, KHÔNG xoá dữ liệu đang có.
 * Bảng so sánh trước/sau (bất biến "thẻ design vẽ trước" — màn này build
 * trực tiếp từ token/component sẵn có của design-system, không có thẻ riêng
 * cho lần này do quy mô V1a; founder xem trực tiếp trên bản build).
 */
export function IndustryView({ canManage, currentKey, packs }: Props) {
  const t = useTranslations("settings.industry");
  const tIndustries = useTranslations("common.industries");
  const router = useRouter();
  const [previewKey, setPreviewKey] = useState<Industry | "">("");
  const [pending, startTransition] = useTransition();

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
