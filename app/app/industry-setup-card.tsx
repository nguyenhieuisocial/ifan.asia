"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INDUSTRIES, type Industry } from "@/lib/industries";
import { applyIndustryTemplate } from "./actions";

/**
 * Card gọn có-thể-ẩn trên Tổng quan: tenant chưa chọn ngành (industry null)
 * + user là owner/admin (page.tsx kiểm trước khi render) → chọn ngành để
 * nhận bộ tag + câu trả lời nhanh mẫu. Ẩn = chỉ trong phiên; card tự biến
 * mất vĩnh viễn sau khi áp dụng vì industry hết null.
 */
export function IndustrySetupCard() {
  const t = useTranslations("dashboard.industrySetup");
  const tIndustries = useTranslations("common.industries");
  const router = useRouter();
  const [industry, setIndustry] = useState<Industry | "">("");
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  const apply = () => {
    if (!industry) return;
    startTransition(async () => {
      const res = await applyIndustryTemplate(industry);
      if (res.error) {
        toast.error(t("failed"));
        return;
      }
      toast.success(t("applied"));
      router.refresh();
    });
  };

  return (
    <section className="relative rounded-lg border bg-card p-4">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 text-muted-foreground"
        aria-label={t("dismiss")}
        title={t("dismiss")}
        onClick={() => setHidden(true)}
      >
        <X />
      </Button>
      <h2 className="flex items-center gap-2 pr-10 text-sm font-semibold">
        <Sparkles className="size-4 text-primary" />
        {t("title")}
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {t("description")}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value as Industry | "")}
          aria-label={t("title")}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="" disabled>
            {t("selectPlaceholder")}
          </option>
          {INDUSTRIES.map((key) => (
            <option key={key} value={key}>
              {tIndustries(`${key}.label`)}
            </option>
          ))}
        </select>
        <Button disabled={pending || !industry} onClick={apply}>
          {t("apply")}
        </Button>
      </div>
    </section>
  );
}
