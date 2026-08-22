"use client";

import { useEffect, useRef } from "react";
import { Printer, X } from "lucide-react";

/**
 * Thanh công cụ của trang in + tự mở hộp thoại in một lần khi trang mở.
 *
 * ⚠️ CHỈ GỌI MỘT LẦN. `window.print()` khoá luồng chính cho tới khi người dùng
 *   bấm In hoặc Huỷ; React 18 ở chế độ Strict chạy effect HAI lần trong lúc
 *   phát triển, nên không chốt cờ thì hộp thoại thứ hai bật ngay sau khi đóng
 *   hộp thứ nhất và trông như treo máy.
 *
 * Thanh này có `print:hidden` — nó không được lọt vào tờ giấy.
 *
 * ⚠️ CHỮ TRUYỀN XUỐNG BẰNG PROP, không gọi `useTranslations`. Trang này nằm
 *   ngoài `/app` nên khung gốc chỉ nạp cho client bộ chữ CÔNG KHAI
 *   (`locNhanhCongKhai`) — `orders.*` không có trong đó, và hai cái nút in ra
 *   nguyên chuỗi khoá `orders.print.printAgain`. Đã đo thấy trên trình duyệt.
 *   Nới bộ chữ công khai chỉ vì hai cái nút là bắt MỌI trang công khai tải
 *   thêm cả nhánh đơn hàng.
 */
export function ThanhIn({ chuIn, chuDong }: { chuIn: string; chuDong: string }) {
  const daIn = useRef(false);

  useEffect(() => {
    if (daIn.current) return;
    daIn.current = true;
    // Chờ một nhịp cho phông và ảnh logo vẽ xong — in trước khi phông về thì
    // tờ giấy ra bằng phông dự phòng, chữ có dấu tiếng Việt dựng xấu.
    const h = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(h);
  }, []);

  return (
    <div className="mx-auto mb-4 flex max-w-[80mm] items-center justify-between gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground"
      >
        <Printer className="size-4" />
        {chuIn}
      </button>
      <button
        type="button"
        onClick={() => window.close()}
        className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px]"
      >
        <X className="size-4" />
        {chuDong}
      </button>
    </div>
  );
}
