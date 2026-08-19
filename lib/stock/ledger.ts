import type { SupabaseClient } from "@supabase/supabase-js";
import { applyKeysetCursor, keysetCursor } from "@/lib/keyset-cursor";

/**
 * Tầng dữ liệu của mảng Kho (ADR-0021).
 *
 * Ba luật của mảng này, đọc trước khi sửa:
 *  1. Tồn KHÔNG đọc từ một ô số — đọc từ view `stock_levels` (tổng của sổ
 *     `stock_moves`). Không có chỗ nào trong app được phép ghi thẳng "số tồn".
 *  2. Tồn ÂM là hợp lệ (ADR mục 5: bán quá tồn thì cảnh báo, không chặn) ⇒
 *     mọi phép đếm/lọc ở đây phải xử lý số âm, không được coi là dữ liệu hỏng.
 *  3. Giá vốn nằm ở bảng riêng `item_costs` mà RLS chỉ mở cho owner/admin/
 *     manager. Nhân viên thường JOIN vào cũng ra rỗng — nên chỗ gọi phải coi
 *     "không có giá vốn" là CHUYỆN BÌNH THƯỜNG, không phải lỗi.
 */

/** Dưới mức này thì coi là sắp hết. Chưa cho tiệm tự đặt — chờ có tiệm thật
 *  dùng rồi mới biết ngưỡng nào hợp lý, đặt sớm là đoán mò. */
export const NGUONG_SAP_HET = 5;

export type MucTon = {
  itemId: string;
  ten: string;
  donVi: string | null;
  ton: number;
  giaVon: number | null;
  lanCuoi: string | null;
};

export type DongSoKho = {
  id: string;
  qty: number;
  lyDo: string;
  ghiChu: string | null;
  taoLuc: string;
  /**
   * Đơn hàng đã sinh ra dòng kho này (null nếu dòng không đến từ đơn).
   *
   * `stock_moves` có sẵn `ref_type` + `ref_id` trỏ về chứng từ gốc, và dữ liệu
   * đầy đủ — đo 19/08: 84 dòng `order_line` nối sang `order_lines` khớp 84/84,
   * 4 dòng `purchase_line`, không dòng nào mồ côi. Nhưng suốt từ đầu KHÔNG một
   * dòng mã ứng dụng nào đọc hai cột đó ⇒ chủ tiệm thấy "bán −2" mà không có
   * đường nhảy sang đơn đã gây ra, đối chiếu kho lệch thì phải mò tay.
   *
   * Chỉ giải cho `order_line`: `/app/orders/[id]` là màn CÓ THẬT. `purchase_line`
   * cố ý để trống — phiếu nhập chưa có màn chi tiết riêng, mà nhãn lý do đã nói
   * "Nhập hàng" rồi, nên một đường dẫn dẫn về danh sách chỉ là đường dẫn cho có.
   *
   * VỚI NHÂN VIÊN, ĐƯỜNG DẪN NÀY THƯA HƠN — và đó là đúng, không phải lỗi.
   * `stock_moves_select` mở cho cả tiệm, nhưng `order_lines_select` chỉ cho
   * owner/admin/manager/viewer xem tất, còn `staff` chỉ xem dòng của đơn CHÍNH
   * HỌ tạo. Đo trên tiệm demo (đóng vai, giao dịch rồi rollback):
   *
   *   owner  thấy 88 dòng kho · giải được đơn cho 84/84 dòng bán
   *   viewer thấy 88 dòng kho · giải được đơn cho 84/84
   *   staff  thấy 88 dòng kho · giải được đơn cho **27/84**
   *
   * Nhân viên vẫn thấy hàng đã ra/vào (họ cần biết tồn), chỉ không mở được đơn
   * của người khác — mà họ vốn đã không mở được. Nên chỗ này để `null` là ĐÚNG
   * cách hỏng: không hiện đường dẫn, thay vì hiện một đường dẫn bấm vào báo lỗi.
   */
  donHangId: string | null;
};

const NHAN_LY_DO: Record<string, string> = {
  nhap: "Nhập hàng",
  ban: "Bán ra",
  hoan: "Khách trả lại",
  huy: "Huỷ chứng từ",
  kiem_ke: "Kiểm kê",
  hao_hut: "Hao hụt",
};

export function nhanLyDo(lyDo: string): string {
  return NHAN_LY_DO[lyDo] ?? lyDo;
}

/**
 * Danh sách tồn của MỌI hàng hoá vật lý, kể cả hàng chưa có dòng kho nào
 * (tồn 0) — nếu chỉ liệt kê hàng đã có phát sinh thì chủ tiệm mở màn Kho ra
 * không thấy hàng mình vừa khai, tưởng mất.
 *
 * KHÔNG nuốt lỗi (bài học việc #169): tra cứu hỏng phải NÉM, để màn hình phân
 * biệt được "tra cứu hỏng" với "chưa có hàng nào". Hai chuyện đó nhìn giống
 * nhau trên màn nhưng khác nhau hoàn toàn với người dùng.
 */
