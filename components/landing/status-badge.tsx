import { getTranslations } from "next-intl/server";
import type { FeatureStatus } from "@/lib/feature-registry";

const VARIANTS = {
  ready: "bg-status-closed text-status-closed-foreground",
  building: "bg-status-pending text-status-pending-foreground",
  planned: "bg-muted text-muted-foreground",
} as const;

/**
 * Huy hiệu trung thực Sẵn sàng / Đang xây / Trong lộ trình — dùng lại đúng
 * `FeatureStatus` của lib/feature-registry.ts (D1 — một bộ tên, không đặt
 * biến thể riêng ở đây). "Sẵn sàng" lóe sáng MỘT lần khi vào tầm nhìn:
 * data-sparkle + .badge-sparkle (landing-fx.tsx thêm .sparkle-run); mặc định
 * tĩnh, không JS không mất gì.
 */
export async function StatusBadge({ status }: { status: FeatureStatus }) {
  const t = await getTranslations("landing.badge");
  const sparkle = status === "ready";
  return (
    <span
      data-sparkle={sparkle ? "" : undefined}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${
        sparkle ? "badge-sparkle " : ""
      }${VARIANTS[status]}`}
    >
      {t(status)}
    </span>
  );
}
