import { getLocale, getTranslations } from "next-intl/server";
import { LifeBuoy, Lock } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
// View này là SERVER component (async + next-intl/server) và support/queries.ts
// chỉ có `import type` — nên import thẳng hằng số, không cần luồn qua props.
import { SUPPORT_LOG_LIMIT, type SupportSessionLogRow } from "@/app/app/support/queries";

/** "Đang mở/hết hạn/đã đóng" suy ra từ mốc thời gian (mục 36.12A) — không đọc cột status vì bảng cố ý không có. */
function sessionState(row: SupportSessionLogRow, now: string): "open" | "closed" | "expired" {
  if (row.ended_at) return "closed";
  return new Date(row.expires_at).getTime() > new Date(now).getTime() ? "open" : "expired";
}

const STATE_DOT: Record<ReturnType<typeof sessionState>, string> = {
  open: "bg-sky-500",
  closed: "bg-muted-foreground/40",
  expired: "bg-amber-500",
};

export async function SupportLogView({
  canManage,
  sessions,
  now,
}: {
  canManage: boolean;
  sessions: SupportSessionLogRow[];
  /** Mốc "bây giờ" do page.tsx truyền xuống — render phải thuần, không tự gọi Date.now(). */
  now: string;
}) {
  const t = await getTranslations("settings.supportLog");
  const locale = (await getLocale()) as Locale;

  if (!canManage) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl p-6">
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Lock className="mx-auto size-5 text-muted-foreground" />
            <h1 className="mt-3 text-[15px] font-semibold">{t("noPermission.title")}</h1>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground">
              {t("noPermission.description")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <LifeBuoy className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="mt-3 text-[15px] font-semibold">{t("empty.title")}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            {sessions.map((s, i) => {
              const state = sessionState(s, now);
              return (
                <div
                  key={s.id}
                  className={
                    i === sessions.length - 1
                      ? "flex items-start gap-3 px-3.5 py-2.5"
                      : "flex items-start gap-3 border-b px-3.5 py-2.5"
                  }
                >
                  <span
                    className={`mt-1 size-3.5 shrink-0 rounded-full ${STATE_DOT[state]}`}
                    title={t(`state.${state}`)}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-relaxed">{s.reason}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t(`state.${state}`)}
                      {s.ended_by === "tenant" && ` · ${t("endedByTenant")}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {formatDateTime(s.started_at, locale)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {/* Chạm trần thì NÓI RA — không để người dùng tưởng đây là tất cả. */}
        {sessions.length >= SUPPORT_LOG_LIMIT && (
          <p className="text-[12px] text-muted-foreground">
            {t("limitNote", { limit: SUPPORT_LOG_LIMIT })}
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">{t("hint")}</p>
      </div>
    </div>
  );
}
