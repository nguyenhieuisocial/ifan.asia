"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error: string | null };

/**
 * Quản lý mã QR theo kênh (migration #24).
 * RLS đã chặn ghi ngoài owner/admin/manager; server action vẫn tự verify auth +
 * role trước khi chạm DB (defense in depth) và trả key lỗi dịch được.
 */

const qrSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(80),
  sourceId: z.uuid(),
  // Chỉ nhận http/https — trang /q/<code> sẽ chuyển hướng tới đây
  targetUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => /^https?:\/\/.+/i.test(v), "url"),
});

const MANAGE_ROLES = ["owner", "admin", "manager"];

async function requireManager(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>>; tenantId: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role, tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || !MANAGE_ROLES.includes(member.role)) return { error: "forbidden" };
  return { supabase, tenantId: member.tenant_id as string };
}

function mapDbError(message: string): string {
  if (/duplicate|unique/i.test(message)) return "name_taken";
  if (/row-level security/i.test(message)) return "forbidden";
  return "save_failed";
}

/** Thêm (id=null) hoặc sửa một mã QR. `code` do DB tự sinh, không cho sửa. */
export async function saveQrCode(input: {
  id: string | null;
  name: string;
  sourceId: string;
  targetUrl: string;
}): Promise<ActionResult> {
  const parsed = qrSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues.some((i) => i.message === "url") ? "bad_url" : "invalid_input" };
  }

  const auth = await requireManager();
  if ("error" in auth) return auth;
  const { supabase, tenantId } = auth;
  const { id, name, sourceId, targetUrl } = parsed.data;

  const { error } = id
    ? await supabase
        .from("qr_codes")
        .update({ name, source_id: sourceId, target_url: targetUrl })
        .eq("id", id)
    : await supabase.from("qr_codes").insert({
        tenant_id: tenantId,
        name,
        source_id: sourceId,
        target_url: targetUrl,
      });
  if (error) return { error: mapDbError(error.message) };

  revalidatePath("/app/settings/qr");
  return { error: null };
}

/**
 * Tạo NGUỒN KHÁCH mới ngay trong màn mã QR.
 *
 * Vì sao không thêm nguồn mặc định lúc tạo tiệm: mã QR dán ở quầy, tờ rơi hay
 * bao bì — mỗi tiệm gọi tên một kiểu ("Tại tiệm", "Tờ rơi phường 5", "Hộp bánh
 * Tết"). Nhồi sẵn vài cái tên đoán mò vào mọi tiệm thì đa số vẫn không khớp,
 * lại làm dài danh sách. Cho tự đặt tên ngay tại chỗ đúng hơn: chủ tiệm khỏi
 * chọn bừa "Khác" và báo cáo nguồn → doanh thu đọc được ngay.
 *
 * `channel_type` để trống: mã QR có thể dẫn tới Zalo, website hay trang nào
 * khác — đoán bừa sẽ ghi sai dữ liệu. Chấm điểm khách dùng `quality_score`
 * (mặc định 50), không phụ thuộc cột này.
 */
export async function createLeadSource(
  name: string,
): Promise<{ error: string | null; source?: { id: string; name: string } }> {
  const parsed = z.string().trim().min(1).max(80).safeParse(name);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireManager();
  if ("error" in auth) return auth;

  const { data, error } = await auth.supabase
    .from("lead_sources")
    .insert({ tenant_id: auth.tenantId, name: parsed.data })
    .select("id, name")
    .single();
  if (error) return { error: mapDbError(error.message) };

  revalidatePath("/app/settings/qr");
  return { error: null, source: data };
}

/** Bật/tắt một mã. Tắt = trang /q/<code> báo "mã không còn dùng nữa". */
export async function setQrCodeActive(id: string, isActive: boolean): Promise<ActionResult> {
  const parsed = z.object({ id: z.uuid(), isActive: z.boolean() }).safeParse({ id, isActive });
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireManager();
  if ("error" in auth) return auth;

  const { error } = await auth.supabase
    .from("qr_codes")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.id);
  if (error) return { error: mapDbError(error.message) };

  revalidatePath("/app/settings/qr");
  return { error: null };
}

/**
 * Xóa hẳn một mã. Lượt quét đã ghi bị xóa theo (cascade) — nên UI hỏi lại và
 * gợi ý dùng nút Tắt nếu chỉ muốn ngừng dùng mà vẫn giữ số liệu.
 */
export async function deleteQrCode(id: string): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireManager();
  if ("error" in auth) return auth;

  const { error } = await auth.supabase.from("qr_codes").delete().eq("id", parsed.data);
  if (error) return { error: mapDbError(error.message) };

  revalidatePath("/app/settings/qr");
  return { error: null };
}
