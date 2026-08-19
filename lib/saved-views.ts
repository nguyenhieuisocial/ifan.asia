/** Bộ lọc lưu sẵn (24p) — kiểu dữ liệu + vốn từ ĐÓNG dùng chung cả server lẫn
 *  client. Hợp đồng: Quy hoạch mục 36.9A + 36.9F (QĐ-1, QĐ-4). */

/** Đổi nghĩa MỘT tham số cũ, HOẶC thêm tham số mới ⇒ tăng số này VÀ sửa lại
 *  SAVED_VIEW_VOCAB — cấm sửa tại chỗ mà giữ nguyên version (QĐ-4).
 *
 *  ⚠️ 19/08: luật này TỪNG được viết hai lần — file này và hàm CSDL
 *  `resolve_saved_view()` (#69, nâng lên 2 ở #75). Không đường nào gọi hàm
 *  CSDL đó (đo được: 0 lời gọi ở app/lib/components, 0 hàm/view khác dùng),
 *  nên nó đã bị bỏ ở #193. **File này nay là nơi DUY NHẤT khai luật.** Đừng
 *  dựng lại bản thứ hai phía CSDL: sửa một bên quên bên kia thì chip hiện
 *  đúng/sai không khớp với lúc thật sự tác động ra ngoài.
 *  v1 → v2 (12/08, task #80): thêm `cf_<khoá>` (trường tùy biến lên bộ lọc,
 *  24o) cho màn contacts. Chỉ THÊM, không đổi nghĩa khoá cũ nào — mọi dòng
 *  saved_views cũ (v1) đã được nâng thẳng lên v2 trong migration #75, không
 *  đổi ý nghĩa câu lọc đang lưu. */
export const SAVED_VIEW_VOCAB_VERSION = 2;

/** `cf_` là tiền tố MỞ cho trường tùy biến theo pack (mỗi tenant khai khác
 *  nhau) — không liệt kê hết trong SAVED_VIEW_VOCAB được, nhận diện bằng
 *  tiền tố. Chỉ áp cho màn contacts — deals không có trường tùy biến. */
const CUSTOM_FIELD_PARAM_PREFIX = "cf_";

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

/** QĐ-4 — kiểm TRƯỚC khi cho bấm: version sai HOẶC có khoá ngoài vốn từ của
 *  màn tương ứng ⇒ coi là hỏng. Không gọi RPC chỉ để biết chip có bấm được
 *  không — RPC dành cho lúc THẬT SỰ tác động ra ngoài (QĐ-1). */
export function isSavedViewStale(
  view: Pick<SavedView, "screen" | "query" | "vocab_version">,
): boolean {
  if (view.vocab_version !== SAVED_VIEW_VOCAB_VERSION) return true;
  const known = SAVED_VIEW_VOCAB[view.screen];
  const params = new URLSearchParams(view.query);
  for (const key of params.keys()) {
    if (known.includes(key)) continue;
    if (view.screen === "contacts" && key.startsWith(CUSTOM_FIELD_PARAM_PREFIX)) continue;
    return true;
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
