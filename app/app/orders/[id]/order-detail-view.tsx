"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
// uqr: sinh mã QR ngay trong máy, 0 phụ thuộc (khuôn app/app/settings/qr/qr-view.tsx).
import { encode as encodeQr } from "uqr";
import { ArrowLeft, Banknote, Calendar as CalendarIcon, MessageSquare, Plus, Sparkles, Ticket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InternalChat } from "@/components/internal-chat/internal-chat";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { Item } from "@/lib/catalog/items";
import { MANUAL_PAYMENT_METHODS } from "@/lib/catalog/orders";
import type { ManualPaymentMethod, OrderDetail, OrderHistoryItem, OrderLine, OrderStatus } from "@/lib/catalog/orders";
import { bankNameForBin } from "@/lib/payments/vn-banks";
import { buildVietQrPayload } from "@/lib/payments/vietqr";
import {
  addOrderLine,
  applyVoucher,
  cancelOrder,
  completeOrder,
  confirmOrder,
  createReturn,
  recordPayment,
  redeemPointsForOrder,
  removeOrderLine,
} from "../actions";

export type BankInfo = { bin: string; accountNo: string; accountName: string };

/**
 * Điểm của khách gắn với đơn này. `isActive` truyền xuống RIÊNG với `diemCon`:
 * "tiệm chưa bật tích điểm" và "khách chưa có điểm nào" là HAI chuyện khác nhau,
 * và người bán phải đọc được đúng cái nào đang xảy ra.
 */
export type LoyaltyForOrder = {
  isActive: boolean;
  redeemPointsUnit: number;
  redeemValueVnd: number;
  diemCon: number;
  quyDoiVnd: number;
};

/**
 * Hai chiều điểm mà CSDL đã tự quyết toán khi phiếu hoàn chốt xong (migration
 * #195) — không phải thứ màn này tính ra, chỉ là ĐỌC LẠI dòng sổ đã ghi.
 *
 * Phải hiện ở đây vì việc này chạy ngầm trong trigger: người bấm "Hoàn tất"
 * không thấy gì cả, rồi hôm sau khách hỏi "sao điểm em đổi khác" thì không ai
 * trả lời được. `null` = không phải phiếu hoàn, hoặc đơn gốc không dính điểm.
 */
export type PointsSettled = { refunded: number; clawedBack: number } | null;

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
  "paymentExceedsTotal",
  "discountFailed",
  "discountCapExceeded",
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
  payment_exceeds_total: "paymentExceedsTotal",
  discount_failed: "discountFailed",
  discount_cap_exceeded: "discountCapExceeded",
};
function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}

