"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Ô NHẬP TIỀN CÓ DẤU CHẤM NGAY KHI ĐANG GÕ (thẻ `man-nhap-don-kieu-chung-tu`).
 *
 * ⚠️ VÌ SAO ĐÁNG LÀM. Ô cũ hiện `350000`. Đó là chỗ sinh ra lỗi nhầm 10 lần:
 *   `350000` và `3500000` khác nhau đúng một ký tự và nhìn gần như nhau. Có dấu
 *   chấm thì `350.000` và `3.500.000` khác nhau ngay từ độ dài — mắt bắt được
 *   mà không phải đếm số 0.
 *
 * ⚠️ GIỮ CON TRỎ THEO SỐ CHỮ SỐ BÊN PHẢI, KHÔNG THEO CHỈ SỐ KÝ TỰ. Đây là chỗ
 *   duy nhất khó của ô này, và làm sai thì người dùng ghét nó hơn cả ô không
 *   định dạng: gõ thêm một chữ số ở giữa `1.500.000` làm chuỗi dài thêm một dấu
 *   chấm, nên nếu đặt lại con trỏ theo vị trí cũ thì nó lùi một ô mỗi lần.
 *   Đếm chữ số CÒN LẠI BÊN PHẢI con trỏ thì con số đó không đổi khi thêm dấu
 *   chấm, nên đặt lại đúng chỗ.
 */

const chiSo = (s: string) => s.replace(/\D/g, "");

/** `1500000` → `1.500.000`. Dùng dấu chấm kiểu Việt Nam, không dùng Intl để
 *  khỏi phụ thuộc ngôn ngữ đang chọn — đây là ô NHẬP, không phải chỗ hiển thị. */
function chamNghin(so: string): string {
  return so.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function OTien({
  value,
  onChange,
  className,
  ...rest
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const oRef = useRef<HTMLInputElement>(null);

  return (
    <input
      {...rest}
      ref={oRef}
      // `inputMode="numeric"` mở bàn phím số trên điện thoại. KHÔNG dùng
      // `type="number"`: nó cấm dấu chấm, và trên vài trình duyệt còn tự thêm
      // nút tăng/giảm chiếm chỗ trong một ô vốn đã hẹp.
      inputMode="numeric"
      value={value === 0 ? "" : chamNghin(String(value))}
      placeholder="0"
      onChange={(e) => {
        const o = e.currentTarget;
        const truoc = o.value;
        const viTri = o.selectionStart ?? truoc.length;
        // Số chữ số nằm BÊN PHẢI con trỏ — thứ không đổi khi chuỗi được chấm lại.
        const soPhai = chiSo(truoc.slice(viTri)).length;

        const so = chiSo(truoc).slice(0, 12);
        onChange(so === "" ? 0 : Number(so));

        // Đặt lại con trỏ sau khi React vẽ xong giá trị mới.
        requestAnimationFrame(() => {
          const el = oRef.current;
          if (!el) return;
          const sau = el.value;
          let dem = 0;
          let i = sau.length;
          while (i > 0 && dem < soPhai) {
            i -= 1;
            if (/\d/.test(sau[i])) dem += 1;
          }
          el.setSelectionRange(i, i);
        });
      }}
      className={cn(
        "h-8 w-full rounded-md border border-input bg-background px-2 text-right text-[13px] tabular-nums",
        "focus-visible:ring-ring/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:outline-none",
        "max-md:h-10",
        className,
      )}
    />
  );
}
