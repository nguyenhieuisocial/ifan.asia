"use client";

import { useLocale, useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import type { Item } from "@/lib/catalog/items";
import { OTien } from "./o-tien";

/**
 * LƯỚI DÒNG HÀNG KIỂU CHỨNG TỪ (thẻ `man-nhap-don-kieu-chung-tu`).
 *
 * ⚠️ THAY CHO KHUÔN "FORM THÊM DÒNG + DANH SÁCH CHỈ ĐỌC". Bản cũ có một khối
 *   nhập ở dưới và một danh sách ở trên: gõ ở chỗ này, kết quả hiện ở chỗ khác,
 *   và muốn sửa số lượng thì phải XOÁ dòng rồi gõ lại từ đầu. Ở đây mỗi dòng
 *   chính là chỗ sửa. Bỏ được một lần chuyển mắt và một lần bấm cho MỖI dòng —
 *   tiệm nhập 30 đơn/ngày thì đó là hàng trăm thao tác.
 *
 * ⚠️ CHỌN MẶT HÀNG LÀ THÊM DÒNG LUÔN, không có nút "Thêm" riêng. Một lần bấm
 *   thay vì hai. Chọn nhầm thì xoá dòng — rẻ hơn hẳn việc mỗi lần đúng đều phải
 *   trả thêm một cú bấm.
 *
 * ⚠️ DÙNG `<select>` CHỨ KHÔNG DỰNG COMBOBOX GÕ-ĐỂ-TÌM. Thẻ vẽ ô "gõ tên mặt
 *   hàng", nhưng đo lại: tiệm nhiều mặt hàng nhất trong kho có 37 món, và
 *   `<select>` gốc trên điện thoại mở bảng chọn của hệ điều hành — quen tay,
 *   đọc màn hình được, không tốn mã. Dựng combobox thứ ba trong kho chỉ để hơn
 *   được vài trăm mili giây với 37 dòng là đánh đổi tồi. Khi nào có tiệm vài
 *   trăm mặt hàng thì đổi, và lúc đó đổi vì đo được chứ không vì thấy MISA có.
 */

export type DongHang = {
  key: string;
  itemId: string;
  itemName: string;
  itemKind: string;
  variantId: string | null;
  variantLabel: string | null;
  qty: number;
  unitPriceVnd: number;
  discountVnd: number;
  /** Người bán gõ "10%" thì giữ lại số 10 để hiện lại đúng thứ họ gõ. */
  giamPhanTram: number | null;
  performerEmployeeId: string | null;
  performerName: string | null;
};

export type Tho = { id: string; name: string };

/** Tiền của một dòng, sau giảm. Không bao giờ âm. */
export const tienDong = (d: DongHang) =>
  Math.max(0, d.qty * d.unitPriceVnd - d.discountVnd);

export function LuoiDongHang({
  items,
  tonKho,
  staff,
  cart,
  onChange,
  thoMacDinh,
  onTaoDon,
}: {
  items: Item[];
  /** Tồn kho theo mã mặt hàng — chỉ có với hàng hoá, dịch vụ không có. */
  tonKho: Record<string, number>;
  staff: Tho[];
  cart: DongHang[];
  onChange: (c: DongHang[]) => void;
  thoMacDinh: string;
  onTaoDon: () => void;
}) {
  const t = useTranslations("orders");
  const locale = useLocale() as Locale;

  const sua = (key: string, thay: Partial<DongHang>) =>
    onChange(cart.map((d) => (d.key === key ? { ...d, ...thay } : d)));

  const themMon = (itemId: string) => {
    const mon = items.find((i) => i.id === itemId);
    if (!mon) return;
    const tho = staff.find((s) => s.id === thoMacDinh) ?? null;
    onChange([
      ...cart,
      {
        key: `${itemId}-${cart.length}-${cart.length ? cart[cart.length - 1].key.length : 0}`,
        itemId,
        itemName: mon.name,
        itemKind: mon.kind,
        variantId: null,
        variantLabel: null,
        qty: 1,
        unitPriceVnd: mon.priceVnd,
        discountVnd: 0,
        giamPhanTram: null,
        performerEmployeeId: tho?.id ?? null,
        performerName: tho?.name ?? null,
      },
    ]);
  };

  /**
   * Đổi giảm giá. Gõ số có `%` thì quy ra tiền của ĐÚNG dòng đó.
   *
   * ⚠️ Vẫn đi qua đường xin duyệt cũ khi lưu: trần giảm giá theo vai là luật của
   *   tiệm, ô nhập này chỉ là cách gõ cho nhanh, không phải cách đi vòng.
   */
  const doiGiam = (d: DongHang, chu: string) => {
    const laPhanTram = chu.trim().endsWith("%");
    const so = Number(chu.replace(/[^\d]/g, "")) || 0;
    if (laPhanTram) {
      const pct = Math.min(100, so);
      sua(d.key, {
        giamPhanTram: pct,
        discountVnd: Math.round((d.qty * d.unitPriceVnd * pct) / 100),
      });
    } else {
      sua(d.key, { giamPhanTram: null, discountVnd: Math.min(so, d.qty * d.unitPriceVnd) });
    }
  };

  const tamTinh = cart.reduce((s, d) => s + d.qty * d.unitPriceVnd, 0);
  const tongGiam = cart.reduce((s, d) => s + Math.min(d.discountVnd, d.qty * d.unitPriceVnd), 0);
  const phaiTra = Math.max(0, tamTinh - tongGiam);

  if (items.length === 0) return null;

  const tonCua = (d: DongHang) => (d.itemKind === "product" ? tonKho[d.itemId] : undefined);

  return (
    <div
      // ⚠️ `Ctrl/⌘ + Enter` = tạo đơn, đặt ở KHUNG chứ không ở từng ô: người bán
      //   có thể đang đứng ở bất kỳ ô nào khi gõ xong. Chỉ có nghĩa khi có bàn
      //   phím; trên điện thoại nó vô hình và vô hại.
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          onTaoDon();
        }
      }}
    >
      <div className="overflow-hidden rounded-md border">
        {/* Hàng tiêu đề cột — chỉ có nghĩa khi lưới còn là lưới, nên giấu ở khổ hẹp. */}
        <div className="hidden bg-muted/60 px-2 py-1.5 text-[9.5px] font-bold tracking-wide text-muted-foreground uppercase md:flex md:gap-2">
          <span className="flex-1">{t("addLine.itemLabel")}</span>
          <span className="w-14 text-right">{t("luoi.sl")}</span>
          <span className="w-28 text-right">{t("addLine.priceLabel")}</span>
          <span className="w-24 text-right">{t("luoi.giam")}</span>
          <span className="w-28 text-right">{t("luoi.thanhTien")}</span>
          <span className="w-8" />
        </div>

        {cart.map((d) => {
          const ton = tonCua(d);
          const thieuHang = ton !== undefined && ton < d.qty;
          return (
            <div
              key={d.key}
              className="flex flex-col gap-1.5 border-t p-2 text-[13px] md:flex-row md:items-center md:gap-2"
            >
              <div className="min-w-0 flex-1">
                <span className="truncate font-medium">{d.itemName}</span>
                {ton !== undefined && (
                  <span
                    className={cn(
                      "ml-1.5 text-[11px]",
                      thieuHang ? "font-semibold text-destructive" : "text-green-700 dark:text-green-400",
                    )}
                  >
                    {t("luoi.con", { n: ton })}
                  </span>
                )}
                {staff.length > 0 && (
                  <Select
                    value={d.performerEmployeeId ?? ""}
                    onChange={(e) => {
                      const tho = staff.find((s) => s.id === e.target.value) ?? null;
                      sua(d.key, {
                        performerEmployeeId: tho?.id ?? null,
                        performerName: tho?.name ?? null,
                      });
                    }}
                    className="mt-1 h-7 w-full text-[11.5px] max-md:h-9"
                    aria-label={t("addLine.performerLabel")}
                  >
                    <option value="">{t("addLine.performerNone")}</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              <div className="flex items-center gap-2 md:contents">
                <div className="w-14 max-md:flex-1">
                  <span className="mb-0.5 block text-[10px] text-muted-foreground md:hidden">
                    {t("luoi.sl")}
                  </span>
                  <input
                    inputMode="numeric"
                    value={d.qty}
                    aria-label={t("luoi.sl")}
                    onChange={(e) => {
                      const q = Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1);
                      // Giảm theo % phải tính lại khi số lượng đổi — nếu không,
                      // "giảm 10%" của một dòng 1 món vẫn giữ nguyên số tiền cũ
                      // khi người bán sửa thành 3 món.
                      sua(d.key, {
                        qty: q,
                        ...(d.giamPhanTram !== null
                          ? { discountVnd: Math.round((q * d.unitPriceVnd * d.giamPhanTram) / 100) }
                          : {}),
                      });
                    }}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-right text-[13px] tabular-nums focus-visible:ring-ring/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:outline-none max-md:h-10"
                  />
                </div>

                <div className="w-28 max-md:flex-1">
                  <span className="mb-0.5 block text-[10px] text-muted-foreground md:hidden">
                    {t("addLine.priceLabel")}
                  </span>
                  <OTien
                    value={d.unitPriceVnd}
                    aria-label={t("addLine.priceLabel")}
                    onChange={(v) =>
                      sua(d.key, {
                        unitPriceVnd: v,
                        ...(d.giamPhanTram !== null
                          ? { discountVnd: Math.round((d.qty * v * d.giamPhanTram) / 100) }
                          : {}),
                      })
                    }
                  />
                </div>

                <div className="w-24 max-md:flex-1">
                  <span className="mb-0.5 block text-[10px] text-muted-foreground md:hidden">
                    {t("luoi.giam")}
                  </span>
                  <input
                    value={
                      d.giamPhanTram !== null
                        ? `${d.giamPhanTram}%`
                        : d.discountVnd === 0
                          ? ""
                          : String(d.discountVnd).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
                    }
                    aria-label={t("luoi.giam")}
                    placeholder={t("luoi.giamGoiY")}
                    onChange={(e) => doiGiam(d, e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-right text-[13px] tabular-nums focus-visible:ring-ring/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:outline-none max-md:h-10"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 md:contents">
                <span className="w-28 text-right font-semibold tabular-nums max-md:flex-1">
                  {formatMoney(tienDong(d), locale)}
                </span>
                {/* Vùng chạm 44px trên điện thoại, và hộp bấm TRÙNG phần nhìn
                    thấy — nới ngầm bằng lề âm thì chạm vào chỗ hiện giá cũng
                    xoá mất dòng hàng. */}
                <button
                  type="button"
                  onClick={() => onChange(cart.filter((x) => x.key !== d.key))}
                  aria-label={t("luoi.xoaDong", { ten: d.itemName })}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive max-md:size-11"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
          );
        })}

        {/* Hàng thêm dòng — chọn mặt hàng là thêm luôn, không có nút Thêm riêng. */}
        <div className="flex items-center gap-2 border-t bg-muted/20 p-2">
          <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Select
            value=""
            aria-label={t("luoi.themDong")}
            onChange={(e) => {
              if (e.target.value) themMon(e.target.value);
            }}
            className="h-8 flex-1 text-[13px] max-md:h-11"
          >
            <option value="">{t("luoi.themDong")}</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.kind === "product" && tonKho[i.id] !== undefined
                  ? ` — ${t("luoi.con", { n: tonKho[i.id] })}`
                  : ""}
              </option>
            ))}
          </Select>
        </div>

        {/* ⚠️ KHỐI TỔNG — thứ MÀN NÀY TRƯỚC ĐÂY KHÔNG CÓ. Đo 22/08: thêm hai
            dòng tổng 700.000đ mà không có chữ "Tổng" nào trên màn; người bán
            bấm Tạo đơn mà chưa từng thấy khách phải trả bao nhiêu. */}
        {cart.length > 0 && (
          <div className="border-t-2 border-foreground bg-muted/30 px-3 py-2">
            <div className="flex justify-between text-[12.5px]">
              <span>{t("luoi.tamTinh", { n: cart.length })}</span>
              <span className="tabular-nums">{formatMoney(tamTinh, locale)}</span>
            </div>
            {tongGiam > 0 && (
              <div className="flex justify-between text-[12.5px]">
                <span>{t("luoi.tongGiam")}</span>
                <span className="tabular-nums text-destructive">
                  −{formatMoney(tongGiam, locale)}
                </span>
              </div>
            )}
            <div className="mt-1 flex items-baseline justify-between border-t pt-1.5">
              <span className="text-[13px] font-semibold">{t("luoi.phaiTra")}</span>
              <span className="text-lg font-bold tabular-nums lg:text-xl">
                {formatMoney(phaiTra, locale)}
              </span>
            </div>
          </div>
        )}
      </div>

      {cart.length === 0 && (
        <p className="mt-1.5 text-[12px] text-muted-foreground">{t("luoi.chuaCoDong")}</p>
      )}
    </div>
  );
}

/** Ô chọn người làm MẶC ĐỊNH cho cả phiếu — đặt ở đầu chứng từ. */
export function ThoMacDinh({
  staff,
  value,
  onChange,
}: {
  staff: Tho[];
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("orders");
  if (staff.length === 0) return null;
  return (
    <div className="min-w-40 flex-1">
      <Label className="text-[11px] text-muted-foreground">{t("luoi.thoMacDinh")}</Label>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 max-md:h-11"
      >
        <option value="">{t("addLine.performerNone")}</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("luoi.thoMacDinhGiaiThich")}</p>
    </div>
  );
}