const STATUS_BADGE: Record<OrderStatus, string> = {
  draft: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200",
  confirmed: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
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
      // Dòng đã vào, nhưng khoản GIẢM có thể chưa được trừ. Nói đúng chuyện gì
      // đã xảy ra thay vì "Đã thêm dòng hàng" cho cả bốn nhánh — người bán phải
      // biết ngay để còn nói với khách đang đứng trước mặt.
      const d = res.discount;
      if (d?.ketQua === "cho_duyet") {
        toast.warning(
          t("toasts.discountPending", { pct: d.giamPct ?? 0, cap: d.tranCuaBan ?? 0 }),
        );
      } else if (d?.ketQua === "giam_qua_gia_dong") {
        toast.error(t("toasts.discountTooBig"));
      } else if (d?.ketQua === "don_da_chot") {
        toast.error(t("toasts.discountOrderClosed"));
      } else {
        toast.success(t("toasts.lineAdded"));
      }
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
        {/* Cao bằng các ô nhập cùng hàng — trên điện thoại chúng đã là 44px. */}
        <Button size="sm" className="h-8 max-md:h-11" onClick={add} disabled={pending}>
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
        {/* Khoản xin giảm vượt trần CHƯA được trừ. Không bày ra thì dòng này
            trông y hệt dòng không giảm gì, và người bán tưởng đã xong. */}
        {line.pendingDiscountVnd !== null && (
          <div className="truncate text-[11px] font-medium text-amber-700 dark:text-amber-500">
            {t("detail.discountPending", {
              amount: formatMoney(line.pendingDiscountVnd, locale),
              pct: line.pendingDiscountPct ?? 0,
            })}
          </div>
        )}
        {/* #214/#224 — ai LÀM dòng này + hoa hồng họ nhận (từ commission_entries,
            khớp bảng lương). Nhân viên chỉ thấy hoa hồng của mình (RLS). */}
        {(line.performerName || line.commissionVnd !== null) && (
          <div className="truncate text-[11px] text-muted-foreground">
            {line.performerName ? t("detail.performerLabel", { name: line.performerName }) : ""}
            {line.commissionVnd !== null
              ? `${line.performerName ? " · " : ""}${t("detail.commissionLabel", { amount: formatMoney(line.commissionVnd, locale) })}`
              : ""}
          </div>
        )}
      </div>
      <span className="w-10 shrink-0 text-right text-muted-foreground">{line.qty}</span>
      <span className="w-24 shrink-0 text-right font-medium">{formatMoney(line.lineTotalVnd, locale)}</span>
      {canRemove && (
        // Vùng chạm 44px trên điện thoại — cùng khuôn với nút xoá ở màn tạo
        // đơn. Hộp bấm trùng phần nhìn thấy (không nới bằng lề âm) vì đây là
        // nút xoá: nới ngầm sang chỗ hiện giá là mời người bán xoá nhầm.
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="shrink-0 text-muted-foreground hover:text-destructive max-md:flex max-md:size-11 max-md:items-center max-md:justify-center"
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

/** Vẽ mã QR bằng canvas — nguyên khuôn drawQr của app/app/settings/qr/qr-view.tsx (không gọi dịch vụ ngoài). */
const QUIET_ZONE = 4;
function drawQr(canvas: HTMLCanvasElement, value: string, sizePx: number) {
  const qr = encodeQr(value, { ecc: "M", border: QUIET_ZONE });
  const cell = Math.max(1, Math.floor(sizePx / qr.size));
  const full = cell * qr.size;
  canvas.width = full;
  canvas.height = full;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, full, full);
  ctx.fillStyle = "#000000";
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.data[row][col]) ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }
}
function QrImage({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawQr(ref.current, value, 240);
  }, [value]);
  return <canvas ref={ref} className="mx-auto rounded-md border" aria-hidden />;
}

/**
 * Thu tiền (ADR-0019 mục 6+9): 3 cách, VietQR chỉ hiện khi tiệm đã cấu hình
 * ngân hàng (Cài đặt → Nhận thanh toán). Thu ngân bấm "Đã nhận tiền" — KHÔNG
 * tự dò tiền về (chưa nối cổng ngân hàng thật, thẻ design man-thu-tien-vietqr).
 */
