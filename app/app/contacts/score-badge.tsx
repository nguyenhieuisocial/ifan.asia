"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SCORE_BADGE, scoreBand } from "./types";

/**
 * Badge nhiệt lead score (spec CRM V1): số 0–100 + màu band Nóng/Ấm/Lạnh.
 * Tooltip (title) + aria-label giải thích ngắn điểm được tính từ đâu.
 */
export function ScoreBadge({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const t = useTranslations("contacts.score");
  const band = scoreBand(score);
  const label = t("tooltip", { score, band: t(`band.${band}`) });
  return (
    <Badge
      title={label}
      aria-label={label}
      className={cn("font-semibold tabular-nums", SCORE_BADGE[band], className)}
    >
      {score}
    </Badge>
  );
}
