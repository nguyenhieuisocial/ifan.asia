import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/format";
import { TheSo } from "@/components/so-lieu/the-so";
import { soSanh, soVoiThuongNgay, type SoLieuHomNay } from "@/lib/so-lieu/hom-nay";
import type { Locale } from "@/i18n/config";

/**
 * KHỐI "HÔM NAY" — bốn con số và một đoạn tóm tắt bằng lời
 * (thẻ `man-so-lieu-va-bieu-do`, mục "Điện thoại — màn Hôm nay").
 *
 * ⚠️ TIÊU ĐỀ LÀ "TÌNH HÌNH HÔM NAY", KHÔNG PHẢI "HÔM NAY". Thanh điều hướng
 *   dưới cùng ĐÃ CÓ một mục tên "Hôm nay" dẫn sang `/app/today` — hàng đợi
 *   "hôm nay gọi ai" của người bán, một thứ hoàn toàn khác. Hai chỗ cùng tên
 *   trên một màn thì người dùng bấm nhầm, rồi tưởng app dẫn sai.
 *
 * ⚠️ ĐẶT TRÊN CÙNG, VÀ KHÔNG ĐỔI THEO BỘ LỌC THỜI GIAN. Hai hàng ô số phía dưới
 *   đổi theo `?r=` (7 ngày / 30 ngày / …); khối này LUÔN là hôm nay. Vì đứng
 *   ngay dưới thanh chọn kỳ, nó PHẢI tự nói ra điều đó — nếu không, chủ tiệm bấm
 *   "90 ngày" rồi thấy khối này không đổi và tưởng màn bị treo.
 *
 * ⚠️ ĐOẠN TÓM TẮT CHỈ NÓI ĐIỀU ĐO ĐƯỢC. Không có câu nào kiểu "hôm nay tiệm
 *   khởi sắc". Mỗi vế đều gắn với một con số cụ thể, và vế nào không đủ dữ liệu
 *   thì BỎ HẲN chứ không viết cho đủ câu. Một dòng tóm tắt sai một lần là lần
 *   sau không ai đọc nữa.
 *
 * ⚠️ TIỀN VIẾT ĐẦY ĐỦ, KHÔNG RÚT GỌN "12,4 tr". Thẻ vẽ dạng rút gọn, nhưng ngay
 *   bên dưới cùng màn này còn hàng ô "TIỀN" viết đầy đủ. Cùng một loại số mà hai
 *   cách viết trên một màn thì người đọc phải tự quy đổi — đó là lỗi, không phải
 *   gọn gàng.
 */