function PaymentPanel({
  order,
  remaining,
  bankInfo,
  onDone,
}: {
  order: OrderDetail;
  remaining: number;
  bankInfo: BankInfo | null;
  onDone: () => void;
}) {
  const t = useTranslations("orders");
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<ManualPaymentMethod>("cash");
  const [amount, setAmount] = useState(String(remaining));
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Banknote className="size-4" />
        {t("detail.collectPayment")}
      </Button>
    );
  }

  const amountNum = Number(amount || "0");
  const qrMemo = `DH${order.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const qrPayload =
    method === "vietqr" && bankInfo && amountNum > 0
      ? buildVietQrPayload({ bankBin: bankInfo.bin, accountNo: bankInfo.accountNo, amountVnd: amountNum, memo: qrMemo })
      : null;

  const submit = () => {
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error(t("toasts.invalidInput"));
      return;
    }
    startTransition(async () => {
      const res = await recordPayment({ orderId: order.id, method, amountVnd: amountNum });
      if (res.error) {
        toast.error(t(`toasts.${toastKeyFor(res.error)}`));
        return;
      }
      toast.success(t("toasts.paymentRecorded"));
      setOpen(false);
      onDone();
    });
  };

  return (
    <div className="w-full space-y-3 rounded-md border border-primary/40 bg-muted/20 p-3">
      <div className="text-[13px] font-medium">{t("paymentDialog.title")}</div>

      <div className="flex gap-1.5 rounded-md bg-muted p-1">
        {MANUAL_PAYMENT_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            disabled={m === "vietqr" && !bankInfo}
            className={`flex-1 rounded px-2 py-1.5 text-[12px] font-medium max-md:min-h-11 ${
              method === m ? "bg-background shadow-sm" : "text-muted-foreground"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {t(`paymentDialog.methods.${m}`)}
          </button>
        ))}
      </div>
      {method === "vietqr" && !bankInfo && (
        <p className="text-[11px] text-muted-foreground">
          {t("paymentDialog.bankNotConfigured")}{" "}
          <Link href="/app/settings/payments" className="text-primary hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center">
            {t("paymentDialog.goConfigure")}
          </Link>
        </p>
      )}

      <div>
        <Label className="text-[11px] text-muted-foreground">{t("paymentDialog.amountLabel")}</Label>
        <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(digitsOnly(e.target.value).slice(0, 10))} className="h-9" />
      </div>

      {method === "vietqr" && bankInfo && (
        <div className="rounded-md border bg-background p-3 text-center">
          {qrPayload ? <QrImage value={qrPayload} /> : <p className="text-[12px] text-muted-foreground">{t("paymentDialog.enterAmountFirst")}</p>}
          <div className="mt-2 text-[13px] font-medium">
            {bankNameForBin(bankInfo.bin)} · {bankInfo.accountNo}
          </div>
          <div className="text-[12px] text-muted-foreground">{bankInfo.accountName}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t("paymentDialog.memoLabel", { memo: qrMemo })}</div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          {t("paymentDialog.cancel")}
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? t("paymentDialog.saving") : t("paymentDialog.confirmReceived")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Mã lý do `voucher_apply` có thể trả — ĐỌC THẲNG từ migration #159, gồm cả các
 * lý do do `voucher_check` sinh ra (voucher_apply chuyển nguyên chúng ra ngoài).
 * Mỗi mã một câu riêng: gộp thành "mã không dùng được" là để nhân viên đứng
 * trước mặt khách mà không biết giải thích gì.
 */
const VOUCHER_REASONS = new Set([
  "don_da_chot",
  "khong_ton_tai",
  "don_da_co_ma",
  "da_dung",
  "het_han",
  "het_luot",
  "chua_du_don_toi_thieu",
  "can_chon_khach",
  "khach_dung_het_luot",
  "chi_danh_cho_khach_moi",
  "giam_bang_khong",
  "khong_ap_cho_phieu_hoan",
]);

/** Mã lý do `loyalty_redeem_for_order` có thể trả — đọc từ migration #194. */
const POINTS_REASONS = new Set([
  "so_diem_khong_hop_le",
  "don_da_chot",
  "don_khong_co_khach",
  "chua_bat_tich_diem",
  "khong_dung_boi_so",
  "khong_du_diem",
  "vuot_so_con_thieu",
  "khong_ap_cho_phieu_hoan",
]);

/**
 * Áp MÃ GIẢM GIÁ vào đơn (migration #159).
 *
 * Kết quả Ở LẠI trên màn chứ không chỉ là một toast bay qua: lúc mã bị loại,
 * nhân viên còn phải đọc lại lý do trong khi nói chuyện với khách.
 */
function VoucherPanel({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const t = useTranslations("orders");
  const locale = useLocale() as Locale;
  const [code, setCode] = useState("");
  const [ket, setKet] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Mã lạ (hàm CSDL thêm nhánh mà đây quên theo) vẫn được BÁO, kèm nguyên mã để
  // truy được — im lặng hoặc nói chung chung mới là lỗi.
  const lyDoText = (ma: string, so: Record<string, number>) =>
    t(`voucher.reasons.${VOUCHER_REASONS.has(ma) ? ma : "khong_ro"}`, {
      code: ma || "?",
      used: so.da_dung ?? 0,
      max: so.toi_da ?? 0,
      minOrder: formatMoney(so.can_tu ?? 0, locale),
      perCustomer: so.toi_da_moi_khach ?? 0,
    });

  const submit = () => {
    const ma = code.trim();
    if (!ma) return;
    startTransition(async () => {
      const res = await applyVoucher({ orderId, code: ma });
      if (res.error || !res.ket) {
        const text = t(`toasts.${toastKeyFor(res.error)}`);
        setKet({ ok: false, text });
        toast.error(text);
        return;
      }
      if (res.ket.ok) {
        const text = t("voucher.applied", { amount: formatMoney(res.ket.giamVnd, locale) });
        setKet({ ok: true, text });
        toast.success(text);
        setCode("");
        onDone();
        return;
      }
      const text = lyDoText(res.ket.lyDo ?? "", res.ket.so);
      setKet({ ok: false, text });
      toast.error(text);
    });
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-1.5">
        <Ticket className="size-4 text-muted-foreground" />
        <div className="text-[13px] font-medium">{t("voucher.title")}</div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("voucher.hint")}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <Label className="text-[11px] text-muted-foreground">{t("voucher.codeLabel")}</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 32))}
            placeholder={t("voucher.codePlaceholder")}
            className="h-9 uppercase"
          />
        </div>
        <Button size="sm" className="h-9 max-md:h-11" onClick={submit} disabled={pending || !code.trim()}>
          {pending ? t("voucher.applying") : t("voucher.apply")}
        </Button>
      </div>
      {ket && (
        <p
          className={`mt-2 text-[12px] ${ket.ok ? "font-medium text-green-700 dark:text-green-500" : "text-destructive"}`}
        >
          {ket.text}
        </p>
      )}
    </div>
  );
}

