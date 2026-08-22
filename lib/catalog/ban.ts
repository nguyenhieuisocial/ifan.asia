import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * BÀN CỦA QUÁN ĂN & CAFE (thẻ `man-ban-quan-an`, migration #356).
 *
 * ⚠️ BÀN KHÔNG CÓ TRẠNG THÁI RIÊNG TRONG CSDL. Nó suy ra từ đơn đang mở:
 *   không có đơn ⇒ trống · có đơn ⇒ đang phục vụ · đơn đã in tạm tính ⇒ khách
 *   đã xin tính tiền. Lưu thêm một cột `trang_thai` trên bàn là để hai chỗ cùng
 *   nhớ một sự thật, và sớm muộn chúng lệch nhau — bàn hiện "đang phục vụ" mà
 *   đơn thì đã thanh toán xong từ hôm qua.
 */

export type TrangThaiBan = "trong" | "dang" | "tam_tinh";

export type Ban = {
  id: string;
  ten: string;
  trangThai: TrangThaiBan;
  /** Đơn đang mở của bàn — null khi bàn trống. */
  donId: string | null;
  /** Tổng tiền đang chạy của đơn. 0 khi bàn trống. */
  tongVnd: number;
  soDong: number;
  /** Lúc mở bàn (ISO). null khi bàn trống. */
  moLuc: string | null;
};

/**
 * Danh sách bàn kèm tình trạng.
 *
 * ⚠️ MỘT LƯỢT TRUY VẤN CHO CẢ MÀN, không phải một lượt mỗi bàn. Quán 40 bàn mà
 *   hỏi từng bàn là 40 vòng mạng mỗi lần vẽ lại — màn này vẽ lại mỗi lần chạm.
 */
export async function danhSachBan(supabase: SupabaseClient): Promise<Ban[]> {
  const { data: banRes } = await supabase
    .from("resources")
    .select("id, name")
    .eq("kind", "table")
    .eq("is_active", true)
    .order("name");
  const cacBan = (banRes ?? []) as { id: string; name: string }[];
  if (cacBan.length === 0) return [];

  // Đơn đang mở của các bàn đó. Chỉ mục `orders_resource_dang_mo` phục vụ đúng
  // câu này; và `orders_mot_ban_mot_don_mo` bảo đảm mỗi bàn nhiều nhất một dòng.
  const { data: donRes } = await supabase
    .from("orders")
    .select("id, resource_id, created_at, tam_tinh_luc, order_lines(qty, unit_price_vnd, discount_vnd)")
    .in("status", ["draft", "confirmed"])
    .is("deleted_at", null)
    .not("resource_id", "is", null);

  type DonMo = {
    id: string;
    resource_id: string | null;
    created_at: string;
    tam_tinh_luc: string | null;
    order_lines: { qty: number; unit_price_vnd: number; discount_vnd: number | null }[];
  };
  const theoBan = new Map<string, DonMo>();
  for (const d of (donRes ?? []) as unknown as DonMo[]) {
    if (d.resource_id) theoBan.set(d.resource_id, d);
  }

  return cacBan.map((b) => {
    const don = theoBan.get(b.id);
    if (!don) {
      return { id: b.id, ten: b.name, trangThai: "trong" as const, donId: null, tongVnd: 0, soDong: 0, moLuc: null };
    }
    const dong = don.order_lines ?? [];
    const tong = dong.reduce(
      (s, l) => s + l.qty * l.unit_price_vnd - (l.discount_vnd ?? 0),
      0,
    );
    return {
      id: b.id,
      ten: b.name,
      trangThai: don.tam_tinh_luc ? ("tam_tinh" as const) : ("dang" as const),
      donId: don.id,
      tongVnd: tong,
      soDong: dong.length,
      moLuc: don.created_at,
    };
  });
}

/** Tiệm này có khai bàn không — quyết định có hiện mục "Bán tại quầy" hay không. */
export async function tiemCoBan(supabase: SupabaseClient): Promise<boolean> {
  const { count } = await supabase
    .from("resources")
    .select("id", { count: "exact", head: true })
    .eq("kind", "table")
    .eq("is_active", true);
  return (count ?? 0) > 0;
}

export type DongBan = {
  id: string;
  itemId: string;
  ten: string;
  qty: number;
  donGiaVnd: number;
  ghiChu: string | null;
};

export type DonBan = {
  id: string;
  banId: string | null;
  banTen: string | null;
  moLuc: string;
  tamTinhLuc: string | null;
  dong: DongBan[];
  tongVnd: number;
};

/** Đơn đang mở của một bàn, kèm dòng hàng — dùng cho khoang phải. */
export async function donCuaBan(supabase: SupabaseClient, donId: string): Promise<DonBan | null> {
  const { data } = await supabase
    .from("orders")
    .select(
      "id, resource_id, created_at, tam_tinh_luc, resources(name), order_lines(id, item_id, qty, unit_price_vnd, discount_vnd, ghi_chu, items(name))",
    )
    .eq("id", donId)
    .maybeSingle();
  if (!data) return null;

  const d = data as unknown as {
    id: string;
    resource_id: string | null;
    created_at: string;
    tam_tinh_luc: string | null;
    resources: { name: string } | null;
    order_lines: {
      id: string;
      item_id: string;
      qty: number;
      unit_price_vnd: number;
      discount_vnd: number | null;
      ghi_chu: string | null;
      items: { name: string } | null;
    }[];
  };

  const dong: DongBan[] = (d.order_lines ?? []).map((l) => ({
    id: l.id,
    itemId: l.item_id,
    ten: l.items?.name ?? "",
    qty: l.qty,
    donGiaVnd: l.unit_price_vnd,
    ghiChu: l.ghi_chu,
  }));
  return {
    id: d.id,
    banId: d.resource_id,
    banTen: d.resources?.name ?? null,
    moLuc: d.created_at,
    tamTinhLuc: d.tam_tinh_luc,
    dong,
    tongVnd: (d.order_lines ?? []).reduce(
      (s, l) => s + l.qty * l.unit_price_vnd - (l.discount_vnd ?? 0),
      0,
    ),
  };
}
