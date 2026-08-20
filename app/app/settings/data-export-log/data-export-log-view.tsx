import { getLocale, getTranslations } from "next-intl/server";
import { Download, Lock } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";

export type ExportKind = "contacts" | "orders" | "appointments" | "unknown";

export type DataExportEventRow = {
  id: number;
  kind: ExportKind;
  rows: number;
  truncated: boolean;
  createdAt: string;
  displayName: string;
  role: string | null;
};

const KIND_DOT: Record<ExportKind, string> = {
  contacts: "bg-sky-500",
  orders: "bg-green-600",
  appointments: "bg-violet-500",
  unknown: "bg-muted-foreground/40",
};

export async function DataExportLogView({
  canManage,
  events,
  listLimit,
}: {
  canManage: boolean;
  events: DataExportEventRow[];
  listLimit?: number;
}) {
  const t = await getTranslations("settings.dataExportLog");
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
            <Download className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="mt-3 text-[15px] font-semibold">{t("empty.title")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border">
              {events.map((e, i) => (
                <div
                  key={e.id}
                  className={
                    i === events.length - 1
                      ? "flex items-center gap-3 px-3.5 py-2.5"
                      : "flex items-center gap-3 border-b px-3.5 py-2.5"
                  }
                >
                  <span
                    className={`size-3.5 shrink-0 rounded-full ${KIND_DOT[e.kind]}`}
                    title={t(`kind.${e.kind}`)}
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
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t("summary", { kind: t(`kind.${e.kind}`), rows: e.rows })}
                      {e.truncated && ` · ${t("truncatedTag")}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {formatDateTime(e.createdAt, locale)}
                  </span>
                </div>
              ))}
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
