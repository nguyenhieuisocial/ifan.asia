import { getTranslations } from "next-intl/server";

const VARIANTS = {
  available: "bg-status-closed text-status-closed-foreground",
  coming: "bg-status-pending text-status-pending-foreground",
} as const;

export type StatusBadgeVariant = keyof typeof VARIANTS;

/** Huy hiệu trung thực Sẵn sàng / Sắp có — chuẩn hóa một kiểu cho landing. */
export async function StatusBadge({
  variant,
}: {
  variant: StatusBadgeVariant;
}) {
  const t = await getTranslations("landing.badge");
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${VARIANTS[variant]}`}
    >
      {t(variant)}
    </span>
  );
}
