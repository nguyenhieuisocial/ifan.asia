import { getTranslations } from "next-intl/server";
import { exitSampleTenant } from "@/app/auth/actions";
import type { Industry } from "@/lib/industries";

/**
 * Dải cam "đang xem tiệm mẫu" (15b, migration #64) — dính trên cùng MỌI màn
 * trong /app khi vai=viewer + tenant.is_sample=true (app/app/layout.tsx tự
 * tính, không phải component này đoán). Cam nhạt = "chế độ khác thường",
 * không dùng đỏ (đó là lỗi/nguy hiểm) — đúng thẻ design tiem-mau-tham-quan.html.
 */
export async function SampleTourBanner({ industry }: { industry: Industry | null }) {
  const t = await getTranslations("sampleTour.banner");
  const tIndustries = await getTranslations("common.industries");

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-[#ffeaca] bg-[#FAF5EF] px-4 py-2">
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#633f00]">
        <svg
          aria-hidden
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        {t("title", { industry: industry ? tIndustries(`${industry}.label`) : "" })}
      </span>
      <span className="text-[12.5px] text-muted-foreground">{t("subtitle")}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <form action={exitSampleTenant}>
          <button
            type="submit"
            className="h-[26px] rounded-md bg-primary px-3 text-[12.5px] font-semibold whitespace-nowrap text-primary-foreground hover:bg-primary-hover"
          >
            {t("cta")}
          </button>
        </form>
        <form action={exitSampleTenant}>
          <button
            type="submit"
            className="h-[26px] rounded-md px-2.5 text-[12.5px] whitespace-nowrap text-muted-foreground hover:text-foreground"
          >
            {t("exit")}
          </button>
        </form>
      </div>
    </div>
  );
}
