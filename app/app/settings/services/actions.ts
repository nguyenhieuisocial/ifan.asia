"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { getTenantPack } from "@/lib/tenant-pack";
import {
  listResources,
  listServices,
  RESOURCE_KINDS,
  RESOURCE_NAME_MAX,
  SERVICE_DURATION_MAX,
  SERVICE_DURATION_MIN,
  SERVICE_NAME_MAX,
  SERVICE_PRICE_MAX,
  type Resource,
  type Service,
} from "@/lib/booking/services";

/**
 * Cài đặt → Dịch vụ & Tài nguyên (ADR-0009 mục 7 việc 3, thẻ design
 * man-cai-dat-dich-vu.html).
 *
 * QUYỀN: owner/admin/manager (ADR-0009 mục 7b, đính chính 13/08) — khớp đúng
 * RLS `services_manage`/`resources_manage` (migration #83, khuôn
 * `lead_sources`). Hồ sơ gốc ghi "owner/admin" tự mâu thuẫn với RLS đã mở
 * cho manager — sửa lại đúng theo RLS (hàng rào thật), không siết CSDL.
 *
 * CÁCH LƯU: dùng lại nguyên khuôn màn Mặt tiền (storefront-view.tsx) —
 * MỘT thanh Lưu cho cả màn, mỗi KHỐI một action, phần nào hỏng báo đúng phần
 * đó. Mỗi khối ghi bằng ĐÚNG MỘT câu `upsert` mang cả danh sách: một câu lệnh
 * là một đơn vị nguyên tử, nên tên trùng ở dòng thứ 5 KHÔNG để lại 4 dòng đầu
 * đã ghi nửa vời (bài học "mất im lặng nửa số thay đổi" ngày 12/08).
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
  // 23505 unique (tenant_id, name) — chủ tiệm phải đọc ra "trùng tên", không phải mã lỗi Postgres.
  if (/duplicate key|unique constraint/i.test(message)) return "duplicate_name";
  if (/row-level security/i.test(message)) return "forbidden";
  return "save_failed";
}

function revalidateServices() {
  revalidatePath("/app/settings/services");
}

/** Trùng tên (bỏ qua hoa/thường + khoảng trắng thừa) ngay trong danh sách gửi lên —
 *  bắt TRƯỚC khi chạm CSDL để câu báo lỗi chỉ đúng nguyên nhân, không phải mã 23505. */
function hasDuplicateName(names: string[]): boolean {
  const seen = new Set<string>();
  for (const n of names) {
    const k = n.trim().toLocaleLowerCase("vi");
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

/**
 * id do client gửi lên chỉ được là id ĐANG CÓ của chính tiệm này — chặn đường
 * gửi id của tiệm khác để mượn `on conflict (id) do update` sửa trộm dữ liệu.
 *
 * `itemKind`: sau di trú `services` → `items` (ADR-0019, migration #125),
 * bảng `items` chứa CẢ dịch vụ lẫn hàng hoá — màn Dịch vụ chỉ được đụng vào
 * dòng `kind='service'`. Không lọc theo kind ở đây thì id của một hàng hoá
 * (V3 việc 3, `man-hang-hoa`) gửi lên từ đây vẫn "known" và bị `saveServices`
 * ghi đè thành dịch vụ — mất dữ liệu hàng hoá trong im lặng.
 */
async function assertKnownIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "items" | "resources",
  ids: string[],
  itemKind?: "service",
): Promise<boolean> {
  if (ids.length === 0) return true;
  let query = supabase.from(table).select("id").in("id", ids);
  if (table === "items" && itemKind) query = query.eq("kind", itemKind);
  const { data, error } = await query;
  if (error) return false;
  return (data ?? []).length === ids.length;
}

// ---------- Dịch vụ ----------

const serviceRowSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(SERVICE_NAME_MAX),
  durationMinutes: z.number().int().min(SERVICE_DURATION_MIN).max(SERVICE_DURATION_MAX),
  priceVnd: z.number().int().min(0).max(SERVICE_PRICE_MAX),
  isActive: z.boolean(),
});
const servicesSchema = z.array(serviceRowSchema).max(200);

export async function saveServices(
  rows: z.infer<typeof servicesSchema>,
): Promise<ActionResult & { services?: Service[] }> {
  const parsed = servicesSchema.safeParse(rows);
  if (!parsed.success) return { error: "invalid_input" };
  if (hasDuplicateName(parsed.data.map((r) => r.name))) return { error: "duplicate_name" };

  const auth = await requireManage();
  if ("error" in auth) return auth;
  const { supabase, tenantId } = auth;

  const knownIds = parsed.data.map((r) => r.id).filter((id): id is string => !!id);
  if (!(await assertKnownIds(supabase, "items", knownIds, "service"))) return { error: "invalid_input" };

  const { error } = await supabase.from("items").upsert(
    parsed.data.map((r, i) => ({
      id: r.id ?? randomUUID(),
      tenant_id: tenantId,
      kind: "service" as const,
      name: r.name,
      duration_minutes: r.durationMinutes,
      price_vnd: r.priceVnd,
      // Màn này chỉ có 2 trạng thái (bật/tắt) — 'draft' là khái niệm riêng
      // của màn Hàng hoá (V3 việc 3), không đụng ở đây.
      status: r.isActive ? "active" : "discontinued",
      // Thứ tự trên màn = thứ tự lưu: chủ tiệm kéo dịch vụ hay dùng lên đầu thì
      // màn Lịch cũng thấy nó ở đầu (lib/booking/services.ts, listServices).
      sort_order: i,
    })),
  );
  if (error) return { error: mapDbError(error.message) };

  revalidateServices();
  return { error: null, services: await listServices(supabase) };
}

