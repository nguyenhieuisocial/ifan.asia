"use client";

import { useEffect } from "react";

/**
 * PHÍM TẮT của màn Lịch — theo đúng bộ của Google Lịch, để ai đã quen thì
 * không phải học lại.
 *
 * ⚠️ KHÔNG bắt phím khi con trỏ đang ở trong một ô nhập. Gõ chữ "c" vào ô tìm
 *   mà màn nhảy sang hộp tạo lịch là lỗi khiến người ta bỏ hẳn bàn phím. Kiểm
 *   cả `contentEditable` chứ không chỉ input/textarea.
 *
 * ⚠️ Cũng KHÔNG bắt khi đang giữ Ctrl/Cmd/Alt: `Ctrl+D` là đánh dấu trang của
 *   trình duyệt, cướp nó là cướp một thứ không thuộc về mình.
 */
export type PhimTatXuLy = {
  doiCheDo: (v: "ngay" | "tho" | "tuan" | "thang" | "ds") => void;
  homNay: () => void;
  toi: () => void;
  lui: () => void;
  toiNgay: () => void;
  oTim: () => void;
  taoMoi: () => void;
  suaCaDangChon: () => void;
  hoanTac: () => void;
  moBangPhim: () => void;
  dong: () => void;
};

/** Đang gõ chữ ở đâu đó thì mọi phím tắt phải im. */
function dangGoChu(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const ten = el.tagName;
  return ten === "INPUT" || ten === "TEXTAREA" || ten === "SELECT";
}

export function usePhimTat(xuLy: PhimTatXuLy, batDauBat: boolean) {
  useEffect(() => {
    if (!batDauBat) return;

    const nghe = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Esc vẫn phải chạy khi đang gõ — đó là cách thoát khỏi ô tìm.
      if (e.key === "Escape") {
        xuLy.dong();
        return;
      }
      if (dangGoChu(e.target)) return;

      const k = e.key;
      const chay = (f: () => void) => {
        e.preventDefault();
        f();
      };

      switch (k) {
        // ── Đổi chế độ xem ──────────────────────────────────────────
        case "d":
        case "1":
          return chay(() => xuLy.doiCheDo("ngay"));
        case "s":
        case "2":
          // Google dùng phím này cho Cài đặt; ở đây không có trang cài đặt
          // riêng cho màn Lịch, nên dành cho "theo người" (staff).
          return chay(() => xuLy.doiCheDo("tho"));
        case "w":
        case "3":
          return chay(() => xuLy.doiCheDo("tuan"));
        case "m":
        case "4":
          return chay(() => xuLy.doiCheDo("thang"));
        case "a":
        case "5":
          return chay(() => xuLy.doiCheDo("ds"));

        // ── Đi lại ──────────────────────────────────────────────────
        case "t":
          return chay(xuLy.homNay);
        case "j":
        case "n":
          return chay(xuLy.toi);
        case "k":
        case "p":
          return chay(xuLy.lui);
        case "g":
          return chay(xuLy.toiNgay);
        case "/":
          return chay(xuLy.oTim);

        // ── Việc ────────────────────────────────────────────────────
        case "c":
          return chay(xuLy.taoMoi);
        case "e":
          return chay(xuLy.suaCaDangChon);
        case "z":
          return chay(xuLy.hoanTac);
        case "?":
          return chay(xuLy.moBangPhim);
        default:
          return;
      }
    };

    window.addEventListener("keydown", nghe);
    return () => window.removeEventListener("keydown", nghe);
  }, [xuLy, batDauBat]);
}

/** Bảng liệt kê phím tắt — hiện khi bấm `?`. Không có nó thì phím tắt chỉ người viết code biết. */
export const BANG_PHIM: { nhom: string; phim: string; viec: string }[] = [
  { nhom: "xem", phim: "d · 1", viec: "Ngày" },
  { nhom: "xem", phim: "s · 2", viec: "Theo người" },
  { nhom: "xem", phim: "w · 3", viec: "Tuần" },
  { nhom: "xem", phim: "m · 4", viec: "Tháng" },
  { nhom: "xem", phim: "a · 5", viec: "Danh sách" },
  { nhom: "diLai", phim: "t", viec: "Về hôm nay" },
  { nhom: "diLai", phim: "j · n", viec: "Tiến tới" },
  { nhom: "diLai", phim: "k · p", viec: "Lùi lại" },
  { nhom: "diLai", phim: "g", viec: "Tới một ngày cụ thể" },
  { nhom: "diLai", phim: "/", viec: "Nhảy vào ô tìm" },
  { nhom: "viec", phim: "c", viec: "Thêm lịch mới" },
  { nhom: "viec", phim: "e", viec: "Sửa ca đang mở" },
  { nhom: "viec", phim: "z", viec: "Hoàn tác lần dời giờ gần nhất" },
  { nhom: "viec", phim: "?", viec: "Mở bảng này" },
  { nhom: "viec", phim: "Esc", viec: "Đóng bảng đang mở" },
];
