"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { Item } from "@/lib/catalog/items";
import { searchContactOptions } from "../../deals/queries";
import type { ContactOption } from "../../deals/types";
import { addOrderLine, createOrder } from "../actions";

const digitsOnly = (v: string) => v.replace(/\D/g, "");

/** Ô chọn khách — nguyên khuôn ContactPicker của màn Lịch/Cơ hội (đừng viết lại combobox thứ hai, xem app/app/calendar/appointment-dialog.tsx). */
function ContactPicker({ value, onChange }: { value: { id: string; name: string } | null; onChange: (v: { id: string; name: string } | null) => void }) {
  const t = useTranslations("orders.newOrder");
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const optionsQuery = useQuery({
    queryKey: ["order-contact-options", debouncedQ],
    queryFn: () => searchContactOptions(supabase, debouncedQ),
    enabled: value === null,
  });
  const options: ContactOption[] = optionsQuery.data ?? [];

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input px-3 text-sm">
        <span className="truncate">{value.name}</span>
        <button type="button" className="shrink-0 text-xs font-medium text-primary hover:underline" onClick={() => onChange(null)}>
          {t("contactChange")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("contactSearchPlaceholder")} className="pl-8" autoFocus />
      </div>
      <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
        {optionsQuery.isPending && options.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">{t("contactLoading")}</li>
        ) : optionsQuery.isError ? (
          // Tra cứu HỎNG khác hẳn "tiệm không có khách này": hàm tìm ném lỗi
          // → danh sách rỗng → trước đây hiện y hệt câu "không tìm thấy",
          // người bán tưởng chưa có rồi đi tạo khách TRÙNG. Cùng lớp lỗi im
          // lặng với việc #166.
          <li className="px-3 py-2 text-xs text-destructive">{t("contactSearchFailed")}</li>
        ) : options.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">{t("contactEmpty")}</li>
        ) : (
          options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onChange({ id: o.id, name: o.full_name })}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
              >
                <span className="truncate">{o.full_name}</span>
                {o.phone && <span className="shrink-0 text-xs text-muted-foreground">{o.phone}</span>}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

type CartLine = {
  key: string;
  itemId: string;
  itemName: string;
  variantId: string | null;
  variantLabel: string | null;
  qty: number;
  unitPriceVnd: number;
  discountVnd: number;
};

