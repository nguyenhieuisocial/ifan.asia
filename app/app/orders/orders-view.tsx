"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Receipt } from "lucide-react";
import { formatMoney, formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { OrderCounts, OrderListRow, OrderStatus } from "@/lib/catalog/orders";

const STATUS_BADGE: Record<OrderStatus, string> = {
  draft: "bg-stone-200 text-stone-700",
  confirmed: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const FILTER_ORDER: (OrderStatus | "all")[] = ["all", "draft", "confirmed", "completed", "cancelled"];

/** Danh sách đơn — filter chip đẩy lên URL `?status=` (khuôn saved_views/bộ lọc màn Cơ hội, task #77). */
export function OrdersView({
  orders,
  counts,
  activeStatus,
  canCreate,
}: {
  orders: OrderListRow[];
  counts: OrderCounts;
  activeStatus: OrderStatus | "all";
  canCreate: boolean;
}) {
  const t = useTranslations("orders");
  const locale = useLocale() as Locale;
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">{t("title")}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href="/api/export/orders"
                className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium text-muted-foreground hover:bg-muted/60"
              >
                Xuất CSV
              </a>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => router.push("/app/orders/new")}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground"
                >
                  <Plus className="size-4" />
                  {t("addNew")}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {FILTER_ORDER.map((s) => (
              <Link
                key={s}
                href={s === "all" ? "/app/orders" : `/app/orders?status=${s}`}
                className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${
                  activeStatus === s
                    ? "bg-foreground text-background"
                    : "border text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {s === "all" ? t("filters.all") : t(`statuses.${s}`)} · {counts[s]}
              </Link>
            ))}
          </div>

          {orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center">
              <Receipt className="size-8 text-muted-foreground/50" />
              <p className="text-[13px] text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {orders.map((o) => (
                <Link
                  key={o.id}
                  href={`/app/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 p-2.5 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium">{o.contactName}</span>
                      {o.kind === "return" && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                          {t("kinds.return")}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {t("list.lineCount", { count: o.lineCount })} · {formatDateTime(o.createdAt, locale)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={o.totalVnd < 0 ? "text-[13px] font-medium text-destructive" : "text-[13px] font-medium"}>
                      {formatMoney(o.totalVnd, locale)}
                    </div>
                    <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[o.status]}`}>
                      {t(`statuses.${o.status}`)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
