"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Plus, Search, X } from "lucide-react";
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
import { ThemKhachNhanh } from "./them-khach-nhanh";

const digitsOnly = (v: string) => v.replace(/\D/g, "");

/** Ô chọn khách — nguyên khuôn ContactPicker của màn Lịch/Cơ hội (đừng viết lại combobox thứ hai, xem app/app/calendar/appointment-dialog.tsx). */
function ContactPicker({ value, onChange }: { value: { id: string; name: string } | null; onChange: (v: { id: string; name: string } | null) => void }) {
  const t = useTranslations("orders.newOrder");
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [dangThem, datDangThem] = useState(false);

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
      <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input px-3 text-sm max-md:h-11">
        <span className="truncate">{value.name}</span>
        {/* Chữ "Đổi" là NÚT, không phải nhãn — cao bằng cả ô để ngón tay với tới. */}
        <button type="button" className="shrink-0 text-xs font-medium text-primary hover:underline max-md:flex max-md:h-11 max-md:items-center" onClick={() => onChange(null)}>
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
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 max-md:min-h-11"
              >
                <span className="truncate">{o.full_name}</span>
                {o.phone && <span className="shrink-0 text-xs text-muted-foreground">{o.phone}</span>}
              </button>
            </li>
          ))
        )}
        {/* ⚠️ HIỆN ĐÚNG LÚC TÌM KHÔNG RA, không phải một nút thường trực cạnh
            ô tìm. Nút thường trực bị nhìn thấy cả trong những lượt mà khách ĐÃ
            CÓ trong máy — và đó chính là cách người ta tạo khách trùng: thấy
            nút thì bấm, thay vì tìm trước. */}
        {!optionsQuery.isPending && !optionsQuery.isError && options.length === 0 &&
          debouncedQ.trim().length >= 2 && !dangThem && (
          <li>
            <button
              type="button"
              onClick={() => datDangThem(true)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-primary/5 max-md:min-h-11"
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              {/* Chép lại NGUYÊN VĂN thứ vừa gõ, để người bán biết mình sắp tạo ai. */}
              <span className="truncate">{t("quickAdd.createNamed", { q: debouncedQ.trim() })}</span>
            </button>
          </li>
        )}
      </ul>

      {dangThem && (
        <ThemKhachNhanh
          goiY={debouncedQ.trim()}
          thoi={() => datDangThem(false)}
          xong={(k) => {
            datDangThem(false);
            onChange(k);
          }}
        />
      )}
    </div>
  );
}

type StaffOption = { id: string; name: string };

type CartLine = {
  key: string;
  itemId: string;
  itemName: string;
  variantId: string | null;
  variantLabel: string | null;
  qty: number;
  unitPriceVnd: number;
  discountVnd: number;
  // #224 — người làm dòng này (null = để trống).
  performerEmployeeId: string | null;
  performerName: string | null;
};

