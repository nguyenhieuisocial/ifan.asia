"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { baoLoiLenMayChu } from "@/components/bao-loi-len-may-chu";
import { tuCuuKhiMatManhMa } from "@/lib/loi-mat-manh-ma";

/**
 * LƯỚI ĐỠ CHO PHẦN TRONG ỨNG DỤNG — giữ nguyên khung app khi một màn hỏng.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CẦN, TRONG KHI ĐÃ CÓ `app/error.tsx` Ở GỐC
 * ═══════════════════════════════════════════════════════════════════
 * Lưới đỡ ở gốc bắt lỗi CAO HƠN cả khung ứng dụng, nên một truy vấn hỏng ở màn
 * Lịch hay Đơn hàng làm biến mất TOÀN BỘ: cột trái, thanh dưới, tên tiệm, mọi
 * đường đi. Người dùng nhận một trang trắng có chữ xin lỗi và không còn cách
 * nào sang màn khác ngoài gõ lại địa chỉ.
 *
 * Đặt thêm một lưới ở đây thì lỗi chỉ nuốt PHẦN NỘI DUNG: cột trái và thanh
 * dưới còn nguyên, thợ bấm sang màn khác làm tiếp được ngay. Với một tiệm đang
 * có khách đứng chờ, khác biệt đó là khác biệt giữa "lỗi một màn" và "app hỏng".
 *
 * ⚠️ VẪN PHẢI BÁO LỖI LÊN MÁY CHỦ. Lưới đỡ càng êm thì lỗi càng dễ bị bỏ qua —
 *   người dùng bấm sang màn khác và không ai kể lại. Không báo thì ta đổi một
 *   lỗi ồn ào lấy một lỗi im lặng, và im lặng mới là thứ nằm lại nhiều tháng.
 */
export default function LoiTrongApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  /**
   * ⚠️ BÁO TRƯỚC RỒI MỚI TẢI LẠI — thứ tự này là bắt buộc. `baoLoiLenMayChu` gửi
   *   bằng `navigator.sendBeacon`, thứ trình duyệt cam kết gửi nốt kể cả khi
   *   trang đang đóng; nhưng nó phải kịp được XẾP HÀNG trước khi lệnh tải lại
   *   chạy. Đảo thứ tự là mất luôn tín hiệu duy nhất cho biết có người đang kẹt.
   */
  useEffect(() => {
    baoLoiLenMayChu(error);
    tuCuuKhiMatManhMa(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-semibold">{t("errorTitle")}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{t("errorBody")}</p>
      <Button variant="outline" onClick={reset} className="gap-1.5">
        <RotateCw className="size-4" />
        {t("retry")}
      </Button>
      {/* Nhắc rằng các màn khác VẪN DÙNG ĐƯỢC — nếu không, người dùng thấy một
          màn hỏng rồi kết luận cả app hỏng và đóng luôn. */}
      <p className="text-xs text-muted-foreground">{t("otherScreensStillWork")}</p>
    </div>
  );
}
