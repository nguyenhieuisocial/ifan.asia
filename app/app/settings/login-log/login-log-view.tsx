import { getLocale, getTranslations } from "next-intl/server";
import { Lock, ShieldCheck } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";

export type LoginEventRow = {
  id: number;
  method: "email" | "staff_phone" | "confirm_link";
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  userAgent: string | null;
  createdAt: string;
  displayName: string;
  phone: string | null;
  role: string | null;
};

const METHOD_DOT: Record<LoginEventRow["method"], string> = {
  email: "bg-green-600",
  staff_phone: "bg-sky-500",
  confirm_link: "bg-amber-500",
};

/** Đọc nhanh trình duyệt + hệ điều hành từ user-agent — chỉ để NGƯỜI đọc mắt thường, không phải phân tích bảo mật. */
function parseUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (!browser && !os) return null;
  return [browser, os].filter(Boolean).join(" trên ");
}

function locationOf(row: LoginEventRow): string | null {
  return [row.city, row.country].filter(Boolean).join(", ") || null;
}

export async function LoginLogView({
  canManage,
  events,
  listLimit,
}: {
  canManage: boolean;
  events: LoginEventRow[];
  listLimit?: number;
}) {
  const t = await getTranslations("settings.loginLog");
  const tRoles = await getTranslations("team.roles");
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

        {events.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <ShieldCheck className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="mt-3 text-[15px] font-semibold">{t("empty.title")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border">
              {events.map((e, i) => {
                const device = parseUserAgent(e.userAgent);
                const location = locationOf(e);
                const detailParts = [
                  location ?? t("unknownLocation"),
                  device,
                  e.ip,
                ].filter(Boolean);
                return (
                  <div
                    key={e.id}
                    className={
                      i === events.length - 1
                        ? "flex items-center gap-3 px-3.5 py-2.5"
                        : "flex items-center gap-3 border-b px-3.5 py-2.5"
                    }
                  >
                    <span
                      className={`size-3.5 shrink-0 rounded-full ${METHOD_DOT[e.method]}`}
                      title={t(`method.${e.method}`)}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">
                        {e.displayName}
                        {e.role && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            ({tRoles(e.role)})
                          </span>
                        )}
                        {e.phone && (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            — {t("phoneLabel", { phone: e.phone })}
                          </span>
                        )}
                      </p>
                      <p
                        className={
                          location
                            ? "mt-0.5 truncate text-xs text-muted-foreground"
                            : "mt-0.5 truncate text-xs text-muted-foreground/60"
                        }
                      >
                        {detailParts.join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTime(e.createdAt, locale)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("hint")}
              {listLimit && events.length >= listLimit ? ` ${t("limitNote", { n: listLimit })}` : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
