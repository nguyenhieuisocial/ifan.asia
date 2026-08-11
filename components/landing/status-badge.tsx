import { getTranslations } from "next-intl/server";

const VARIANTS = {
  available: "bg-status-closed text-status-closed-foreground",
  coming: "bg-status-pending text-status-pending-foreground",
} as const;

export type StatusBadgeVariant = keyof typeof VARIANTS;

/**
 * Huy hiệu trung thực Sẵn sàng / Sắp có — chuẩn hóa một kiểu cho landing.
 * Huy hiệu "Sẵn sàng" lóe sáng MỘT lần khi vào tầm nhìn: data-sparkle +
 * .badge-sparkle (landing-fx.tsx thêm .sparkle-run); mặc định tĩnh, không JS
 * không mất gì.
 */
export async function StatusBadge({
  variant,
}: {
  variant: StatusBadgeVariant;
}) {
  const t = await getTranslations("landing.badge");
  const sparkle = variant === "available";
  return (
    <span
      data-sparkle={sparkle ? "" : undefined}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${
        sparkle ? "badge-sparkle " : ""
      }${VARIANTS[variant]}`}
    >
      {t(variant)}
    </span>
  );
}