/**
 * TRẢ ĐƠN BẰNG ĐIỂM (migration #194).
 *
 * Chữ trên màn nói "trả bằng điểm", KHÔNG nói "giảm giá" — vì CSDL ghi khoản
 * này vào `order_payments` như một cách trả tiền thứ tư, không đụng vào giá
 * hàng. Gọi nhầm là giảm giá thì con số trên màn và con số trong báo cáo lãi sẽ
 * đá nhau, đúng lớp lỗi mà quyết định #194 sinh ra để tránh.
 */
function PointsPanel({
  orderId,
  loyalty,
  remaining,
  onDone,
}: {
  orderId: string;
  loyalty: LoyaltyForOrder;
  remaining: number;
  onDone: () => void;
}) {
  const t = useTranslations("orders");
  const locale = useLocale() as Locale;
  const [points, setPoints] = useState("");
  const [ket, setKet] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const soDiem = (n: number) => new Intl.NumberFormat(locale).format(n);

  const lyDoText = (ma: string, so: Record<string, number>) =>
    t(`points.reasons.${POINTS_REASONS.has(ma) ? ma : "khong_ro"}`, {
      code: ma || "?",
      unit: soDiem(so.boi_so ?? loyalty.redeemPointsUnit),
      left: soDiem(so.con ?? 0),
      owed: formatMoney(so.con_thieu ?? 0, locale),
    });

  const submit = () => {
    const n = Number(points || "0");
    if (!Number.isFinite(n) || n <= 0) {
      toast.error(t("toasts.invalidInput"));
      return;
    }
    startTransition(async () => {
      const res = await redeemPointsForOrder({ orderId, points: n });
      if (res.error || !res.ket) {
        const text = t(`toasts.${toastKeyFor(res.error)}`);
        setKet({ ok: false, text });
        toast.error(text);
        return;
      }
      if (res.ket.ok) {
        const text = t("points.redeemed", {
          amount: formatMoney(res.ket.giamVnd, locale),
          points: soDiem(res.ket.so.diem_da_dung ?? n),
          left: soDiem(res.ket.so.con_lai_diem ?? 0),
        });
        setKet({ ok: true, text });
        toast.success(text);
        setPoints("");
        onDone();
        return;
      }
      const text = lyDoText(res.ket.lyDo ?? "", res.ket.so);
      setKet({ ok: false, text });
      toast.error(text);
    });
  };

  // Ba đường KHÔNG dùng được. Mỗi đường nói thẳng vì sao — ẩn nút mà không giải
  // thích là để người bán tưởng tính năng hỏng.
  const chan = !loyalty.isActive
    ? "loyaltyOff"
    : loyalty.diemCon <= 0
      ? "noPoints"
      : remaining <= 0
        ? "nothingOwed"
        : null;

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-4 text-muted-foreground" />
        <div className="text-[13px] font-medium">{t("points.title")}</div>
      </div>

      {chan === "loyaltyOff" ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t("points.loyaltyOff")}{" "}
          {/* Chữ dẫn đi bật ưu đãi là ĐƯỜNG DẪN duy nhất thoát khỏi màn này khi
              chương trình điểm đang tắt — cao 15px thì gần như không bấm trúng.
              inline-flex giữ nó nằm trong câu, chỉ cao lên. */}
          <Link href="/app/loyalty" className="text-primary hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center">
            {t("points.goConfigure")}
          </Link>
        </p>
      ) : chan ? (
        <p className="mt-1 text-[12px] text-muted-foreground">{t(`points.${chan}`)}</p>
      ) : (
        <>
          <p className="mt-1 text-[13px]">
            {t("points.balance", {
              points: soDiem(loyalty.diemCon),
              amount: formatMoney(loyalty.quyDoiVnd, locale),
            })}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("points.rule", {
              unit: soDiem(loyalty.redeemPointsUnit),
              amount: formatMoney(loyalty.redeemValueVnd, locale),
            })}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="w-32">
              <Label className="text-[11px] text-muted-foreground">{t("points.inputLabel")}</Label>
              <Input
                inputMode="numeric"
                value={points}
                onChange={(e) => setPoints(digitsOnly(e.target.value).slice(0, 9))}
                placeholder={String(loyalty.redeemPointsUnit)}
                className="h-9"
              />
            </div>
            <Button size="sm" className="h-9 max-md:h-11" onClick={submit} disabled={pending || !points}>
              {pending ? t("points.redeeming") : t("points.redeem")}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{t("points.notADiscount")}</p>
        </>
      )}

      {ket && (
        <p
          className={`mt-2 text-[12px] ${ket.ok ? "font-medium text-green-700 dark:text-green-500" : "text-destructive"}`}
        >
          {ket.text}
        </p>
      )}
    </div>
  );
}

