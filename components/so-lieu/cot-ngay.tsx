"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";

/**
 * DẢI CỘT DOANH THU THEO NGÀY — BẤM ĐƯỢC (thẻ `man-so-lieu-va-bieu-do`, #343).
 *
 * ═══════════════════════════════════════════════════════════════════
 * ĐÂY LÀ PHẦN BỔ SUNG, KHÔNG PHẢI DỰNG LẠI
 * ═══════════════════════════════════════════════════════════════════
 * Màn Tổng quan ĐÃ CÓ biểu đồ cột doanh thu theo ngày từ trước (`RevenueChart`
 * trong `app/app/dashboard-panels.tsx`), tự vẽ bằng CSS, lấy số từ ĐƠN HÀNG
 * theo ngày tạo — đúng nguồn. Ba thứ nó thiếu, và đây là những thứ file này bù:
 *
 *   ① KHÔNG BẤM ĐƯỢC — nhìn thấy một ngày cao vọt mà không mở ra xem được.
 *   ② KHÔNG CÓ BẢNG SỐ — trình đọc màn hình chỉ nghe được một câu tóm tắt, và
 *     chủ tiệm phải ước lượng chiều cao cột thay vì đọc con số.
 *   ③ Không có chỗ nào chỉ ra ngày đang trỏ tới.
 *
 * ⚠️ VÌ SAO VẪN KHÔNG DÙNG THƯ VIỆN BIỂU ĐỒ. Đo thật 22/08 (bundlephobia + npm
 *   + GitHub API): recharts nhập cả gói **147,5 KB nén**, nivo 92,4 KB,
 *   chart.js 68,4 KB. iFan cần ĐÚNG MỘT loại biểu đồ; mọi chỗ khác thì BẢNG đọc
 *   chính xác hơn. Thêm 148 KB vào một app người dùng mở bằng mạng di động ở
 *   Việt Nam, để vẽ 30 cái cột, là đánh đổi tồi.
 *   Đổi ý khi nào: cần nhiều LOẠI biểu đồ (đường, vùng, chồng lớp) thì lúc đó
 *   thêm thư viện mới đúng. Đừng thêm trước.
 *
 * ⚠️ KHOAN SÂU CÓ NƠI ĐẾN, KHÔNG LỌC CHÉO. Bấm một cột thì ĐI TỚI danh sách đơn
 *   của ngày đó. Lọc chéo (cả màn đổi số sau một cú chạm) là thứ dân phân tích
 *   quen; chủ tiệm không rành kỹ thuật sẽ nghĩ app bị lỗi.
 *
 * ⚠️ KHÔNG DÙNG TOOLTIP NỔI. Trên điện thoại nó bị chính ngón tay che, và WCAG
 *   1.4.13 đòi tooltip phải rê vào được và giữ được. Một DÒNG CỐ ĐỊNH ngay dưới
 *   dải cột không có cả hai vấn đề đó.
 */

export interface DiemNgay {
  /** `2026-08-22` */
  ngay: string;
  tien: number;
  so_don: number;
}

/** `2026-08-22` → `22/08`. Cắt chuỗi, KHÔNG qua `Date` — qua `Date` là lệch múi giờ. */
function ngayGon(iso: string): string {
  const [, thang, ngay] = iso.slice(0, 10).split("-");
  return `${ngay}/${thang}`;
}

