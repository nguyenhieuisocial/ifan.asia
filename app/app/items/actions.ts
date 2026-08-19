"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  ITEM_DURATION_MAX,
  ITEM_DURATION_MIN,
  ITEM_GROUP_MAX,
  ITEM_KINDS,
  ITEM_NAME_MAX,
  ITEM_PRICE_MAX,
  ITEM_STATUSES,
  ITEM_UNIT_MAX,
  VARIANT_SKU_MAX,
  listItems,
  type Item,
} from "@/lib/catalog/items";

/**
 * Màn Hàng hoá (ADR-0019 mục 3+8 việc 3, thẻ design man-hang-hoa.html, đợt
 * V3 "Tiền thật"). Quyền owner/admin/manager — khớp RLS `items_manage`
 * (migration #125, khuôn `lead_sources`/`services_manage` đã dùng ở V2).
 *
 * KHÔNG có action xoá item — thẻ design đã chốt "không có nút Xoá mặt hàng,
 * chỉ Ngừng nhập/Ngừng bán" (bất biến 11 tinh thần: xoá phá mọi đơn cũ đã
 * tham chiếu nó). Đổi trạng thái đi qua `saveItem` như mọi trường khác.
 */

type ActionResult = { error: string | null };

const MANAGE_ROLES = ["owner", "admin", "manager"];

async function requireManage(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>>; tenantId: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const [member, { data: tenant }] = await Promise.all([
    getCurrentMembership(supabase, user.id),
    supabase.from("tenants").select("id").maybeSingle(),
  ]);
  if (!member || !MANAGE_ROLES.includes(member.role)) return { error: "forbidden" };
  if (!tenant) return { error: "not_found" };
  return { supabase, tenantId: tenant.id as string };
}

function mapDbError(message: string): string {
  if (/duplicate key|unique constraint/i.test(message)) return "duplicate_name";
  if (/items_kind_fields_check/i.test(message)) return "kind_fields_invalid";
  if (/row-level security/i.test(message)) return "forbidden";
  return "save_failed";
}

function revalidateItems() {
  revalidatePath("/app/items");
}

// ---------- Hàng hoá & dịch vụ ----------

const itemSchema = z.object({
  id: z.uuid().nullable(),
  kind: z.enum(ITEM_KINDS),
  name: z.string().trim().min(1).max(ITEM_NAME_MAX),
  groupName: z.string().trim().max(ITEM_GROUP_MAX).nullable(),
  // unit bắt buộc khi kind=product, PHẢI trống khi kind=service — kiểm ở
  // safeParse bên dưới (Zod object-level refine), khớp constraint CSDL
  // items_kind_fields_check để báo lỗi TRƯỚC khi chạm CSDL.
  unit: z.string().trim().max(ITEM_UNIT_MAX).nullable(),
  durationMinutes: z.number().int().min(ITEM_DURATION_MIN).max(ITEM_DURATION_MAX).nullable(),
  priceVnd: z.number().int().min(0).max(ITEM_PRICE_MAX),
  costVnd: z.number().int().min(0).max(ITEM_PRICE_MAX).nullable(),
  status: z.enum(ITEM_STATUSES),
});

function validateKindFields(row: z.infer<typeof itemSchema>): boolean {
  if (row.kind === "service") return !!row.durationMinutes && !row.unit;
  return !row.durationMinutes && !!row.unit; // product
}

export async function saveItem(input: z.infer<typeof itemSchema>): Promise<ActionResult & { items?: Item[] }> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  if (!validateKindFields(parsed.data)) return { error: "kind_fields_invalid" };

  const auth = await requireManage();
  if ("error" in auth) return auth;
  const { supabase, tenantId } = auth;

  const id = parsed.data.id ?? randomUUID();

  const { error } = await supabase.from("items").upsert({
    id,
    tenant_id: tenantId,
    kind: parsed.data.kind,
    name: parsed.data.name,
    group_name: parsed.data.groupName,
    unit: parsed.data.unit,
    duration_minutes: parsed.data.durationMinutes,
    price_vnd: parsed.data.priceVnd,
    status: parsed.data.status,
  });
  if (error) return { error: mapDbError(error.message) };

  // Giá vốn TÁCH bảng riêng (item_costs, ADR-0019 mục 9) — chỉ owner/admin/
  // manager gọi tới đây được (đã kiểm ở requireManage), RLS item_costs_rw
  // vẫn là hàng rào thật phía sau. `null` = xoá dòng (chưa nhập giá vốn),
  // không phải giá vốn = 0.
  // ⚠️ Lỗi ở đây KHÔNG được nuốt. Màn hình chỉ xét `res.error` rồi bắn toast
  // "Đã lưu" — nuốt lỗi nghĩa là giá vốn không ghi được mà người dùng thấy báo
  // xanh, và MỌI báo cáo lãi/lỗ sau đó sai mà không ai truy được về đâu.
  const { error: loiGiaVon } =
    parsed.data.costVnd === null
      ? await supabase.from("item_costs").delete().eq("item_id", id)
      : await supabase
          .from("item_costs")
          .upsert({ item_id: id, tenant_id: tenantId, cost_vnd: parsed.data.costVnd });
  if (loiGiaVon) return { error: mapDbError(loiGiaVon.message) };

  revalidateItems();
  return { error: null, items: await listItems(supabase) };
}

// ---------- Biến thể ----------

const variantSchema = z.object({
  id: z.uuid().nullable(),
  itemId: z.uuid(),
  label: z.string().trim().min(1).max(60),
  priceVnd: z.number().int().min(0).max(ITEM_PRICE_MAX).nullable(),
  sku: z.string().trim().max(VARIANT_SKU_MAX).nullable(),
});

export async function saveVariant(input: z.infer<typeof variantSchema>): Promise<ActionResult & { items?: Item[] }> {
  const parsed = variantSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireManage();
  if ("error" in auth) return auth;
  const { supabase, tenantId } = auth;

  const { error } = await supabase.from("item_variants").upsert({
    id: parsed.data.id ?? randomUUID(),
    tenant_id: tenantId,
    item_id: parsed.data.itemId,
    attributes: { label: parsed.data.label },
    price_vnd: parsed.data.priceVnd,
    sku: parsed.data.sku,
  });
  // Guard item_variants_kind_guard (migration #125) trả lỗi text riêng khi
  // gắn nhầm vào item kind=service — dịch thành khoá i18n rõ ràng.
  if (error) {
    if (/kind=product/i.test(error.message)) return { error: "variant_needs_product" };
    return { error: mapDbError(error.message) };
  }

  revalidateItems();
  return { error: null, items: await listItems(supabase) };
}

export async function deleteVariant(id: string): Promise<ActionResult & { items?: Item[] }> {
  const auth = await requireManage();
  if ("error" in auth) return auth;
  const { supabase } = auth;

  const { error } = await supabase.from("item_variants").delete().eq("id", id);
  // FK order_lines.variant_id ON DELETE RESTRICT — biến thể đã bán rồi thì
  // CSDL tự chặn xoá (bảo vệ đơn cũ), không cần kiểm tay ở đây.
  if (error) {
    if (/foreign key/i.test(error.message)) return { error: "variant_in_use" };
    return { error: mapDbError(error.message) };
  }

  revalidateItems();
  return { error: null, items: await listItems(supabase) };
}
