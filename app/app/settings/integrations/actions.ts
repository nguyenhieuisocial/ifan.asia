"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { QUYEN_HOP_LE, sinhKhoa } from "@/lib/integrations/api-key";
import { LOAI_SU_KIEN } from "./types";

/**
 * Cài đặt → Tích hợp (V6 integrations, migration #160-161).
 *
 * QUYỀN: không siết thêm ở tầng này. RLS `api_keys_manage` và
 * `webhook_endpoints_manage` (đều owner/admin) đã đúng luật — thêm một lớp kiểm
 * nữa ở đây chỉ tạo ra hai nơi có thể LỆCH nhau khi một bên sửa mà bên kia quên.
 * Bù lại, MỌI thao tác ghi đều `.select()` rồi kiểm `data.length === 0`: RLS
 * chặn thì UPDATE không báo lỗi, chỉ chạm 0 dòng — không tự nhận ra thì màn
 * hình báo "đã lưu" trong khi chẳng lưu gì.
 */

type ActionResult = { error: string | null };

const DUONG = "/app/settings/integrations";

function loiGhi(message: string): string {
  if (/row-level security/i.test(message)) return "forbidden";
  if (/api_keys_key_hash_key/i.test(message)) return "trung_khoa";
  return "save_failed";
}

/**
 * `tenant_id` KHÔNG có default ở CSDL (migration #160) nên phải gửi tường minh.
 * `tenants_select` chỉ cho thấy đúng tiệm đang mở, nên `maybeSingle()` ở đây
 * luôn trả về một dòng — đúng khuôn `luuLuatTichDiem` của màn Ưu đãi.
 */
async function layTiemDangMo(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase.from("tenants").select("id").maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// ════════════════════════════════════════════════════════════════════
// KHOÁ API
// ════════════════════════════════════════════════════════════════════

const khoaSchema = z.object({
  name: z.string().trim().min(1, "thieu_ten").max(100, "ten_qua_dai"),
  // Ít nhất MỘT quyền: khoá không quyền nào thì gọi API nào cũng bị từ chối —
  // tạo ra nó chỉ để lát nữa người dùng ngồi đoán vì sao khoá "không chạy".
  // Đây KHÔNG mâu thuẫn với quyết định 2 (không có nút "cho tất cả"): mặc định
  // vẫn là không tick gì, người dùng phải bật từng quyền một.
  scopes: z.array(z.enum(QUYEN_HOP_LE)).min(1, "thieu_quyen"),
});

/**
 * Tạo khoá. Trả BẢN GỐC đúng một lần cho lời gọi này — CSDL chỉ nhận bản băm,
 * nên đây là lần duy nhất trong đời khoá có ai đọc được nó (quyết định 1).
 */
export async function taoKhoa(
  name: string,
  scopes: string[],
): Promise<{ error: string | null; khoaGoc: string | null }> {
  const parsed = khoaSchema.safeParse({
    name,
    scopes: Array.from(new Set(scopes)),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid_input", khoaGoc: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated", khoaGoc: null };

  const tenantId = await layTiemDangMo(supabase);
  if (!tenantId) return { error: "no_tenant", khoaGoc: null };

  const khoa = sinhKhoa();
  const { error } = await supabase.from("api_keys").insert({
    tenant_id: tenantId,
    name: parsed.data.name,
    key_hash: khoa.hash,
    key_prefix: khoa.tienTo,
    key_suffix: khoa.hauTo,
    scopes: parsed.data.scopes,
    created_by: user.id,
  });
  if (error) return { error: loiGhi(error.message), khoaGoc: null };

  revalidatePath(DUONG);
  return { error: null, khoaGoc: khoa.khoaGoc };
}

/**
 * Thu hồi. KHÔNG xoá dòng: khoá đã từng gọi bao nhiêu lượt là sự thật lịch sử,
 * và giữ bản băm lại còn chặn được chuyện một khoá đã lộ tình cờ được sinh lại.
 */
export async function thuHoiKhoa(id: string): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "forbidden" };

  revalidatePath(DUONG);
  return { error: null };
}

// ════════════════════════════════════════════════════════════════════
// ĐƯỜNG BÁO RA (webhook)
// ════════════════════════════════════════════════════════════════════

const duongBaoSchema = z.object({
  name: z.string().trim().min(1, "thieu_ten").max(100, "ten_qua_dai"),
  url: z
    .url("url_khong_hop_le")
    // Chỉ HTTPS, khớp đúng check constraint của CSDL. Tin gửi ra mang dữ liệu
    // khách hàng — http trần là gửi hồ sơ khách qua đường ai đọc cũng được.
    .refine((u) => u.startsWith("https://"), "url_khong_https")
    .refine((u) => u.length <= 500, "url_qua_dai"),
  eventTypes: z.array(z.enum(LOAI_SU_KIEN)).min(1, "thieu_su_kien"),
});

export async function taoDuongBao(
  name: string,
  url: string,
  eventTypes: string[],
): Promise<ActionResult> {
  const parsed = duongBaoSchema.safeParse({
    name,
    url: url.trim(),
    eventTypes: Array.from(new Set(eventTypes)),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const tenantId = await layTiemDangMo(supabase);
  if (!tenantId) return { error: "no_tenant" };

  const { error } = await supabase.from("webhook_endpoints").insert({
    tenant_id: tenantId,
    name: parsed.data.name,
    url: parsed.data.url,
    // Bí mật để KÝ từng tin: bên nhận đối chiếu chữ ký mới biết tin đến thật từ
    // iFan, chứ không phải ai đó biết địa chỉ rồi gửi bừa vào.
    secret: randomBytes(24).toString("base64url"),
    event_types: parsed.data.eventTypes,
    created_by: user.id,
  });
  if (error) return { error: loiGhi(error.message) };

  revalidatePath(DUONG);
  return { error: null };
}

export async function doiTrangThaiDuongBao(
  id: string,
  status: "active" | "paused",
): Promise<ActionResult> {
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(["active", "paused"]) })
    .safeParse({ id, status });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "forbidden" };

  revalidatePath(DUONG);
  return { error: null };
}

/**
 * "Thử lại ngay" — bên nhận vừa được sửa xong, chủ tiệm không phải ngồi đợi hết
 * nhịp giãn dần.
 *
 * ĐI QUA RPC, không UPDATE thẳng. Lý do: `webhook_deliveries` bật RLS và CHỈ có
 * policy SELECT (ghi là việc của worker chạy service role — đúng chủ đích). Bản
 * đầu update thẳng nên chạm 0 dòng và KHÔNG báo lỗi: nút bấm được, trông như đã
 * làm gì đó, mà hàng đợi không nhúc nhích. Đã chữa bằng `webhook_gui_lai`
 * (migration #164) — hàm tự kiểm tiệm + vai, thay vì mở một policy UPDATE rộng
 * cho phép mọi chỗ khác ghi thẳng vào hàng đợi.
 *
 * Trả về SỐ TIN sẽ được gửi lại để màn hình nói ra con số thật.
 */
export async function guiThuLai(endpointId: string): Promise<ActionResult & { soTin?: number }> {
  const parsed = z.uuid().safeParse(endpointId);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("webhook_gui_lai", {
    p_endpoint_id: parsed.data,
  });
  if (error) {
    if (/forbidden/i.test(error.message)) return { error: "forbidden" };
    if (/endpoint_not_found/i.test(error.message)) return { error: "khong_tim_thay" };
    return { error: loiGhi(error.message) };
  }

  revalidatePath(DUONG);
  return { error: null, soTin: Number(data ?? 0) };
}