export function OrderDetailView({
  order,
  history,
  canWrite,
  items,
  bankInfo,
  loyalty,
  pointsSettled,
}: {
  order: OrderDetail;
  history: OrderHistoryItem[];
  canWrite: boolean;
  items: Item[];
  bankInfo: BankInfo | null;
  loyalty: LoyaltyForOrder;
  pointsSettled: PointsSettled;
}) {
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

  // Ở PHIẾU HOÀN, khoản giảm phải CỘNG LẠI chứ không trừ đi — số lượng âm nên
  // giảm giá làm số tiền hoàn NHỎ đi. Không có dấu này thì ba dòng tổng kết
  // không cộng ra nhau và chủ tiệm nghi ngờ đúng con số vừa được sửa cho đúng:
  //     Tạm tính −2.000.000 · Giảm giá −400.000 · Tổng −1.600.000
  // (trừ theo mắt thường ra −2.400.000). Dòng Tổng đã đúng từ #198; đây là
  // phần diễn giải phía trên chưa theo kịp — bắt được ở đợt soi lại 19/08.
  const laPhieuHoan = order.kind === "return";

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
          {/* Đường lui về danh sách — vùng chạm 44px trên điện thoại, cùng
              khuôn với nút Quay lại ở màn tạo đơn (app/app/orders/new). */}
          <Link href="/app/orders" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground max-md:-ml-1 max-md:h-11 max-md:pr-2 max-md:pl-1">
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
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
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
              <Link href={`/app/orders/${order.parentOrderId}`} className="mt-2 inline-block text-[12px] text-primary hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center">
                {t("detail.parentOrder")}
              </Link>
            )}

            {pointsSettled && (
              <div className="mt-2 rounded bg-muted/50 p-2 text-[12px] text-muted-foreground">
                <div className="font-medium text-foreground">{t("detail.pointsSettledTitle")}</div>
                {pointsSettled.refunded > 0 && (
                  <p className="mt-0.5">
                    {t("detail.pointsRefunded", {
                      points: new Intl.NumberFormat(locale).format(pointsSettled.refunded),
                    })}
                  </p>
                )}
                {pointsSettled.clawedBack > 0 && (
                  <p className="mt-0.5">
                    {t("detail.pointsClawedBack", {
                      points: new Intl.NumberFormat(locale).format(pointsSettled.clawedBack),
                    })}
                  </p>
                )}
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              {order.sourceConversationId && (
                <Link
                  href={`/app/inbox?c=${order.sourceConversationId}`}
                  className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] max-md:h-11 max-md:px-3"
                >
                  <MessageSquare className="size-3.5" />
                  {t("detail.openConversation")}
                </Link>
              )}
              {order.sourceAppointmentId && (
                <Link href="/app/calendar" className="flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] max-md:h-11 max-md:px-3">
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
                  <span>
                    {laPhieuHoan ? "+" : "-"}
                    {formatMoney(discountTotal, locale)}
                  </span>
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
              {/* Từng khoản đã trả, TÁCH THEO CÁCH TRẢ. `points` phải đọc ra
                  khác hẳn ba cách kia: nó không phải tiền vào két (migration
                  #194 chặn sinh phiếu sổ quỹ), nên gộp chung một dòng "Đã thu"
                  là để chủ tiệm đi đếm két rồi tưởng thiếu tiền. */}
              {order.payments.length > 0 && (
                <div className="space-y-0.5 pl-3">
                  {order.payments.map((p) => (
                    <div key={p.id} className="flex justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="min-w-0 truncate">
                        {t(`paymentDialog.methods.${p.method}`)}
                        {p.method === "points" ? ` · ${t("detail.notInCashbook")}` : ""} ·{" "}
                        {formatDateTime(p.receivedAt, locale)}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatMoney(p.amountVnd, locale)}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* "Còn thiếu" KHÔNG có nghĩa trên phiếu hoàn: tổng là số âm nên
                  dòng này đọc ra "còn thiếu âm một triệu sáu". Tiệm TRẢ tiền
                  cho khách thì không có khoản nào khách còn thiếu. */}
              {order.status !== "cancelled" && remaining !== 0 && !laPhieuHoan && (
                <div className="flex justify-between font-medium text-primary">
                  <span>{t("detail.remaining")}</span>
                  <span>{formatMoney(remaining, locale)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Giữ khách: mã giảm giá + trả bằng điểm. Chỉ đơn thường và chỉ khi
              đơn CHƯA chốt — hai hàm CSDL đều từ chối đơn đã xong/huỷ, bày nút
              ra ở đó chỉ để người dùng bấm rồi nhận lời từ chối.
              Phiếu hoàn: ẩn ở đây CHỈ là lớp thứ nhất. Chốt thật nằm ở CSDL
              (#200) — hai hàm tự trả `khong_ap_cho_phieu_hoan`, vì RPC gọi
              thẳng được, không đi qua màn này. Trước #200 chúng chỉ chặn TÌNH
              CỜ (tổng phiếu hoàn âm làm rơi vào lỗi kỹ thuật) — sửa một công
              thức không liên quan là mất chốt trong im lặng. */}
          {canWrite && order.kind === "order" && (order.status === "draft" || order.status === "confirmed") && (
            <>
              <VoucherPanel orderId={order.id} onDone={forceRefresh} />
              <PointsPanel orderId={order.id} loyalty={loyalty} remaining={remaining} onDone={forceRefresh} />
            </>
          )}

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
              {remaining > 0 && (
                <PaymentPanel order={order} remaining={remaining} bankInfo={bankInfo} onDone={forceRefresh} />
              )}
              {(order.status === "draft" || order.status === "confirmed") && (
                <CancelPanel orderId={order.id} onDone={forceRefresh} />
              )}
              {order.status === "completed" && order.kind === "order" && (
                <ReturnPanel order={order} locale={locale} onDone={(returnOrderId) => router.push(`/app/orders/${returnOrderId}`)} />
              )}
            </div>
          )}

          {/* #224 — Lịch sử đơn: ai tạo/xác nhận/hoàn tất/huỷ (+ lý do), lúc nào.
              Đọc từ domain_events (đã ghi sẵn cả vòng đời). Đơn trước KHÔNG có
              tab lịch sử nào — founder muốn "log đầy đủ chi tiết". */}
          {history.length > 0 && (
            <div className="rounded-lg border p-3">
              <h3 className="mb-2 text-[13px] font-semibold">{t("detail.historyTitle")}</h3>
              <ol className="space-y-1.5">
                {history.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px]">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
                    <div className="min-w-0">
                      <span className="font-medium">
                        {["created", "confirmed", "completed", "cancelled"].includes(h.type)
                          ? t(`detail.historyEvent.${h.type}`)
                          : h.type}
                      </span>
                      {h.actorName ? ` · ${h.actorName}` : ""}
                      <span className="text-muted-foreground"> · {formatDateTime(h.at, locale)}</span>
                      {h.cancelReason ? (
                        <div className="text-[11px] text-muted-foreground">“{h.cancelReason}”</div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Trao đổi nội bộ (thẻ man-chat-noi-bo, migration #169) — bảng RIÊNG,
              không có đường nào nối sang tin nhắn khách. Ai đọc được đơn này
              mới đọc được nó: quyền thừa hưởng từ chính bản ghi đơn. */}
          <InternalChat entityType="order" entityId={order.id} defaultOpen={false} />
        </div>
      </div>
    </div>
  );
}
