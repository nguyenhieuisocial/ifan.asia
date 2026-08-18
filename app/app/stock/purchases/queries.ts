import type { SupabaseClient } from "@supabase/supabase-js";
import { applyKeysetCursor, keysetCursor } from "@/lib/keyset-cursor";

/**
 * Danh sách phiếu nhập đã ghi (thẻ `man-phieu-nhap.html`).
 *
 * Phân trang bằng con trỏ ghép `created_at + id` (`lib/keyset-cursor.ts`) chứ
 * KHÔNG theo mỗi mốc thời gian: nhiều phiếu ghi trong cùng một lượt có
 * `created_at` giống hệt nhau, con trỏ chỉ dựa vào mốc sẽ bỏ trắng phần còn lại
 * của nhóm trùng mốc (việc #167 đã đo ra chuyện mất dữ liệu thật).
 *
 * KHÔNG nuốt lỗi: ném ra để màn phân biệt "tra cứu hỏng" với "chưa có phiếu
 * nào" (việc #169).
 */

export const SO_PHIEU_MOI_TRANG = 20;

export type DongPhieuNhap = {
  id: string;
  trangThai: string;
  nhaCungCap: string | null;
  ngayNhap: string | null;
  taoLuc: string;
  nguoiGhi: string | null;
  ghiChu: string | null;
  soDong: number;
  tongTien: number;
};

type HangPhieu = {
  id: string;
  status: string;
  note: string | null;
  received_at: string | null;
  created_at: string;
  created_by: string | null;
  suppliers: { name: string } | { name: string }[] | null;
  purchase_lines: { qty_mua: number | string; don_gia_mua: number | string }[] | null;
};

function tenNhaCungCap(s: HangPhieu["suppliers"]): string | null {
  if (!s) return null;
  const mot = Array.isArray(s) ? s[0] : s;
  return mot?.name ?? null;
}

export async function layPhieuNhap(
  supabase: SupabaseClient,
  cursor?: string,
): Promise<{ phieu: DongPhieuNhap[]; cursorTiep: string | null }> {
  let q = supabase
    .from("purchases")
    .select("id, status, note, received_at, created_at, created_by, suppliers(name), purchase_lines(qty_mua, don_gia_mua)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(SO_PHIEU_MOI_TRANG + 1);

  if (cursor) q = applyKeysetCursor(q, cursor);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as unknown as HangPhieu[];
  const conNua = rows.length > SO_PHIEU_MOI_TRANG;
  const lay = conNua ? rows.slice(0, SO_PHIEU_MOI_TRANG) : rows;

  return {
    phieu: lay.map((r) => ({
      id: r.id,
      trangThai: r.status,
      nhaCungCap: tenNhaCungCap(r.suppliers),
      ngayNhap: r.received_at,
      taoLuc: r.created_at,
      nguoiGhi: r.created_by,
      ghiChu: r.note,
      soDong: (r.purchase_lines ?? []).length,
      // Tổng tiền phiếu = tổng (số lượng MUA × giá một đơn vị MUA) — chưa quy
      // đổi, vì đây là số tiền thật trả cho nhà cung cấp.
      tongTien: (r.purchase_lines ?? []).reduce((s, l) => s + Number(l.qty_mua) * Number(l.don_gia_mua), 0),
    })),
    cursorTiep:
      conNua && lay.length ? keysetCursor({ created_at: lay[lay.length - 1].created_at, id: lay[lay.length - 1].id }) : null,
  };
}