export function CotNgay({
  diem,
  locale,
  khuonDuongDan,
}: {
  diem: DiemNgay[];
  locale: Locale;
  /**
   * Khuôn đường dẫn khi bấm một cột, dùng `{ngay}` làm chỗ thay.
   * Ví dụ: `/app/orders?tu={ngay}&den={ngay}`.
   *
   * ⚠️ NHẬN CHUỖI, KHÔNG NHẬN HÀM. Thành phần này chạy ở trình duyệt còn nơi
   *   gọi chạy ở máy chủ — React KHÔNG truyền hàm qua ranh giới đó, và lỗi
   *   không hiện lúc dịch mà làm SẬP CẢ MÀN lúc chạy. Đã sập thật một lần:
   *   "Functions cannot be passed directly to Client Components".
   */
  khuonDuongDan?: string;
}) {
  const t = useTranslations("soLieu");
  const [chon, datChon] = useState<number | null>(null);

  if (diem.length === 0) return null;

  const cao = Math.max(...diem.map((d) => d.tien), 1);
  const tong = diem.reduce((s, d) => s + d.tien, 0);
  const cuoi = diem.length - 1;
  const i = chon === null ? cuoi : chon;
  const d = diem[i];

  // Ba ngày nhiều tiền nhất — bảng số bên dưới chỉ cần đủ để đối chiếu, không
  // cần liệt kê cả 30 dòng trên một màn điện thoại.
  const noiBat = [...diem]
    .map((x, k) => ({ ...x, k }))
    .sort((a, b) => b.tien - a.tien)
    .slice(0, 3)
    .sort((a, b) => a.k - b.k);

  return (
    <div>
      <div
        role="img"
        aria-label={t("motaBieuDo", { n: diem.length, tien: formatMoney(tong, locale) })}
        className="flex h-24 items-end gap-px"
      >
        {diem.map((x, k) => {
          const laCuoi = k === cuoi;
          const pct = x.tien > 0 ? Math.max(6, Math.round((x.tien / cao) * 100)) : 0;
          return (
            <button
              key={x.ngay}
              type="button"
              // Cột chỉ rộng vài pixel, nhưng nút phủ TOÀN BỘ chiều cao khung
              // (96px) nên diện tích chạm thật vẫn thoải mái — chiều cao bù cho
              // bề ngang hẹp của một dải 30 cột (WCAG 2.5.8).
              onClick={() => datChon(k)}
              onMouseEnter={() => datChon(k)}
              onFocus={() => datChon(k)}
              aria-label={`${ngayGon(x.ngay)}: ${formatMoney(x.tien, locale)}`}
              className="flex h-full flex-1 items-end"
            >
              {pct > 0 ? (
                <span
                  className={cn(
                    "block w-full rounded-t-sm transition-colors",
                    laCuoi ? "bg-foreground" : k === i ? "bg-primary" : "bg-primary/80",
                  )}
                  style={{ height: `${pct}%` }}
                />
              ) : (
                // Ngày không có đồng nào vẫn phải CHIẾM CHỖ. Bỏ đi thì biểu đồ
                // nối thẳng qua và trông như tiệm bán đều — che mất đúng những
                // ngày ế, thứ đáng nhìn nhất.
                <span className="block h-0.5 w-full rounded-full bg-muted" />
              )}
            </button>
          );
        })}
      </div>

      {/* Dòng đang trỏ tới — thay cho tooltip nổi. */}
      <div className="mt-2 flex items-baseline justify-between gap-2 border-t pt-2">
        <span className="text-[12px] font-semibold">{ngayGon(d.ngay)}</span>
        <span className="text-[12px] tabular-nums">
          {formatMoney(d.tien, locale)}
          <span className="ml-2 text-[11px] text-muted-foreground">
            {t("soDon", { n: d.so_don })}
          </span>
        </span>
      </div>

      {khuonDuongDan && d.so_don > 0 && (
        <Link
          href={khuonDuongDan.replaceAll("{ngay}", d.ngay)}
          className="mt-1 inline-block text-[12px] font-medium text-primary hover:underline"
        >
          {t("xemDonNgay", { ngay: ngayGon(d.ngay) })}
        </Link>
      )}

      {/* ⚠️ BẢNG SỐ — vừa là cách duy nhất để trình đọc màn hình đọc được biểu
          đồ (WCAG: màu và chiều cao không được là cách duy nhất truyền tin), vừa
          đúng thứ chủ tiệm cần: họ muốn CON SỐ, không muốn ước lượng cột. */}
      {noiBat.length > 0 && (
        <table className="mt-3 w-full text-[11.5px]">
          <caption className="pb-1 text-left text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
            {t("ngayCaoNhat")}
          </caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">{t("cotNgay")}</th>
              <th scope="col">{t("cotTien")}</th>
              <th scope="col">{t("cotDon")}</th>
            </tr>
          </thead>
          <tbody>
            {noiBat.map((x) => (
              <tr key={x.ngay} className="border-t">
                <td className="py-1 font-medium">{ngayGon(x.ngay)}</td>
                <td className="py-1 text-right tabular-nums">{formatMoney(x.tien, locale)}</td>
                <td className="w-16 py-1 text-right text-muted-foreground tabular-nums">
                  {x.so_don}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
