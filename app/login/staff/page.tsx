import { redirect } from "next/navigation";

/**
 * /login/staff — GIỮ đường dẫn, BỎ màn riêng (chỉ đạo founder 11/08).
 *
 * Từ nay chỉ còn một cửa đăng nhập: /login nhận cả email lẫn SĐT, không hỏi
 * mã tiệm. Route này ở lại vì chủ tiệm có thể đã đưa link cũ cho nhân viên
 * (và nó từng nằm trong hướng dẫn ở màn Đội ngũ) — chuyển thẳng sang /login
 * còn hơn để họ gặp trang 404.
 */
export default function StaffLoginPage() {
  redirect("/login");
}
