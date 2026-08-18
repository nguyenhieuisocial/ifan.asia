import type { SupabaseClient } from "@supabase/supabase-js";
import { applyKeysetCursor, keysetCursor } from "@/lib/keyset-cursor";
import type { NotificationRow } from "./types";

/**
 * Fetcher dùng chung Trung tâm thông báo: server component load trang đầu,
 * client (TanStack Query) hỏi lại — cùng một câu select để shape khớp nhau.
 *
 * KỶ LUẬT "chỉ việc của TÔI" nằm ở DB chứ không ở đây: policy
 * `notifications_select` (migration #2) đã khoanh `tenant_id = current_tenant_id()
 * AND user_id = auth.uid()`. Không câu nào dưới đây thêm `.eq('user_id', ...)` —
 * cố tình, để nếu ai đó lỡ bỏ điều kiện ở tầng web thì DB vẫn chặn.
 */

export const PAGE_SIZE = 30;

/** Số dòng trong panel của chuông — đủ liếc, không biến chuông thành màn danh sách. */
export const BELL_LIMIT = 8;

const SELECT =
  "id, type, title, body, link, read_at, created_at, title_key, body_key, params";

export type NotificationFilter = {
  /** "" = mọi loại; ngược lại là giá trị cột `type`. */
  type: string;
  unreadOnly: boolean;
};

export type NotificationsPage = {
  rows: NotificationRow[];
  nextCursor: string | null;
};

export const ALL_FILTER: NotificationFilter = { type: "", unreadOnly: false };

export async function fetchNotificationsPage(
  supabase: SupabaseClient,
  filter: NotificationFilter,
  cursor: string | null,
): Promise<NotificationsPage> {
  let query = supabase
    .from("notifications")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);

  if (filter.type) query = query.eq("type", filter.type);
  if (filter.unreadOnly) query = query.is("read_at", null);
  if (cursor) query = applyKeysetCursor(query, cursor);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as NotificationRow[];
  const last = rows[rows.length - 1];
  return {
    rows,
    // Phân trang theo con trỏ thời gian (như màn Công ty/Khách hàng): thêm dòng
    // mới ở đầu danh sách không làm lệch trang sau như offset.
    nextCursor: rows.length === PAGE_SIZE ? keysetCursor(last) : null,
  };
}

/** Đếm chưa đọc — chạy trên index riêng `notifications_unread_idx` (partial, read_at is null). */
export async function fetchUnreadCount(
  supabase: SupabaseClient,
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export type BellData = { unread: number; rows: NotificationRow[] };

/** Dữ liệu cho chuông: số chưa đọc + vài dòng gần nhất, lấy song song. */
export async function fetchBellData(
  supabase: SupabaseClient,
): Promise<BellData> {
  const [unread, recent] = await Promise.all([
    fetchUnreadCount(supabase),
    supabase
      .from("notifications")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(BELL_LIMIT),
  ]);
  if (recent.error) throw new Error(recent.error.message);
  return { unread, rows: (recent.data ?? []) as NotificationRow[] };
}