/** Dòng hàng gom TRƯỚC khi tạo đơn — đơn chưa tồn tại nên chưa gọi được addOrderLine, gom ở state rồi bắn tuần tự lúc bấm "Tạo đơn". */
function CartBuilder({ items, cart, onChange }: { items: Item[]; cart: CartLine[]; onChange: (c: CartLine[]) => void }) {
  const t = useTranslations("orders");
  const locale = useLocale() as Locale;
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState(String(items[0]?.priceVnd ?? 0));
  const [discount, setDiscount] = useState("0");

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

  const addToCart = () => {
    const qtyNum = Number(qty);
    if (!selectedItem || !Number.isFinite(qtyNum) || qtyNum <= 0) return;
    const variant = variants.find((v) => v.id === variantId) ?? null;
    onChange([
      ...cart,
      {
        key: `${itemId}-${variantId}-${cart.length}`,
        itemId,
        itemName: selectedItem.name,
        variantId: variant?.id ?? null,
        variantLabel: variant?.label ?? null,
        qty: qtyNum,
        unitPriceVnd: Number(price || "0"),
        discountVnd: Number(discount || "0"),
      },
    ]);
    setQty("1");
    setDiscount("0");
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {cart.length > 0 && (
        <div className="divide-y rounded-md border">
          {cart.map((l) => (
            <div key={l.key} className="flex items-center gap-2 p-2 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="truncate">{l.itemName}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {l.variantLabel ? `${l.variantLabel} · ` : ""}
                  {formatMoney(l.unitPriceVnd, locale)} × {l.qty}
                </div>
              </div>
              <span className="shrink-0 font-medium">{formatMoney(l.qty * l.unitPriceVnd - l.discountVnd, locale)}</span>
              <button
                type="button"
                onClick={() => onChange(cart.filter((x) => x.key !== l.key))}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={t("addLine.remove")}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-2.5">
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
        <Button type="button" size="sm" className="h-8" onClick={addToCart}>
          <Plus className="size-3.5" />
          {t("addLine.add")}
        </Button>
      </div>
    </div>
  );
}

export function NewOrderView({
  items,
  lockedContact,
  conversationId,
  appointmentId,
}: {
  items: Item[];
  lockedContact: { id: string; name: string } | null;
  conversationId: string | null;
  appointmentId: string | null;
}) {
  const t = useTranslations("orders");
  const router = useRouter();
  const [contact, setContact] = useState(lockedContact);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pending, startTransition] = useTransition();

  /**
   * Nguồn (hội thoại / lịch hẹn) CHỈ còn đúng khi vẫn là khách ban đầu — việc #165.
   *
   * `contact` là state đổi được qua ContactPicker, còn conversationId/appointmentId
   * là props CỐ ĐỊNH từ đường dẫn. Trước đây không xoá khi đổi khách: vào tạo đơn từ
   * hội thoại của khách A rồi đổi sang khách B thì đơn của B bị ghi
   * `source_conversation_id` của A — báo cáo "nguồn nào mang tiền về" quy kết sai
   * công cho nguồn, mà đây là ghi SAI xuống CSDL chứ không chỉ hiện sai (lớp lỗi #18).
   * `appointmentId` còn nặng hơn vì nó gắn xuống TỪNG DÒNG HÀNG.
   */
  const giuNguon = contact?.id === lockedContact?.id;
  const nguonHoiThoai = giuNguon ? conversationId : null;
  const nguonLichHen = giuNguon ? appointmentId : null;

  const submit = () => {
    if (!contact) return;
    startTransition(async () => {
      const orderRes = await createOrder({
        contactId: contact.id,
        sourceConversationId: nguonHoiThoai,
        sourceAppointmentId: nguonLichHen,
      });
      if (orderRes.error || !orderRes.orderId) {
        toast.error(t(`toasts.${orderRes.error === "forbidden" ? "forbidden" : "saveFailed"}`));
        return;
      }
      // Bắn tuần tự từng dòng cart — không có transaction nhiều bảng qua
      // supabase-js REST (cùng giới hạn đã ghi ở createReturn trong actions.ts).
      // Lỗi giữa chừng vẫn để lại đơn Nháp có phần dòng đã thêm — không mất gì,
      // người dùng thêm tiếp ở trang chi tiết. NHƯNG phải NÓI RA (việc #166):
      // trước đây kết quả không ai đọc rồi vẫn báo "Đã tạo đơn", nên dòng hàng
      // rớt biến mất im lặng và người bán tưởng đơn đã đủ.
      let soDongHong = 0;
      for (const line of cart) {
        const res = await addOrderLine({
          orderId: orderRes.orderId,
          itemId: line.itemId,
          variantId: line.variantId,
          qty: line.qty,
          unitPriceVnd: line.unitPriceVnd,
          discountVnd: line.discountVnd,
          appointmentId: nguonLichHen,
        });
        if (res.error) soDongHong += 1;
      }
      if (soDongHong > 0) toast.error(t("toasts.linesFailed", { count: soDongHong }));
      else toast.success(t("toasts.created"));
      router.push(`/app/orders/${orderRes.orderId}`);
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
          <h1 className="text-lg font-semibold">{t("newOrder.title")}</h1>

          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">{t("newOrder.contactLabel")}</Label>
            <ContactPicker value={contact} onChange={setContact} />
          </div>

          {/* Dòng nguồn phải BIẾN MẤT khi đổi khách — nếu vẫn hiện "Từ hội thoại
              đang mở" trong khi đơn không còn gắn nguồn đó nữa thì màn nói dối
              đúng chiều ngược lại của bug vừa vá. */}
          {(nguonHoiThoai || nguonLichHen) && (
            <p className="text-[11px] text-muted-foreground">
              {nguonHoiThoai ? t("newOrder.fromConversation") : t("newOrder.fromAppointment")}
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">{t("detail.linesTitle")}</Label>
            <CartBuilder items={items} cart={cart} onChange={setCart} />
          </div>

          <div className="flex justify-end">
            <Button onClick={submit} disabled={!contact || pending}>
              {pending ? t("newOrder.creating") : t("newOrder.submit")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
