/**
 * Con trỏ phân trang "mốc thời gian + id".
 *
 * Vì sao cần id: Postgres `now()` trả về mốc BẮT ĐẦU GIAO DỊCH, nên mọi dòng
 * ghi trong cùng một lượt (nhập Excel 200 khách, một đợt sinh thông báo) có
 * `created_at` giống hệt nhau. Con trỏ chỉ dựa vào created_at sẽ đòi trang sau
 * phải "cũ hơn hẳn" → bỏ trắng toàn bộ phần còn lại của nhóm trùng mốc. Đo
 * 18/08 trên CSDL thật: 1 người dùng có 121 thông báo, lật hết trang chỉ thấy
 * 74 (việc #167). Thêm id làm mốc phụ khiến thứ tự trở nên duy nhất tuyệt đối.
 *
 * Dùng kèm `.order("created_at", {ascending:false}).order("id", {ascending:false})`.
 */

type Query = {
  or: (filter: string) => Query;
  lt: (column: string, value: string) => Query;
};

/** Ghép con trỏ từ dòng cuối trang. */
export function keysetCursor(row: { created_at: string; id: string }): string {
  return `${row.created_at}|${row.id}`;
}

/**
 * Áp con trỏ lên query. Con trỏ cũ (chỉ có created_at, còn sót ở tab đang mở
 * lúc ra bản mới) vẫn chạy theo lối cũ thay vì ném lỗi ra màn hình.
 */
export function applyKeysetCursor<Q extends Query>(query: Q, cursor: string): Q {
  const [at, id] = cursor.split("|");
  if (!id) return query.lt("created_at", at) as Q;
  return query.or(
    `created_at.lt."${at}",and(created_at.eq."${at}",id.lt.${id})`,
  ) as Q;
}
