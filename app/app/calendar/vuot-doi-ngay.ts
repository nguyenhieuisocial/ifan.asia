"use client";

import { useEffect } from "react";

/**
 * VUỐT NGANG ĐỂ ĐỔI NGÀY ở màn Lịch (thẻ design `man-thao-tac-kieu-app.html`).
 *
 * Vuốt sang TRÁI = ngày sau. Vuốt sang PHẢI = ngày trước. Đúng thứ tự lịch trên
 * giấy, và đúng hai phím tắt `j`/`k` đã có trên máy tính — cùng một việc, hai
 * cách gọi, không phải hai luật khác nhau.
 *
 * ⚠️ VUỐT NGANG MỚI TÍNH; VUỐT XIÊN THÌ BỎ QUA. Ngón tay không bao giờ đi thẳng
 *   tuyệt đối. Nếu không đòi phần ngang RÕ RÀNG lớn hơn phần dọc thì người ta
 *   cuộn lưới giờ cũng vô tình nhảy sang ngày khác — và họ sẽ không hiểu vì sao
 *   lịch cứ tự đổi.
 *
 * ⚠️ ĐANG MỞ HỘP THOẠI THÌ TẮT. Đang điền form đặt lịch mà nền sau lưng đổi
 *   ngày là lưu nhầm ngày.
 *
 * ⚠️ HAI NGÓN TRỞ LÊN THÌ BỎ QUA — đó là thao tác thu phóng của `useThuPhongLuoi`,
 *   không phải vuốt. Hai bộ nghe cùng sống trên một lưới nên phải nhường nhau
 *   rõ ràng, không để cả hai cùng phản ứng.
 */

/** Phải đi ngang ít nhất ngần này (px) mới tính là một cú vuốt. */
const NGUONG_NGANG = 60;
/** Phần ngang phải lớn hơn phần dọc ngần này lần. */
const NGANG_HON_DOC = 1.6;
/** Vuốt lâu hơn ngần này (ms) là đang kéo chậm, không phải vuốt — bỏ qua. */
const LAU_NHAT = 700;

export function useVuotDoiNgay(
  ref: React.RefObject<HTMLElement | null>,
  xuLy: { toi: () => void; lui: () => void },
  bat: boolean,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !bat) return;

    let dau: { x: number; y: number; luc: number } | null = null;

    const batDau = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        dau = null;
        return;
      }
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      dau = { x: e.touches[0].clientX, y: e.touches[0].clientY, luc: Date.now() };
    };

    const doi = (e: TouchEvent) => {
      // Ngón thứ hai chạm vào giữa chừng ⇒ đây là thu phóng, huỷ cú vuốt.
      if (e.touches.length > 1) dau = null;
    };

    const ketThuc = (e: TouchEvent) => {
      const d = dau;
      dau = null;
      if (!d) return;
      if (Date.now() - d.luc > LAU_NHAT) return;
      const c = e.changedTouches[0];
      if (!c) return;
      const dx = c.clientX - d.x;
      const dy = Math.abs(c.clientY - d.y);
      if (Math.abs(dx) < NGUONG_NGANG) return;
      if (Math.abs(dx) < dy * NGANG_HON_DOC) return;
      if (dx < 0) xuLy.toi();
      else xuLy.lui();
    };

    el.addEventListener("touchstart", batDau, { passive: true });
    el.addEventListener("touchmove", doi, { passive: true });
    el.addEventListener("touchend", ketThuc, { passive: true });
    el.addEventListener("touchcancel", () => (dau = null), { passive: true });
    return () => {
      el.removeEventListener("touchstart", batDau);
      el.removeEventListener("touchmove", doi);
      el.removeEventListener("touchend", ketThuc);
    };
  }, [ref, xuLy, bat]);
}
