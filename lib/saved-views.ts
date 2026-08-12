/** Bộ lọc lưu sẵn (24p) — kiểu dữ liệu + vốn từ ĐÓNG dùng chung cả server lẫn
 *  client. Hợp đồng: Quy hoạch mục 36.9A + 36.9F (QĐ-1, QĐ-4). */

/** Đổi nghĩa MỘT tham số cũ ⇒ tăng số này VÀ sửa lại SAVED_VIEW_VOCAB — cấm
 *  sửa tại chỗ mà giữ nguyên version (QĐ-4). Đồng bộ với hàm CSDL
 *  resolve_saved_view() (migration #69) — đổi một bên mà quên bên kia thì
 *  chip hiện đúng/sai KHÔNG khớp với lúc thật sự tác động ra ngoài. */
export const SAVED_VIEW_VOCAB_VERSION = 1;

export type SavedViewScreen = "contacts" | "deals";

/** Danh mục ĐÓNG — khớp nguyên văn bảng mục 36.9F. Gặp khoá ngoài đây thì
 *  chip/bộ lọc coi là "hỏng" (QĐ-4), không tự nới rộng. */
export const SAVED_VIEW_VOCAB: Record<SavedViewScreen, readonly string[]> = {
  contacts: ["q", "source", "tier", "sort", "tag", "inactive_days"],
  deals: ["q", "needs_action", "stage", "owner", "sort"],
};

export type SavedView = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  screen: SavedViewScreen;
  name: string;
  query: string;
  vocab_version: number;
  position: number;
};

/** QĐ-4 phía trình duyệt — kiểm TRƯỚC khi cho bấm, khớp đúng luật
 *  resolve_saved_view() làm phía CSDL (version sai HOẶC có khoá ngoài vốn từ
 *  màn tương ứng ⇒ hỏng). Không gọi RPC chỉ để biết chip có bấm được không —
 *  RPC dành cho lúc THẬT SỰ tác động ra ngoài (QĐ-1). */
export function isSavedViewStale(
  view: Pick<SavedView, "screen" | "query" | "vocab_version">,
): boolean {
  if (view.vocab_version !== SAVED_VIEW_VOCAB_VERSION) return true;
  const known = SAVED_VIEW_VOCAB[view.screen];
  const params = new URLSearchParams(view.query);
  for (const key of params.keys()) {
    if (!known.includes(key)) return true;
  }
  return false;
}

/** Chip đang được ÁP DỤNG khi mọi cặp khoá=giá-trị của nó khớp đúng URL hiện
 *  tại — tham số KHÁC (vd sort) không ảnh hưởng, cho phép kết hợp. */
export function isSavedViewActive(view: SavedView, current: URLSearchParams): boolean {
  const chipParams = new URLSearchParams(view.query);
  for (const [key, value] of chipParams) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

/** Trần chip hiện thẳng hàng — quá số này thì gom vào "…" (thẻ design
 *  man-bo-loc-luu-san.html: "trần 8 chip, quá thì gom vào …"). */
export const SAVED_VIEW_VISIBLE_CAP = 8;
