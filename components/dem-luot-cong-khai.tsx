"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * ĐẾM LƯỢT Ở TRANG CÔNG KHAI (#333, thẻ `man-quan-tri-phieu-khach-vao`).
 *
 * Gửi đúng hai loại việc: XEM một trang, và BẤM nút Đăng ký. Không gửi gì khác,
 * không nhận gì về.
 *
 * ⚠️ KHÔNG LƯU GÌ VỀ NGƯỜI XEM — không bánh quy, không dấu vết máy, không mã
 *   nhận dạng nào cả. Máy chủ chỉ cộng 1 vào một ô đếm theo NGÀY và TRANG.
 *   Đây không phải "đã ẩn danh" mà là "không có gì để ẩn".
 *
 * ⚠️ CHỈ ĐẶT Ở KHUNG TRANG CÔNG KHAI. Đường dẫn trong khu đã đăng nhập chứa mã
 *   đơn, mã khách, từ khoá tìm — gửi nguyên đường dẫn ở đó là lặng lẽ dựng một
 *   bản sao dữ liệu khách hàng trong bảng đếm. Khu đó đã có sổ riêng theo tiệm
 *   (`DemLuotDung`), và hai sổ đo hai câu hỏi khác nhau.
 *
 * ⚠️ MỘT LẦN CHO MỖI TRANG, không phải mỗi lần dựng lại giao diện.
 *
 * ⚠️ `sendBeacon` — người ta hay bấm đi ngay sau khi trang hiện ra, và một lời
 *   `fetch` thường sẽ bị huỷ giữa chừng.
 */

/** Danh sách trang ĐÓNG — khớp đúng chốt ở `/api/luot` và ở CSDL (#333). */
const TRANG_CO_DINH = new Set([
  "/", "/bang-gia", "/tinh-nang", "/lo-trinh", "/login",
  "/signup", "/forgot-password", "/privacy", "/terms",
]);
const TRANG_NGANH = /^\/nganh\/[a-z]{2,12}$/;

function guiLuot(duongDan: string, loai: "xem" | "bam-dang-ky"): void {
  try {
    if (!TRANG_CO_DINH.has(duongDan) && !TRANG_NGANH.test(duongDan)) return;
    const than = JSON.stringify({ duongDan, loai });
    navigator.sendBeacon?.("/api/luot", new Blob([than], { type: "application/json" }));
  } catch {
    /* đếm hỏng thì thôi — không được làm phiền người dùng */
  }
}

export function DemLuotCongKhai() {
  const duong = usePathname();
  const daGui = useRef<string | null>(null);

  useEffect(() => {
    if (!duong || daGui.current === duong) return;
    daGui.current = duong;
    guiLuot(duong, "xem");
  }, [duong]);

  /**
   * BẮT CÚ BẤM "ĐĂNG KÝ" BẰNG MỘT NGƯỜI NGHE CHUNG Ở GỐC TRANG.
   *
   * Cách kia là đi gắn tay vào từng nút Đăng ký — hiện có 7 nút rải khắp trang
   * chủ, bảng giá, tính năng, lộ trình, và mỗi lần thêm nút mới là một lần có
   * thể quên. Quên thì con số tụt xuống một cách im lặng, và không ai nhận ra
   * vì nó vẫn có số.
   *
   * ⚠️ Nghe ở pha BẮT (capture) và KHÔNG chặn gì: người dùng bấm là phải đi
   *   ngay, việc đếm không được xen vào giữa.
   */
  useEffect(() => {
    const nghe = (e: MouseEvent) => {
      const dich = e.target;
      if (!(dich instanceof Element)) return;
      const a = dich.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      // Chỉ tính link DẪN TỚI màn đăng ký. Không dựa vào chữ trên nút: chữ đổi
      // theo ngôn ngữ và theo từng trang, còn đường dẫn thì không.
      if (href !== "/signup" && !href.startsWith("/signup?")) return;
      guiLuot(window.location.pathname, "bam-dang-ky");
    };
    document.addEventListener("click", nghe, { capture: true, passive: true });
    return () => document.removeEventListener("click", nghe, { capture: true });
  }, []);

  return null;
}
