import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hàng hoá & dịch vụ — kiểu dùng CHUNG cho màn Hàng hoá (ADR-0019 mục 3,
 * migration #125/#127, hợp đồng 24a).
 *
 * `costVnd` đọc qua bảng `item_costs` TÁCH RIÊNG (không phải cột trên
 * `items`) — RLS chỉ owner/admin/manager đọc được (ADR-0019 mục 9). Với vai
 * staff/viewer, LEFT JOIN không trả được dòng nào ⇒ `costVnd` luôn `null` —
 * đây là hàng rào CSDL thật, không phải màn tự ẩn cột.
 *
 * V3 KHÔNG có kho/tồn (V4) và KHÔNG có bảng giá sỉ theo bậc `price_tiers`
 * (UI ở V6) — cắt rõ trong ADR-0019 mục 8, dù thẻ design `man-hang-hoa` vẽ
 * rộng hơn cho tầm nhìn dài hạn. Màn này chỉ dựng đúng phần V3.
 */

export const ITEM_KINDS = ["service", "product"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_STATUSES = ["draft", "active", "discontinued"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_NAME_MAX = 120;
export const ITEM_UNIT_MAX = 20;
export const ITEM_GROUP_MAX = 60;
export const ITEM_PRICE_MAX = 1_000_000_000;
export const ITEM_DURATION_MIN = 1;
export const ITEM_DURATION_MAX = 1440; // 24 giờ — khớp check constraint items_duration_minutes_check
export const VARIANT_SKU_MAX = 60;

export type ItemVariant = {
  id: string;
  itemId: string;
  /** Nhãn biến thể tự do (vd "30ml", "Size M") — thuộc tính đóng-theo-pack
   *  của 24a CHƯA có pack nào khai schema, nên V3 dùng một nhãn tự do thay
   *  vì bịa ra một hệ thuộc tính không ai cấu hình (D2). Lưu trong
   *  `attributes` dạng {"label": "30ml"} để không phải đổi cột khi có pack
   *  khai schema thật sau này. */
  label: string;
  priceVnd: number | null;
  sku: string | null;
  sortOrder: number;
};

export type Item = {
  id: string;
  kind: ItemKind;
  name: string;
  groupName: string | null;
  unit: string | null;
  durationMinutes: number | null;
  priceVnd: number;
  /** null = chưa nhập HOẶC vai hiện tại không có quyền đọc (staff/viewer). */
  costVnd: number | null;
  status: ItemStatus;
  sortOrder: number;
  variants: ItemVariant[];
};

type ItemRow = {
  id: string;
  kind: string;
  name: string;
  group_name: string | null;
  unit: string | null;
  duration_minutes: number | null;
  price_vnd: number;
  status: string;
  sort_order: number;
  item_costs: { cost_vnd: number | null }[] | { cost_vnd: number | null } | null;
};

type VariantRow = {
  id: string;
  item_id: string;
  attributes: { label?: string } | null;
  price_vnd: number | null;
  sku: string | null;
  sort_order: number;
};

function readCost(row: ItemRow): number | null {
  const rel = row.item_costs;
  if (!rel) return null;
  const one = Array.isArray(rel) ? rel[0] : rel;
  return one?.cost_vnd ?? null;
}

export async function listItems(supabase: SupabaseClient): Promise<Item[]> {
  const [itemsRes, variantsRes] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, kind, name, group_name, unit, duration_minutes, price_vnd, status, sort_order, item_costs(cost_vnd)",
      )
      .order("sort_order")
      .order("name"),
    supabase
      .from("item_variants")
      .select("id, item_id, attributes, price_vnd, sku, sort_order")
      .order("sort_order"),
  ]);

  const variantsByItem = new Map<string, ItemVariant[]>();
  for (const v of (variantsRes.data ?? []) as VariantRow[]) {
    const list = variantsByItem.get(v.item_id) ?? [];
    list.push({
      id: v.id,
      itemId: v.item_id,
      label: v.attributes?.label ?? "",
      priceVnd: v.price_vnd,
      sku: v.sku,
      sortOrder: v.sort_order,
    });
    variantsByItem.set(v.item_id, list);
  }

  return ((itemsRes.data ?? []) as ItemRow[]).map((r) => ({
    id: r.id,
    kind: r.kind as ItemKind,
    name: r.name,
    groupName: r.group_name,
    unit: r.unit,
    durationMinutes: r.duration_minutes,
    priceVnd: Number(r.price_vnd ?? 0),
    costVnd: readCost(r) === null ? null : Number(readCost(r)),
    status: r.status as ItemStatus,
    sortOrder: r.sort_order,
    variants: variantsByItem.get(r.id) ?? [],
  }));
}
