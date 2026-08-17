"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Calendar as CalendarIcon, MessageSquare, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { Item } from "@/lib/catalog/items";
import type { OrderDetail, OrderLine, OrderStatus } from "@/lib/catalog/orders";
import { addOrderLine, cancelOrder, completeOrder, confirmOrder, createReturn, removeOrderLine } from "../actions";

const TOAST_KEYS = new Set([
  "notAuthenticated",
  "forbidden",
  "notFound",
  "invalidInput",
  "orderLocked",
  "noLines",
  "staleState",
  "notCompleted",
  "returnExceedsLine",
  "saveFailed",
]);
const ERROR_TO_TOAST_KEY: Record<string, string> = {
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
  invalid_input: "invalidInput",
  order_locked: "orderLocked",
  no_lines: "noLines",
  stale_state: "staleState",
  not_completed: "notCompleted",
  return_exceeds_line: "returnExceedsLine",
};
function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}

const STATUS_BADGE: Record<OrderStatus, string> = {
  draft: "bg-stone-200 text-stone-700",
  confirmed: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const digitsOnly = (v: string) => v.replace(/\D/g, "");

/** Thêm dòng hàng — chỉ hiện khi đơn còn Nháp (order_lines_lock_guard tự chặn ở CSDL với đơn khác). */
function AddLineForm({ orderId, items, onAdded }: { orderId: string; items: Item[]; onAdded: () => void }) {
  const t = useTranslations("orders");
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState(String(items[0]?.priceVnd ?? 0));
  const [discount, setDiscount] = useState("0");
  const [pending, startTransition] = useTransition();

  const selectedItem = items.find((i) => i.id === itemId);
  const variants = selectedItem?.variants ?? [];

  function pickItem(id: string) {
    setItemId(id);
    setVariantId("");
    const it = items.find((i) => i.id === id);
    if (it) setPrice(String(it.priceVnd));
  }
  function pickVariant(id: string) {
    setVariantId(id);
    const v = variants.find((x) => x.id === id);
    if (v?.priceVnd !== null && v?.priceVnd !== undefined) setPrice(String(v.priceVnd));
    else if (selectedItem) setPrice(String(selectedItem.priceVnd));
  }

  const add = () => {
    const qtyNum = Number(qty);
    if (!itemId || !Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast.error(t("toasts.invalidInput"));
      return;
    }
    startTransition(async () => {
      const res = await addOrderLine({
        orderId,
        itemId,
        variantId: variantId || null,
        qty: qtyNum,
        unitPriceVnd: Number(price || "0"),
        discountVnd: Number(discount || "0"),
        appointmentId: null,
      });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.lineAdded"));
      setQty("1");
      setDiscount("0");
      onAdded();
    });
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-2.5 rounded-md border bg-muted/20 p-2.5">
      <div className="text-[12px] font-medium text-muted-foreground">{t("addLine.title")}</div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <Label className="text-[11px] text-muted-foreground">{t("addLine.itemLabel")}</Label>
          <Select value={itemId} onChange={(e) => pickItem(e.target.value)} className="h-8">
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </div>
        {variants.length > 0 && (
          <div className="min-w-32">
            <Label className="text-[11px] text-muted-foreground">{t("addLine.variantLabel")}</Label>
            <Select value={variantId} onChange={(e) => pickVariant(e.target.value)} className="h-8">
              <option value="">{t("addLine.variantNone")}</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="w-20">
          <Label className="text-[11px] text-muted-foreground">{t("addLine.qtyLabel")}</Label>
          <Input inputMode="numeric" value={qty} onChange={(e) => setQty(digitsOnly(e.target.value).slice(0, 5))} className="h-8" />
        </div>
        <div className="w-28">
          <Label className="text-[11px] text-muted-foreground">{t("addLine.priceLabel")}</Label>
          <Input inputMode="numeric" value={price} onChange={(e) => setPrice(digitsOnly(e.target.value).slice(0, 10))} className="h-8" />
        </div>
        <div className="w-28">
          <Label className="text-[11px] text-muted-foreground">{t("addLine.discountLabel")}</Label>
          <Input inputMode="numeric" value={discount} onChange={(e) => setDiscount(digitsOnly(e.target.value).slice(0, 10))} className="h-8" />
        </div>
        <Button size="sm" className="h-8" onClick={add} disabled={pending}>
          <Plus className="size-3.5" />
          {t("addLine.add")}
        </Button>
      </div>
    </div>
  );
}

function LineRow({
  line,
  locale,
  canRemove,
  orderId,
  onRemoved,
}: {
  line: OrderLine;
  locale: Locale;
  canRemove: boolean;
  orderId: string;
  onRemoved: () => void;
}) {
  const t = useTranslations("orders");
  const [pending, startTransition] = useTransition();

  const remove = () => {
    startTransition(async () => {
      const res = await removeOrderLine(line.id, orderId);
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.lineRemoved"));
      onRemoved();
    });
  };

  return (
    <div className="flex items-center gap-2 border-b py-2 text-[13px] last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate">{line.itemName}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {line.variantLabel ? `${line.variantLabel} · ` : ""}
          {formatMoney(line.unitPriceVnd, locale)}
          {line.discountVnd > 0 ? ` · -${formatMoney(line.discountVnd, locale)}` : ""}
        </div>
      </div>
      <span className="w-10 shrink-0 text-right text-muted-foreground">{line.qty}</span>
      <span className="w-24 shrink-0 text-right font-medium">{formatMoney(line.lineTotalVnd, locale)}</span>
      {canRemove && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={t("addLine.remove")}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function CancelPanel({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const t = useTranslations("orders");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("detail.cancel")}
      </Button>
    );
  }

  const submit = () => {
    if (!reason.trim()) return;
    startTransition(async () => {
      const res = await cancelOrder({ orderId, reason: reason.trim() });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.cancelled"));
      onDone();
    });
  };

  return (
    <div className="w-full space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
      <div className="text-[12px] font-medium">{t("cancelDialog.title")}</div>
      <p className="text-[11px] text-muted-foreground">{t("cancelDialog.description")}</p>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("cancelDialog.reasonPlaceholder")}
        maxLength={200}
        className="min-h-16 text-[13px]"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          {t("cancelDialog.back")}
        </Button>
        <Button variant="destructive" size="sm" onClick={submit} disabled={pending || !reason.trim()}>
          {t("cancelDialog.confirm")}
        </Button>
      </div>
    </div>
  );
}

function ReturnPanel({ order, locale, onDone }: { order: OrderDetail; locale: Locale; onDone: (returnOrderId: string) => void }) {
  const t = useTranslations("orders");
  const [open, setOpen] = useState(false);
  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("detail.createReturn")}
      </Button>
    );
  }

  const submit = () => {
    const lines = order.lines
      .map((l) => ({ orderLineId: l.id, qty: Number(qtyById[l.id] || "0") }))
      .filter((l) => l.qty > 0);
    if (lines.length === 0) return;
    startTransition(async () => {
      const res = await createReturn({ orderId: order.id, lines });
      if (res.error || !res.returnOrderId) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.returnCreated"));
      onDone(res.returnOrderId);
    });
  };

  return (
    <div className="w-full space-y-2 rounded-md border border-primary/40 bg-muted/20 p-2.5">
      <div className="text-[12px] font-medium">{t("returnDialog.title")}</div>
      <p className="text-[11px] text-muted-foreground">{t("returnDialog.description")}</p>
      <div className="space-y-1.5">
        {order.lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate">
              {l.itemName}
              {l.variantLabel ? ` · ${l.variantLabel}` : ""}
              <span className="text-[11px] text-muted-foreground">
                {" "}
                ({t("detail.qty")} {l.qty} · {formatMoney(l.unitPriceVnd, locale)})
              </span>
            </span>
            <Input
              inputMode="numeric"
              value={qtyById[l.id] ?? ""}
              onChange={(e) => setQtyById((m) => ({ ...m, [l.id]: digitsOnly(e.target.value).slice(0, 5) }))}
              placeholder="0"
              className="h-8 w-20 text-right"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          {t("returnDialog.cancel")}
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {t("returnDialog.submit")}
        </Button>
      </div>
    </div>
  );
}

export function OrderDetailView({ order, canWrite, items }: { order: OrderDetail; canWrite: boolean; items: Item[] }) {
  const t = useTranslations("orders");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [confirmPending, startConfirm] = useTransition();
  const [completePending, startComplete] = useTransition();

  // Server Action đã gọi revalidatePath("/app/orders/[id]") — router.refresh()
  // ép Next nạp lại RSC cho route hiện tại ngay để `order` (props từ server)
  // cập nhật theo, không cần reload cả trang.
  const forceRefresh = () => router.refresh();

  const discountTotal = order.lines.reduce((s, l) => s + l.discountVnd, 0);
  const subtotal = order.lines.reduce((s, l) => s + l.qty * l.unitPriceVnd, 0);
  const remaining = order.totalVnd - order.paidVnd;

  const doConfirm = () => {
    startConfirm(async () => {
      const res = await confirmOrder(order.id);
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.confirmed"));
      forceRefresh();
    });
  };
  const doComplete = () => {
    startComplete(async () => {
      const res = await completeOrder(order.id);
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.completed"));
      forceRefresh();
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
          <Link href="/app/orders" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            {t("backToList")}
          </Link>

          <div className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[16px] font-semibold">{order.contactName}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[order.status]}`}>
                    {t(`statuses.${order.status}`)}
                  </span>
                  {order.kind === "return" && (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                      {t("kinds.return")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] text-muted-foreground">
                  {order.contactPhone ? `${order.contactPhone} · ` : ""}
                  {t("detail.createdAt", { date: formatDateTime(order.createdAt, locale) })}
                </div>
              </div>
            </div>

            {order.status === "cancelled" && order.cancelReason && (
              <p className="mt-2 rounded bg-muted/50 p-2 text-[12px] text-muted-foreground">
                {t("detail.cancelReason", { reason: order.cancelReason })}
              </p>
            )}

            {order.parentOrderId && (
              <Link href={`/app/orders/${order.parentOrderId}`} className="mt-2 inline-block text-[12px] text-primary hover:underline">
                {t("detail.parentOrder")}
              </Link>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              {order.sourceConversationId && (
                <Link
                  href={`/app/inbox?c=${order.sourceConversationId}`}
                  className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px]"
                >
                  <MessageSquare className="size-3.5" />
                  {t("detail.openConversation")}
                </Link>
              )}
              {order.sourceAppointmentId && (
                <Link href="/app/calendar" className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px]">
                  <CalendarIcon className="size-3.5" />
                  {t("detail.openAppointment")}
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="text-[13px] font-medium">{t("detail.linesTitle")}</div>
            {order.lines.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">{t("detail.noLines")}</p>
            ) : (
              <div className="mt-1.5">
                {order.lines.map((l) => (
                  <LineRow
                    key={l.id}
                    line={l}
                    locale={locale}
                    canRemove={canWrite && order.status === "draft"}
                    orderId={order.id}
                    onRemoved={forceRefresh}
                  />
                ))}
              </div>
            )}

            {canWrite && order.status === "draft" && (
              <div className="mt-3">
                <AddLineForm orderId={order.id} items={items} onAdded={forceRefresh} />
              </div>
            )}

            <div className="mt-3 space-y-1 border-t pt-3 text-[13px]">
              <div className="flex justify-between text-muted-foreground">
                <span>{t("detail.subtotal")}</span>
                <span>{formatMoney(subtotal, locale)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("addLine.discountLabel")}</span>
                  <span>-{formatMoney(discountTotal, locale)}</span>
                </div>
              )}
              <div className="flex justify-between text-[15px] font-semibold">
                <span>{t("detail.total")}</span>
                <span>{formatMoney(order.totalVnd, locale)}</span>
              </div>
              {order.paidVnd > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("detail.paid")}</span>
                  <span>{formatMoney(order.paidVnd, locale)}</span>
                </div>
              )}
              {order.status !== "cancelled" && remaining !== 0 && (
                <div className="flex justify-between font-medium text-primary">
                  <span>{t("detail.remaining")}</span>
                  <span>{formatMoney(remaining, locale)}</span>
                </div>
              )}
            </div>
          </div>

          {canWrite && order.status !== "cancelled" && (
            <div className="flex flex-wrap items-center gap-2">
              {order.status === "draft" && (
                <Button size="sm" onClick={doConfirm} disabled={confirmPending}>
                  {t("detail.confirm")}
                </Button>
              )}
              {order.status === "confirmed" && (
                <Button size="sm" onClick={doComplete} disabled={completePending}>
                  {t("detail.complete")}
                </Button>
              )}
              {(order.status === "draft" || order.status === "confirmed") && (
                <CancelPanel orderId={order.id} onDone={forceRefresh} />
              )}
              {order.status === "completed" && order.kind === "order" && (
                <ReturnPanel order={order} locale={locale} onDone={(returnOrderId) => router.push(`/app/orders/${returnOrderId}`)} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