/** Dòng hàng gom TRƯỚC khi tạo đơn — đơn chưa tồn tại nên chưa gọi được addOrderLine, gom ở state rồi bắn tuần tự lúc bấm "Tạo đơn". */
function CartBuilder({ items, staff, cart, onChange }: { items: Item[]; staff: StaffOption[]; cart: CartLine[]; onChange: (c: CartLine[]) => void }) {
  const t = useTranslations("orders");
  const locale = useLocale() as Locale;
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState(String(items[0]?.priceVnd ?? 0));
  const [discount, setDiscount] = useState("0");
  const [performerId, setPerformerId] = useState("");

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
    const performer = staff.find((s) => s.id === performerId) ?? null;
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
        performerEmployeeId: performer?.id ?? null,
        performerName: performer?.name ?? null,
      },
    ]);
    setQty("1");
    setDiscount("0");
    // Giữ nguyên người làm cho dòng kế: một buổi thường cùng một thợ phục vụ.
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
                {/* #224 — người làm dòng này (nếu đã chọn) → sinh hoa hồng cho đúng người. */}
                {l.performerName && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {t("addLine.performerTag", { name: l.performerName })}
                  </div>
                )}
              </div>
              <span className="shrink-0 font-medium">{formatMoney(l.qty * l.unitPriceVnd - l.discountVnd, locale)}</span>
              {/* Vùng chạm 44px trên điện thoại. Đây là nút XOÁ, nên hộp bấm
                  phải TRÙNG với phần nhìn thấy được (dấu X canh giữa trong ô
                  44px) chứ không nới ngầm bằng lề âm — nới ngầm thì chạm vào
                  chỗ hiển thị giá cũng xoá mất dòng hàng. */}
              <button
                type="button"
                onClick={() => onChange(cart.filter((x) => x.key !== l.key))}
                className="shrink-0 text-muted-foreground hover:text-destructive max-md:flex max-md:size-11 max-md:items-center max-md:justify-center"
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
        {/* #224 — người làm. Chỉ hiện khi tiệm có thợ; để trống thì hoa hồng quy
            về người của lịch hẹn (nếu có) hoặc người tạo đơn. */}
        {staff.length > 0 && (
          <div className="min-w-36 flex-1">
            <Label className="text-[11px] text-muted-foreground">{t("addLine.performerLabel")}</Label>
            <Select value={performerId} onChange={(e) => setPerformerId(e.target.value)} className="h-8">
              <option value="">{t("addLine.performerNone")}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {/* h-8 là cỡ của hàng thêm hàng trên máy tính; trên điện thoại nút này
            đứng cạnh các ô nhập đã cao 44px nên phải cao bằng. */}
        <Button type="button" size="sm" className="h-8 max-md:h-11" onClick={addToCart}>
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
  staff,
}: {
  items: Item[];
  lockedContact: { id: string; name: string } | null;
  conversationId: string | null;
  appointmentId: string | null;
  staff: StaffOption[];
}) {
  const t = useTranslations("orders");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [contact, setContact] = useState(lockedContact);
  // ⚠️ ĐẾM SỐ LƯỢT NHẬP, dùng làm `key` cho ô chọn khách. Chỉ gọi
  //   `setContact(null)` là CHƯA ĐỦ: ô chọn khách giữ CHỮ VỪA GÕ trong state
  //   riêng của nó, nên sau khi "lưu và nhập tiếp" người bán vẫn thấy tên
  //   khách cũ nằm trong ô tìm cùng kết quả tìm kiếm cũ. Đổi `key` là cách
  //   React dựng lại hẳn một ô mới, sạch từ đầu.
  //   Bộ kiểm bắt được đúng chỗ này — đọc mã nguồn thì "đã xoá khách rồi".
  const [lanNhap, datLanNhap] = useState(0);
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

  /**
   * @param nhapTiep  true = ở lại màn, xoá giỏ và khách, GIỮ người thực hiện.
   *
   * ⚠️ XOÁ GIỎ, KHÔNG GIỮ. Nghe thì giữ giỏ tiện hơn, nhưng khách sau mua thứ
   *   khác — giữ lại nghĩa là người bán phải NHỚ xoá, và ngày nào cũng sẽ có
   *   một đơn bị tính dư dịch vụ của khách trước. Xoá sạch thì sai lầm duy
   *   nhất có thể xảy ra là gõ lại, không phải tính tiền nhầm.
   *
   * ⚠️ XOÁ KHÁCH luôn: khách tiếp theo chắc chắn là người khác. Giữ lại khách
   *   cũ là mở đường cho một đơn ghi nhầm tên người.
   */
  const submit = ({ nhapTiep = false }: { nhapTiep?: boolean } = {}) => {
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
      // Giảm giá đi qua `discount_request` (trần theo vai, migration #165) nên
      // mỗi dòng có thêm một kết quả RIÊNG: áp được, hay phải chờ duyệt. Đếm
      // tách khỏi `soDongHong` — dòng chờ duyệt KHÔNG hỏng, nó chỉ chưa trừ tiền.
      let soChoDuyet = 0;
      let soGiamHong = 0;
      let tranCuaBan: number | null = null;
      for (const line of cart) {
        const res = await addOrderLine({
          orderId: orderRes.orderId,
          itemId: line.itemId,
          variantId: line.variantId,
          qty: line.qty,
          unitPriceVnd: line.unitPriceVnd,
          discountVnd: line.discountVnd,
          appointmentId: nguonLichHen,
          performedByEmployeeId: line.performerEmployeeId,
        });
        if (res.error) {
          soDongHong += 1;
          continue;
        }
        if (res.discount?.ketQua === "cho_duyet") {
          soChoDuyet += 1;
          tranCuaBan = res.discount.tranCuaBan ?? tranCuaBan;
        } else if (res.discount && res.discount.ketQua !== "da_ap") {
          soGiamHong += 1;
        }
      }
      if (soDongHong > 0) toast.error(t("toasts.linesFailed", { count: soDongHong }));
      else toast.success(t("toasts.created"));
      // Ba câu này CỘNG THÊM chứ không thay câu trên: đơn tạo được là một
      // chuyện, khoản giảm có vào hay không là chuyện khác — gộp làm một là
      // đúng kiểu lỗi im lặng đã dập ở việc #166.
      if (soGiamHong > 0) toast.error(t("toasts.discountsFailed", { count: soGiamHong }));
      if (soChoDuyet > 0) {
        toast.warning(t("toasts.discountsPending", { count: soChoDuyet, cap: tranCuaBan ?? 0 }));
      }
      if (nhapTiep) {
        setContact(null);
        setCart([]);
        datLanNhap((n) => n + 1);
        return;
      }
      router.push(`/app/orders/${orderRes.orderId}`);
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
          {/* ĐƯỜNG LUI. "+ Tạo đơn" mở hẳn một TRANG riêng chứ không phải cửa
              sổ, nên bỏ dở là kẹt: không có Huỷ, không có Quay lại, chỉ còn
              nút back của trình duyệt — mà trên điện thoại nhiều người không
              dùng tới. Dẫn thẳng về danh sách Đơn hàng chứ KHÔNG dùng
              `router.back()`: vào màn này từ đâu cũng có, back có thể ném
              người dùng về một chỗ chẳng liên quan. Vùng chạm 44px cho ngón tay. */}
          <Link
            href="/app/orders"
            className="-ml-1 inline-flex h-11 items-center gap-1.5 pr-2 pl-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {tCommon("back")}
          </Link>
          <h1 className="text-lg font-semibold">{t("newOrder.title")}</h1>

          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">{t("newOrder.contactLabel")}</Label>
            <ContactPicker key={lanNhap} value={contact} onChange={setContact} />
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
            <CartBuilder items={items} staff={staff} cart={cart} onChange={setCart} />
          </div>

          {/* ⚠️ "Lưu và nhập tiếp" là nút PHỤ, đứng TRƯỚC nút chính. Đa số lượt
              là bán một đơn rồi xong; đưa nó lên làm nút chính là tối ưu cho
              thiểu số và làm chậm đa số. */}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => submit({ nhapTiep: true })}
              disabled={!contact || pending}
            >
              {t("newOrder.submitAndNew")}
            </Button>
            <Button onClick={() => submit()} disabled={!contact || pending}>
              {pending ? t("newOrder.creating") : t("newOrder.submit")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
