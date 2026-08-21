"use client";

import { useSyncExternalStore } from "react";

/**
 * Máy này có làm được vân tay / Face ID không.
 *
 * ┌─ VÌ SAO KHÔNG ĐỌC THẲNG `window` TRONG LÚC DỰNG GIAO DIỆN ────────
 * Máy chủ dựng trước, trình duyệt dựng lại sau. Máy chủ không có `window` nên
 * nó kết luận "không có", trình duyệt lại kết luận "có" — hai bản khác nhau,
 * React coi đó là lỗi và DỰNG LẠI CẢ CỤM. Đo thật ngày 21/08: cả form đăng
 * nhập bị dựng lại, cú bấm đang dở bị mất.
 *
 * ⚠️ Đây là lỗi CHỈ HIỆN KHI CHẠY THẬT. Biên dịch xanh, dựng bản xanh, đọc code
 *   thấy hợp lý. Không mở trình duyệt ra bấm thì không bao giờ thấy.
 *
 * `useSyncExternalStore` sinh ra đúng cho việc này: nó nhận RIÊNG một ảnh chụp
 * dành cho máy chủ, nên hai bên khớp nhau ở lần dựng đầu, rồi trình duyệt mới
 * cập nhật sang giá trị thật.
 */
const khongDoi = () => () => {};
const oMayNguoiDung = () =>
  typeof window.PublicKeyCredential !== "undefined" &&
  typeof navigator.credentials?.get === "function";
/** Ảnh chụp phía máy chủ: chưa biết thì coi như KHÔNG có — thà ẩn còn hơn bày
 *  một nút bấm vào chỉ báo lỗi. */
const oMayChu = () => false;

export function useCoVanTay(): boolean {
  return useSyncExternalStore(khongDoi, oMayNguoiDung, oMayChu);
}
