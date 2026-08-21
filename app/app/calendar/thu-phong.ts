"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * THU PHÓNG LƯỚI GIỜ bằng cuộn (máy tính) và chụm hai ngón (điện thoại).
 *
 * ═══════════════════════════════════════════════════════════════════
 * BA LUẬT KHÔNG ĐƯỢC PHÁ
 * ═══════════════════════════════════════════════════════════════════
 * 1. CUỘN THƯỜNG VẪN LÀ CUỘN. Bắt cuộn trơn = thu phóng là cướp mất cách duy
 *    nhất để đi từ 8 giờ sáng xuống 8 giờ tối. Phải giữ Ctrl (hoặc ⌘ trên Mac)
 *    mới tính là thu phóng.
 * 2. MỘT NGÓN VẪN LÀ CUỘN. Chỉ khi có ĐÚNG HAI ngón mới tính là chụm. Nhận
 *    nhầm một ngón thành thu phóng là lỗi khó chịu nhất trên điện thoại.
 * 3. KHÔNG BỎ NÚT +/−. Thợ đeo găng, tay ướt, hoặc màn cảm ứng quầy kém nhạy
 *    thì chụm không ăn — lúc đó nút là đường duy nhất.
 *
 * ⚠️ Phải gắn bằng `addEventListener` với `{ passive: false }`, KHÔNG dùng
 *   `onWheel` của React. React gắn sự kiện cuộn ở dạng "thụ động" nên gọi
 *   `preventDefault()` không có tác dụng: trình duyệt vẫn cuộn trang trong lúc
 *   ta phóng to, và màn nhảy loạn.
 */

/** Chụm/xoè vượt tỷ lệ này mới đổi một mức — thấp hơn thì rung tay cũng đổi. */
const NGUONG_CHUM = 1.22;

export function useThuPhongLuoi(
  khungRef: RefObject<HTMLElement | null>,
  doiMuc: (buoc: 1 | -1) => void,
) {
  useEffect(() => {
    const el = khungRef.current;
    if (!el) return;

    // ── Máy tính: Ctrl/⌘ + cuộn ──────────────────────────────────────
    const cuon = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // cuộn thường: để yên cho nó cuộn
      e.preventDefault();
      doiMuc(e.deltaY < 0 ? 1 : -1);
    };

    // ── Điện thoại: chụm hai ngón ────────────────────────────────────
    let khoangDau: number | null = null;
    const khoangHaiNgon = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const chamXuong = (e: TouchEvent) => {
      khoangDau = e.touches.length === 2 ? khoangHaiNgon(e.touches) : null;
    };
    const chamDi = (e: TouchEvent) => {
      if (e.touches.length !== 2 || khoangDau === null) return;
      e.preventDefault();
      const nay = khoangHaiNgon(e.touches);
      const ty = nay / khoangDau;
      if (ty > NGUONG_CHUM) {
        doiMuc(1);
        khoangDau = nay;
      } else if (ty < 1 / NGUONG_CHUM) {
        doiMuc(-1);
        khoangDau = nay;
      }
    };
    const chamLen = () => {
      khoangDau = null;
    };

    el.addEventListener("wheel", cuon, { passive: false });
    el.addEventListener("touchstart", chamXuong, { passive: true });
    el.addEventListener("touchmove", chamDi, { passive: false });
    el.addEventListener("touchend", chamLen, { passive: true });
    el.addEventListener("touchcancel", chamLen, { passive: true });
    return () => {
      el.removeEventListener("wheel", cuon);
      el.removeEventListener("touchstart", chamXuong);
      el.removeEventListener("touchmove", chamDi);
      el.removeEventListener("touchend", chamLen);
      el.removeEventListener("touchcancel", chamLen);
    };
  }, [khungRef, doiMuc]);
}
