/**
 * ĐIỀU HƯỚNG KHU QUẢN TRỊ — KHAI ĐÚNG MỘT LẦN Ở ĐÂY.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO LÀ MỘT BẢNG DỮ LIỆU, KHÔNG PHẢI CHỮ GÕ THẲNG VÀO GIAO DIỆN
 * ═══════════════════════════════════════════════════════════════════
 * Luật giao diện **G10** (Quy hoạch mục 2b): *"Navigation là bảng dữ liệu, không
 * phải switch — menu/route/quyền-thấy định nghĩa 1 file, sidebar desktop +
 * bottom nav PWA + router đọc chung; hết cảnh menu và route lệch nhau."*
 * Cùng ý với **RULE 102** của founder (*Navigation ≠ Domain hierarchy*) và với
 * **luật D1** (mỗi địa chỉ khai một lần — nơi thứ hai luôn là nơi lỗi thời).
 *
 * ⚠️ Khung quản trị hiện ra ở BA khổ màn (điện thoại · iPad · máy tính) với ba
 *   cách bày khác nhau. Nếu mỗi khổ tự gõ lại danh sách thì có ba bản, và ba bản
 *   chắc chắn lệch nhau — đúng con bệnh D1 mô tả. Cả ba đọc từ đây.
 *
 * ⚠️ `nhanNgan` KHÔNG phải để cho đẹp. Đo 22/08 trên CSS thật của app: bày đủ ở
 *   khổ iPad dọc (768px) cần 701px với nhãn ngắn, nhưng cần 760px với nhãn
 *   "Nhật ký quản trị" — tức TRÀN. Rút gọn đúng một nhãn là đủ vừa, và không
 *   mất nghĩa vì người đọc đang đứng sẵn trong khu quản trị.
 *   Thẻ thiết kế: `design-system/man-quan-tri-khung.html`.
 */

export type MucQuanTri = {
  /** Khoá ổn định, dùng làm React key và làm mã trong phép đo. Không đổi. */
  khoa: string;
  duong: string;
  /** Khoá chữ, tính từ gốc `admin.` — bộ dịch của khu quản trị. */
  nhan: string;
  /** Nhãn rút gọn cho khổ 768–1023px. Không khai thì dùng `nhan`. */
  nhanNgan?: string;
};

export const MUC_QUAN_TRI: readonly MucQuanTri[] = [
  // "Tổng quan" thêm 22/08: trước đó khu quản trị KHÔNG có lối nào quay về trang
  // chủ của chính nó — dấu hiệu thương hiệu là thẻ chữ, không phải liên kết, nên
  // từ màn Nhật ký muốn về Toàn cảnh chỉ còn nút Back của trình duyệt.
  { khoa: "tong-quan", duong: "/admin", nhan: "khung.tongQuan" },
  { khoa: "nguoi-dung", duong: "/admin/nguoi-dung", nhan: "users.navLabel" },
  { khoa: "thu-nghiem", duong: "/admin/thu-nghiem", nhan: "abtest.navLabel" },
  { khoa: "khach-vao", duong: "/admin/khach-vao", nhan: "funnel.navLabel" },
  { khoa: "cong-tac", duong: "/admin/cong-tac", nhan: "flags.navLabel" },
  {
    khoa: "nhat-ky",
    duong: "/admin/nhat-ky",
    nhan: "auditLog.navLabel",
    nhanNgan: "khung.nhatKyNgan",
  },
] as const;

/**
 * Mục nào đang mở. `/admin` chỉ khớp khi đứng ĐÚNG ở đó — nếu so bằng
 * `startsWith` thì "Tổng quan" sáng đèn ở cả năm màn con.
 */
export function mucDangMo(duongDan: string): string | null {
  const khop = MUC_QUAN_TRI.filter(
    (m) => duongDan === m.duong || (m.duong !== "/admin" && duongDan.startsWith(m.duong + "/")),
  );
  // Lấy đường dài nhất: `/admin/nhat-ky` thắng `/admin` khi cả hai cùng khớp.
  return khop.sort((a, b) => b.duong.length - a.duong.length)[0]?.khoa ?? null;
}
