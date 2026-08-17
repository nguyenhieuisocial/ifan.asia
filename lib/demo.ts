/**
 * Tài khoản XEM THỬ công khai — dùng cho nút "Xem demo nhanh" ở màn đăng nhập.
 *
 * Vì sao là tài khoản RIÊNG chứ không dùng tài khoản demo cũ:
 * tài khoản demo cũ (`demo.ifan.2026@gmail.com`) là CHỦ TIỆM của tiệm mẫu.
 * Nút này công khai cho mọi khách ghé web, nên nếu dùng tài khoản chủ thì
 * người lạ xoá sạch được đơn hàng/khách/sổ quỹ của tiệm mẫu, và tệ hơn là
 * đổi luôn mật khẩu — nút demo chết vĩnh viễn (mật khẩu đang in ngay dưới nút).
 *
 * Tài khoản này KHÔNG thuộc tiệm nào. Bấm nút thì `signInDemo()` đăng nhập rồi
 * gọi đúng cơ chế tham quan tiệm mẫu đã có (`enter_sample_tenant`), cơ chế đó
 * tự gắn vai `viewer` — vai này bị RLS chặn ghi ở TẦNG CSDL, không phải ẩn nút
 * cho đẹp. Khách xem được mọi màn với dữ liệu thật nhưng không sửa được gì.
 *
 * Email/mật khẩu ở đây là CÔNG KHAI CÓ CHỦ Ý (hiện thẳng dưới nút cho ai muốn
 * tự gõ) — không phải bí mật bị lộ. Đừng dùng file này cho bất kỳ khoá thật nào.
 */
export const DEMO_VIEWER_EMAIL = "xem.demo.ifan.2026@gmail.com";
export const DEMO_VIEWER_PASSWORD = "XemDemoIfan#2026";

/** Ngành của tiệm mẫu mà nút demo mở ra (Spa Hương Sen — tiệm mẫu giàu dữ liệu nhất). */
export const DEMO_TOUR_INDUSTRY = "spa";