export function HomNayPanel({ so, locale }: { so: SoLieuHomNay; locale: Locale }) {
  const t = useTranslations("soLieu");

  const tien = soSanh(so.tien_hom_nay, so.tien_hom_qua);
  const don = soSanh(so.don_hom_nay, so.don_hom_qua);
  const huy = soVoiThuongNgay(so.huy_hom_nay, so.huy_thuong_ngay);
  const mai = soVoiThuongNgay(so.hen_ngay_mai, so.hen_thuong_ngay);

  /** Câu mốc cho hai ô so với HÔM QUA. */
  const soVoiHomQua = (r: ReturnType<typeof soSanh>, coSoHomNay: boolean) => {
    if (r.pct !== null) {
      return r.chieu === "deu" ? t("nhuHomQua") : t("soVoiHomQua", { pct: r.pct });
    }
    // Hôm qua bằng 0 → không có phần trăm nào nói được, phải nói bằng lời.
    return coSoHomNay ? t("homQuaChuaCo") : t("caHaiChuaCo");
  };

  const soLe = (n: number) =>
    new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
      maximumFractionDigits: 1,
    }).format(n);

  /** Câu mốc cho hai ô so với MỨC THƯỜNG NGÀY. */
  const soVoiThuong = (n: number, moc: number, r: ReturnType<typeof soVoiThuongNgay>) => {
    if (moc <= 0) return n > 0 ? t("thuongNgayKhongCo") : t("chuaDuDuLieu");
    if (r.lan !== null) return t("gapLanThuongNgay", { lan: soLe(r.lan) });
    if (r.chieu === "deu") return t("nhuThuongNgay", { moc: soLe(moc) });
    return t("itHonThuongNgay", { moc: soLe(moc) });
  };

  // ── Đoạn tóm tắt ──────────────────────────────────────────────────
  const cau: string[] = [];
  if (so.don_hom_nay === 0) {
    cau.push(t("tomTatChuaCoDon"));
  } else {
    cau.push(
      t("tomTatCoDon", {
        tien: formatMoney(so.tien_hom_nay, locale),
        don: so.don_hom_nay,
      }),
    );
  }
  if (so.huy_hom_nay > 0) {
    cau.push(
      huy.lan !== null
        ? t("tomTatHuyGap", { n: so.huy_hom_nay, lan: soLe(huy.lan) })
        : t("tomTatHuy", { n: so.huy_hom_nay }),
    );
    // Chỉ có khi huỷ DỒN CỤC thật — chốt nằm ở CSDL (#345), không ở đây.
    if (so.huy_khung_gio) {
      cau.push(
        t("tomTatKhungGio", {
          tu: so.huy_khung_gio.tu_gio,
          den: so.huy_khung_gio.tu_gio + 2,
        }),
      );
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-semibold text-foreground">{t("homNay")}</h2>
        <p className="text-[11.5px] text-muted-foreground">{t("homNayKhongTheoLoc")}</p>
      </div>

      {/* ⚠️ BỐN Ô RỜI, KHÔNG PHẢI MỘT DẢI GỘP. Trước 22/08 đây là một khối
          viền duy nhất chia bằng đường kẻ 1px, nên nó đọc ra như một hàng bảng
          — trong khi bốn ô ngay dưới ("Tiền về trong kỳ") lại là bốn thẻ rời.
          Cùng một loại thông tin mà hai kiểu trình bày. Và số ở đây LÀ SỐ CẤP
          BÁCH HƠN (hôm nay, không đổi theo bộ lọc kỳ) nên càng không được trông
          nhẹ hơn. */}
      {/* ⚠️ BỐN CỘT TỪ 1024px, KHÔNG PHẢI 768px. Ở đúng khổ 768px thanh bên
          (240px, `hidden … md:flex`) vừa hiện ra CÙNG một điểm ngắt `md:` với
          lưới này, nên vùng nội dung chỉ còn ~481px: chia 4 cột (gap 12px) ra ô
          111px, trừ đệm `p-4` còn 78px lọt lòng — trong khi "17.327.118đ" ở
          16px cần 94px. Đo 22/08 ở 768px: scrollWidth 94 > clientWidth 78, số
          tiền TRÀN ra ngoài mép ô. Ở 900px ô lọt lòng 111px nên vừa — vì vậy
          CHỈ RIÊNG 768px vỡ, 900px và 1280px đều đạt.
          Chữa bằng BỐ CỤC (giữ 2 cột tới 1024px ⇒ ô ~202px lọt lòng), KHÔNG thu
          nhỏ chữ: 16px là mức sàn đọc được. Sửa xong cũng khớp luôn với hai hàng
          ô số ngay bên dưới, vốn đã dùng `lg:grid-cols-4`. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border bg-card">
          <TheSo
            nhan={t("nhanTien")}
            so={formatMoney(so.tien_hom_nay, locale)}
            soSanh={soVoiHomQua(tien, so.tien_hom_nay > 0)}
            chieu={tien.chieu}
          />
        </div>
        <div className="rounded-lg border bg-card">
          <TheSo
            nhan={t("nhanDon")}
            so={String(so.don_hom_nay)}
            soSanh={soVoiHomQua(don, so.don_hom_nay > 0)}
            chieu={don.chieu}
          />
        </div>
        <div className="rounded-lg border bg-card">
          <TheSo
            nhan={t("nhanHuy")}
            so={String(so.huy_hom_nay)}
            soSanh={soVoiThuong(so.huy_hom_nay, so.huy_thuong_ngay, huy)}
            chieu={huy.chieu}
            // Huỷ hẹn TĂNG là tin xấu — hướng tốt/xấu do nơi gọi quyết, không
            // suy từ dấu của con số.
            tangLaTot={false}
          />
        </div>
        <div className="rounded-lg border bg-card">
          <TheSo
            nhan={t("nhanMai")}
            so={String(so.hen_ngay_mai)}
            soSanh={soVoiThuong(so.hen_ngay_mai, so.hen_thuong_ngay, mai)}
            chieu={mai.chieu}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
          {t("tomTatNhan")}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed">{cau.join(" ")}</p>
      </div>
    </section>
  );
}
