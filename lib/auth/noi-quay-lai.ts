/**
 * Lọc tham số `next` — chỗ quay lại sau khi đăng nhập.
 *
 * ⚠️ FILE NÀY KHÔNG ĐƯỢC `import "server-only"`. Phép lọc phải chạy ở CẢ HAI
 *   phía: server action đọc ô ẩn trong form, còn nút vân tay chạy ở trình duyệt
 *   và tự `router.replace(...)`. Cùng lý do đã tách `lib/catalog/tai-san-chung.ts`.
 *
 * ⚠️ VÌ SAO PHẢI LỌC: nhận thẳng chuỗi từ URL rồi chuyển hướng là lỗ "chuyển
 *   hướng mở" — kẻ xấu gửi link `/login?next=//trang-gia.example`, người dùng
 *   đăng nhập xong bị ném sang trang giả giống hệt và gõ lại mật khẩu ở đó.
 *   Chỉ nhận đúng ba nhánh kín mà proxy có thể đá về /login; mọi thứ khác —
 *   `//máy-khác`, `http://…`, `\máy-khác`, đường dẫn công khai — rơi về nhà.
 *
 * ⚠️ LỌC HAI LẦN LÀ CỐ Ý, không phải thừa: trang /login lọc lúc đọc URL, server
 *   action lọc lại lúc nhận form. Ô ẩn nào cũng sửa được từ trình duyệt.
 */
export const NHA_SAU_DANG_NHAP = "/app/today";

export function noiQuayLai(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512)
    return NHA_SAU_DANG_NHAP;
  if (!/^\/(app|onboarding|admin)(\/|\?|$)/.test(raw)) return NHA_SAU_DANG_NHAP;
  return raw;
}