export async function layMucTon(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MucTon[]> {
  const [hangRes, tonRes, vonRes] = await Promise.all([
    supabase
      .from("items")
      .select("id, name, unit")
      .eq("tenant_id", tenantId)
      .eq("kind", "product")
      .eq("status", "active")
      .order("name"),
    supabase.from("stock_levels").select("item_id, qty_on_hand, last_move_at").eq("tenant_id", tenantId),
    // Giá vốn có thể rỗng vì RLS che theo vai — đó KHÔNG phải lỗi.
    supabase.from("item_costs").select("item_id, cost_vnd").eq("tenant_id", tenantId),
  ]);

  if (hangRes.error) throw hangRes.error;
  if (tonRes.error) throw tonRes.error;

  const ton = new Map<string, { q: number; at: string | null }>();
  for (const r of tonRes.data ?? []) {
    ton.set(r.item_id as string, { q: Number(r.qty_on_hand ?? 0), at: (r.last_move_at as string) ?? null });
  }
  const von = new Map<string, number>();
  for (const r of vonRes.data ?? []) von.set(r.item_id as string, Number(r.cost_vnd));

  return (hangRes.data ?? []).map((h) => ({
    itemId: h.id as string,
    ten: h.name as string,
    donVi: (h.unit as string) ?? null,
    ton: ton.get(h.id as string)?.q ?? 0,
    giaVon: von.get(h.id as string) ?? null,
    lanCuoi: ton.get(h.id as string)?.at ?? null,
  }));
}

/** Ba con số đầu màn. Tính từ CÙNG một mảng đã lấy ở trên — không truy vấn lại
 *  bằng điều kiện khác, vì đó chính là cách sinh ra lỗi "số liệu đá nhau"
 *  (việc #18, tái phát ở Sổ quỹ việc #162). */
export function tomTatTon(dsTon: MucTon[]) {
  return {
    soMatHang: dsTon.length,
    sapHet: dsTon.filter((x) => x.ton > 0 && x.ton <= NGUONG_SAP_HET).length,
    dangAm: dsTon.filter((x) => x.ton < 0).length,
  };
}

/**
 * Lịch sử ra/vào của MỘT mặt hàng, phân trang bằng con trỏ ghép
 * (thời điểm + mã dòng).
 *
 * Cố ý KHÔNG phân trang theo mình thời điểm: việc #167 đã chứng minh cách đó
 * LÀM MẤT DỮ LIỆU THẬT khi nhiều dòng trùng mốc — một tài khoản có 121 thông
 * báo mà bấm "xem thêm" mãi chỉ ra 74. Sổ kho là chỗ dễ trùng mốc nhất (chốt
 * một đơn 5 món sinh 5 dòng cùng một khoảnh khắc).
 */
export async function layLichSuKho(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
  cursor?: string,
  soDong = 30,
): Promise<{ dong: DongSoKho[]; cursorTiep: string | null }> {
  let q = supabase
    .from("stock_moves")
    .select("id, qty, reason, note, created_at, ref_type, ref_id")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(soDong + 1);

  if (cursor) q = applyKeysetCursor(q, cursor);

  const { data, error } = await q;
  if (error) throw error;

  const rows = data ?? [];
  const conNua = rows.length > soDong;
  const lay = conNua ? rows.slice(0, soDong) : rows;

  // `ref_id` là khoá ĐA HÌNH (order_lines HOẶC purchase_lines) nên KHÔNG có
  // khoá ngoại, và không nhúng được kiểu `order_lines(...)`. Tra bằng MỘT câu
  // riêng cho đúng trang đang xem — nhúng nhầm chỗ này đã từng làm hỏng dữ liệu
  // trong kho (lỗi nhúng PostgREST sai), nên ở đây đi đường tường minh.
  const dongLine = lay.filter((r) => r.ref_type === "order_line" && r.ref_id).map((r) => r.ref_id as string);
  const donCuaLine = new Map<string, string>();
  if (dongLine.length > 0) {
    const { data: lines, error: loiLine } = await supabase
      .from("order_lines")
      .select("id, order_id")
      .in("id", dongLine);
    // Tra hỏng thì lịch sử vẫn phải hiện — mất đường dẫn còn hơn mất cả bảng.
    if (!loiLine) for (const l of lines ?? []) donCuaLine.set(l.id as string, l.order_id as string);
  }

  return {
    dong: lay.map((r) => ({
      id: r.id as string,
      qty: Number(r.qty),
      lyDo: r.reason as string,
      ghiChu: (r.note as string) ?? null,
      taoLuc: r.created_at as string,
      donHangId: r.ref_type === "order_line" && r.ref_id ? (donCuaLine.get(r.ref_id as string) ?? null) : null,
    })),
    cursorTiep: conNua && lay.length
      ? keysetCursor({ created_at: lay[lay.length - 1].created_at as string, id: lay[lay.length - 1].id as string })
      : null,
  };
}
