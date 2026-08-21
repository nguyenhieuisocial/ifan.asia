"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * ĐẾM LƯỢT MỞ MÀN.
 *
 * ⚠️ GỬI KHOÁ MÀN, KHÔNG GỬI ĐƯỜNG DẪN ĐẦY ĐỦ. Đường dẫn chứa mã đơn, mã khách,
 *   từ khoá tìm — tức là DỮ LIỆU, không phải tên màn. Gửi nguyên đường dẫn là
 *   lặng lẽ dựng một bản sao dữ liệu khách hàng trong bảng đếm.
 *
 * ⚠️ MỘT LẦN CHO MỖI MÀN, không phải mỗi lần dựng lại giao diện. React dựng
 *   lại thành phần rất nhiều lần cho cùng một màn; đếm theo lượt dựng thì con
 *   số phồng lên vô nghĩa và không so sánh được giữa các màn.
 *
 * ⚠️ `sendBeacon` — người dùng hay rời màn ngay sau khi mở, và một lời `fetch`
 *   thường sẽ bị huỷ giữa chừng.
 */
export function DemLuotDung() {
  const duong = usePathname();
  const daGui = useRef<string | null>(null);

  useEffect(() => {
    if (!duong || daGui.current === duong) return;
    daGui.current = duong;
    try {
      // `/app/orders/123` → `orders`. Đoạn thứ hai là tên màn; mọi đoạn sau nó
      // là dữ liệu và bị bỏ đi.
      const doan = duong.split("/").filter(Boolean);
      if (doan[0] !== "app") return;
      const man = doan[1] ?? "today";
      const than = JSON.stringify({
        man,
        muiGio: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
      });
      navigator.sendBeacon?.("/api/dung", new Blob([than], { type: "application/json" }));
    } catch {
      /* đếm hỏng thì thôi — không được làm phiền người dùng */
    }
  }, [duong]);

  return null;
}
