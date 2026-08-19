"use client";

import { useLocale, useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";

/**
 * Ví điểm của khách trên hồ sơ (V6 retention, thẻ design man-voucher-tich-diem).
 *
 * Thẻ design đòi: quy đổi ra TIỀN nằm ngay dưới con số điểm. Lý do — "1.240 điểm"
 * không nói cho ai biết điều gì; "≈ 124.000đ khi đổi" thì cả khách lẫn nhân viên
 * hiểu ngay. Con số quy đổi TÍNH Ở SERVER, không nhân lại ở đây (hai nơi cùng
 * nhân là hai nơi ra hai kết quả — lỗi #18).
 *
 * Đợt này ví CHỈ ĐỌC. Nút "Dùng ngay" thuộc lúc thanh toán (màn Tạo đơn), không
 * đặt ở hồ sơ: trừ điểm mà không gắn vào một đơn cụ thể là tạo ra khoản trừ
 * không truy được về đâu.
 */
export type LoyaltyWalletData = {
  diemCon: number;
  diemSapHetHan: number;
  quyDoiVnd: number;
  lichSu: { id: string; delta: number; reason: string; note: string | null; createdAt: string }[];
};

export function LoyaltyWallet({ data }: { data: LoyaltyWalletData | null }) {
  const t = useTranslations("contacts.loyalty");
  const locale = useLocale() as Locale;

  // Tiệm chưa bật tích điểm, hoặc khách chưa có điểm nào → không chiếm chỗ.
  if (!data || data.diemCon === 0) return null;

  const fmtNgay = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "vi-VN", {
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(iso));

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">{t("title")}</h2>
      </div>

      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {new Intl.NumberFormat(locale).format(data.diemCon)}
        <span className="ml-1 text-[13px] font-normal text-muted-foreground">{t("unit")}</span>
      </p>
      <p className="text-[13px] text-muted-foreground">
        {t("worth", { amount: formatMoney(data.quyDoiVnd, locale) })}
      </p>

      {data.diemSapHetHan > 0 && (
        <p className="mt-1 text-[12px] text-destructive">
          {t("expiring", { points: new Intl.NumberFormat(locale).format(data.diemSapHetHan) })}
        </p>
      )}

      {data.lichSu.length > 0 && (
        <ul className="mt-3 space-y-1 border-t pt-3">
          {data.lichSu.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-muted-foreground">
                {fmtNgay(d.createdAt)} · {t(`reasons.${d.reason}`)}
                {d.note ? ` — ${d.note}` : ""}
              </span>
              <span
                className={`shrink-0 font-medium tabular-nums ${
                  d.delta > 0 ? "text-green-600" : "text-muted-foreground"
                }`}
              >
                {d.delta > 0 ? "+" : ""}
                {new Intl.NumberFormat(locale).format(d.delta)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
