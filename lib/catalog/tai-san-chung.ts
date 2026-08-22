/**
 * PHẦN DÙNG CHUNG CỦA TÀI SẢN — kiểu dữ liệu, bộ giá trị, phép tính thuần.
 *
 * ⚠️ FILE NÀY KHÔNG ĐƯỢC `import "server-only"`. Đó chính là lý do nó tồn tại
 *   tách khỏi `lib/catalog/tai-san.ts`.
 *
 *   Màn tài sản chạy ở TRÌNH DUYỆT và cần ba thứ: danh sách tình trạng để đổ
 *   vào ô chọn, kiểu dữ liệu, và phép đếm ngày bảo hành. Nếu ba thứ đó nằm
 *   chung file với các hàm truy vấn (vốn phải có `server-only`), thì cả kho
 *   **không dựng được** — Next chặn ngay:
 *     "'server-only' cannot be imported from a Client Component module".
 *
 * ⚠️ TYPESCRIPT KHÔNG BẮT ĐƯỢC LỖI NÀY. `npx tsc --noEmit` xanh hoàn toàn; chỉ
 *   máy chủ phát triển mới la lên. Cùng họ với lỗi "truyền một HÀM từ thành
 *   phần máy chủ sang thành phần trình duyệt" đã làm sập màn Tổng quan hôm
 *   22/08, và cùng cách chữa: TÁCH PHẦN THUẦN RA MỘT FILE RIÊNG.
 */

export const TINH_TRANG_TAI_SAN = [
  "dung_duoc",
  "dang_sua",
  "hong",
  "da_thanh_ly",
] as const;
export type TinhTrangTaiSan = (typeof TINH_TRANG_TAI_SAN)[number];

export type BanGiao = {
  id: string;
  employeeId: string | null;
  nguoiGiu: string | null;
  boPhan: string | null;
  giaoLuc: string;
  xacNhanLuc: string | null;
  thuHoiLuc: string | null;
  ghiChu: string | null;
};

export type TaiSan = {
  id: string;
  ma: string | null;
  ten: string;
  loai: string | null;
  viTri: string | null;
  ngayMua: string | null;
  giaMuaVnd: number | null;
  baoHanhDen: string | null;
  anh: string | null;
  ghiChu: string | null;
  tinhTrang: TinhTrangTaiSan;
  /** Lượt bàn giao CÒN MỞ. null = chưa giao cho ai. */
  dangGiao: BanGiao | null;
};

/**
 * Bao nhiêu ngày nữa hết bảo hành. Âm = đã hết. null = không khai bảo hành.
 *
 * ⚠️ Nhận NGÀY VIỆT NAM từ nơi gọi, không tự lấy `new Date()`. Máy chủ chạy giờ
 *   UTC, nên từ 0h tới 7h sáng giờ Việt Nam nó vẫn tưởng là hôm qua và mọi phép
 *   đếm lệch một ngày — cùng cái bẫy đã ghi ở `public.ngay_vn()`.
 */
export function conBaoNhieuNgayBaoHanh(
  baoHanhDen: string | null,
  homNayVn: string,
): number | null {
  if (!baoHanhDen) return null;
  const a = Date.parse(`${baoHanhDen}T00:00:00Z`);
  const b = Date.parse(`${homNayVn}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}