// ---------- Tài nguyên ----------

const resourceRowSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(RESOURCE_NAME_MAX),
  kind: z.enum(RESOURCE_KINDS),
  isActive: z.boolean(),
});
const resourcesSchema = z.array(resourceRowSchema).max(200);

export async function saveResources(
  rows: z.infer<typeof resourcesSchema>,
): Promise<ActionResult & { resources?: Resource[] }> {
  const parsed = resourcesSchema.safeParse(rows);
  if (!parsed.success) return { error: "invalid_input" };
  if (hasDuplicateName(parsed.data.map((r) => r.name))) return { error: "duplicate_name" };

  const auth = await requireManage();
  if ("error" in auth) return auth;
  const { supabase, tenantId } = auth;

  const knownIds = parsed.data.map((r) => r.id).filter((id): id is string => !!id);
  if (!(await assertKnownIds(supabase, "resources", knownIds))) return { error: "invalid_input" };

  const { error } = await supabase.from("resources").upsert(
    parsed.data.map((r) => ({
      id: r.id ?? randomUUID(),
      tenant_id: tenantId,
      name: r.name,
      kind: r.kind,
      is_active: r.isActive,
    })),
  );
  if (error) return { error: mapDbError(error.message) };

  revalidateServices();
  return { error: null, resources: await listResources(supabase) };
}

// ---------- Nạp dịch vụ mẫu theo ngành ----------

/**
 * Vì sao nút này BẮT BUỘC phải có: `apply_industry_pack()` (nơi seed dịch vụ
 * mẫu) chỉ chạy khi tiệm CHỌN/ĐỔI ngành. Mọi tiệm tạo TRƯỚC migration #83 —
 * đo 13/08: 8/8 tiệm trên CSDL thật, `services` rỗng ở cả 8 — sẽ mở màn này ra
 * thấy trang trắng và không có đường nào lấy lại danh sách mẫu.
 *
 * Vì sao KHÔNG gọi thẳng `apply_industry_pack()`: hàm đó áp LẠI cả pack (ghi
 * `tenants.industry`, seed tags/quick_replies/saved_views, ghi audit
 * 'pack_applied'). Bấm một nút tên là "nạp dịch vụ mẫu" mà chạy thêm 4 việc
 * khác là hành vi lén — ở đây chỉ đọc đúng mảnh `services` của pack đang dùng.
 *
 * Không tạo trùng khi bấm hai lần: `ignoreDuplicates` → `ON CONFLICT
 * (tenant_id, name) DO NOTHING`, đúng cách `apply_industry_pack` đang làm. Bấm
 * lần hai cũng KHÔNG đè giá/thời lượng tiệm đã tự sửa.
 */
export async function seedServicesFromPack(): Promise<
  ActionResult & { services?: Service[]; inserted?: number }
> {
  const auth = await requireManage();
  if ("error" in auth) return auth;
  const { supabase, tenantId } = auth;

  // MỘT cửa đọc pack (D1) — không tự `select` bảng industry_packs ở đây.
  const pack = await getTenantPack(supabase);
  const sample = (pack.services ?? []).filter(
    (s) =>
      typeof s?.name === "string" &&
      s.name.trim().length > 0 &&
      Number.isInteger(s.duration_minutes) &&
      s.duration_minutes >= SERVICE_DURATION_MIN &&
      s.duration_minutes <= SERVICE_DURATION_MAX,
  );
  // Ngành chưa chọn, hoặc pack cố ý không có dịch vụ mẫu (shop/retail/fnb/…):
  // nói thẳng, không im lặng "thành công" với 0 dòng.
  if (sample.length === 0) return { error: "pack_empty" };

  const before = await listServices(supabase);
  const { error } = await supabase.from("items").upsert(
    sample.map((s, i) => ({
      tenant_id: tenantId,
      kind: "service" as const,
      name: s.name.trim(),
      duration_minutes: s.duration_minutes,
      price_vnd: Math.min(Math.max(Math.trunc(s.price_vnd ?? 0), 0), SERVICE_PRICE_MAX),
      status: "active" as const,
      sort_order: Number.isInteger(s.sort_order) ? (s.sort_order as number) : i,
    })),
    { onConflict: "tenant_id,name", ignoreDuplicates: true },
  );
  if (error) return { error: mapDbError(error.message) };

  const after = await listServices(supabase);
  revalidateServices();
  return { error: null, services: after, inserted: after.length - before.length };
}
