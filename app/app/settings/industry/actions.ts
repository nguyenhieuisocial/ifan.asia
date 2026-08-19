"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";

type ActionResult = { error: string | null };

/** Logo tiệm (thẻ design tep-dinh-kem.html, nhóm 3/4) — bảng attachments dùng chung, hợp đồng 24k. */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Owner/admin của tiệm hiện tại — logo chỉ owner/admin sửa được (đúng luật màn industry, xem access.ts). */
async function requireOwnerAdmin(): Promise<
  | { supabase: Awaited<ReturnType<typeof createClient>>; tenantId: string; userId: string }
  | { error: string }
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
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    return { error: "forbidden" };
  }
  if (!tenant) return { error: "not_found" };

  return { supabase, tenantId: tenant.id as string, userId: user.id };
}

/**
 * Tải logo mới — chỉ 1 logo active tại 1 thời điểm (đúng ghi chú thẻ design nhóm
 * 4): xoá MỀM mọi bản ghi attachments cũ (entity_type='tenant') trước khi ghi
 * bản mới. File thật của bản cũ KHÔNG xoá (bất biến 11 — xoá mềm, không xoá cứng).
 */
export async function uploadTenantLogo(file: File): Promise<ActionResult> {
  const auth = await requireOwnerAdmin();
  if ("error" in auth) return auth;
  const { supabase, tenantId, userId } = auth;

  const ext = ALLOWED_IMAGE_EXT[file.type];
  if (!ext || file.size > LOGO_MAX_BYTES) return { error: "invalid_file" };

  const path = `${tenantId}/branding/logo-${randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("tenant-files")
    .upload(path, file, { contentType: file.type });
  if (uploadError) return { error: "upload_failed" };

  const { error: purgeError } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("entity_type", "tenant")
    .eq("entity_id", tenantId)
    .is("deleted_at", null);
  if (purgeError) return { error: "save_failed" };

  const { error: insertError } = await supabase.from("attachments").insert({
    tenant_id: tenantId,
    entity_type: "tenant",
    entity_id: tenantId,
    path,
    content_type: file.type,
    size_bytes: file.size,
    uploaded_by: userId,
  });
  if (insertError) return { error: "save_failed" };

  revalidatePath("/app/settings/industry");
  return { error: null };
}

/** Gỡ logo đang dùng — xoá MỀM bản ghi active, không đụng file thật trong storage (bất biến 11). */
export async function removeTenantLogo(): Promise<ActionResult> {
  const auth = await requireOwnerAdmin();
  if ("error" in auth) return auth;
  const { supabase, tenantId } = auth;

  const { data: daGo, error } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("entity_type", "tenant")
    .eq("entity_id", tenantId)
    .is("deleted_at", null)
    .select("id");
  if (error) return { error: "remove_failed" };
  // 0 dòng = KHÔNG có logo nào đang dùng để gỡ (người khác vừa gỡ, hoặc chưa
  // từng tải lên). `requireOwnerAdmin` đã chặn vai Chỉ xem — vai duy nhất mà
  // phép đo 20/08 cho thấy ĐỌC được tệp đính kèm mà sửa ra 0 dòng im lặng.
  if (!daGo?.length) return { error: "remove_failed" };

  revalidatePath("/app/settings/industry");
  return { error: null };
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/**
 * Đổi tên hiển thị + định danh (@slug) của tiệm. Trước bản này KHÔNG có màn
 * nào sửa được — tên đặt một lần lúc tạo tiệm (onboarding) là dính vĩnh viễn.
 * Founder từng bị kẹt với tên tiệm test đặt lúc mới dựng hệ thống, tưởng là
 * rò rỉ dữ liệu giữa 2 dự án — thật ra chỉ là thiếu chỗ tự sửa. slug không
 * còn dùng để đăng nhập/định tuyến (migration #68, bỏ ô Mã tiệm) nên đổi an
 * toàn, không vỡ đường link nào.
 */
export async function renameTenant(input: {
  name: string;
  slug: string;
}): Promise<ActionResult> {
  const auth = await requireOwnerAdmin();
  if ("error" in auth) return auth;
  const { supabase, tenantId } = auth;

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (name.length < 1 || name.length > 120) return { error: "invalid_name" };
  if (!SLUG_RE.test(slug)) return { error: "invalid_slug" };

  const { data: daDoi, error } = await supabase
    .from("tenants")
    .update({ name, slug })
    .eq("id", tenantId)
    .select("id");
  if (error) {
    return { error: error.code === "23505" ? "slug_taken" : "save_failed" };
  }
  // `tenants_update` chỉ mở cho owner/admin, còn `tenants_select` mở cho MỌI
  // vai — đo 20/08: quản lý/nhân viên/chỉ-xem đọc được hàng tiệm (1 dòng) mà
  // sửa ra 0 dòng, KHÔNG lỗi. Cổng vai ở trên (`requireOwnerAdmin`) là BẢN SAO
  // của luật CSDL; hai bản sao rồi sẽ lệch nhau, phép đếm dòng này là thứ duy
  // nhất bắt được lúc chúng lệch.
  if (!daDoi?.length) return { error: "save_failed" };

  revalidatePath("/app/settings/industry");
  revalidatePath("/app", "layout");
  return { error: null };
}

/** URL logo đang active (ký riêng, bucket private tenant-files) — null nếu tiệm chưa có logo. */
export async function getTenantLogoUrl(supabase: SupabaseClient): Promise<string | null> {
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return null;

  const { data: logo } = await supabase
    .from("attachments")
    .select("path")
    .eq("entity_type", "tenant")
    .eq("entity_id", tenant.id as string)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!logo) return null;

  const { data: signed } = await supabase.storage
    .from("tenant-files")
    .createSignedUrl(logo.path as string, 3600);
  return signed?.signedUrl ?? null;
}

/** Ba từ mà pack ngành đặt tên hộ — xem `industry_packs.content->terminology`. */
export type TuVungRieng = {
  contact: string;
  deal: string;
  dealWon: string;
};

/**
 * Lưu TỪ VỰNG RIÊNG của tiệm (việc #183).
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ HÀM NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Bảng `tenant_pack_overrides` dựng từ 11/08 và `tenant_pack_view()` CÓ đọc nó
 * để đè lên pack gốc. Nhưng đo 19/08: **0 chỗ nào trong kho ghi vào bảng đó** —
 * tính năng "tiệm tự sửa từ vựng ngành" có móng mà không có cửa vào.
 *
 * ⚠️ ĐIỂM DỄ SAI: `tenant_pack_view()` trộn bằng `||` — đó là phép đè ở TẦNG
 * TRÊN CÙNG của JSON, không phải trộn sâu. Ghi `{terminology: {contact: "..."}}`
 * sẽ THAY CẢ CỤM terminology, làm mất `deal` và `deal_won`. Nên ở đây luôn ghi
 * ĐỦ BA từ, kể cả từ người dùng không sửa.
 */
export async function luuTuVungRieng(input: TuVungRieng): Promise<ActionResult> {
  const sach = {
    contact: input.contact.trim(),
    deal: input.deal.trim(),
    deal_won: input.dealWon.trim(),
  };
  // Bỏ trống một từ là màn hình mất nhãn — chặn ở đây cho người dùng đọc được
  // câu tiếng Việt, RLS không biết luật này.
  if (!sach.contact || !sach.deal || !sach.deal_won) return { error: "invalid_input" };
  if (Object.values(sach).some((v) => v.length > 40)) return { error: "too_long" };

  const ctx = await requireOwnerAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, tenantId } = ctx;

  const { data: cu } = await supabase
    .from("tenant_pack_overrides")
    .select("overrides")
    .maybeSingle();
  const overrides = { ...((cu?.overrides ?? {}) as Record<string, unknown>), terminology: sach };

  const { error } = await supabase
    .from("tenant_pack_overrides")
    .upsert({ tenant_id: tenantId, overrides }, { onConflict: "tenant_id" });
  if (error) return { error: "failed" };

  // Nhãn này xuất hiện ở nav, tiêu đề màn và nhiều chỗ khác — làm mới cả khu.
  revalidatePath("/app", "layout");
  return { error: null };
}

/** Trả về từ vựng MẶC ĐỊNH của pack ngành — bỏ hẳn phần tiệm tự sửa. */
export async function boTuVungRieng(): Promise<ActionResult> {
  const ctx = await requireOwnerAdmin();
  if ("error" in ctx) return { error: ctx.error };
  const { supabase, tenantId } = ctx;

  const { data: cu } = await supabase
    .from("tenant_pack_overrides")
    .select("overrides")
    .maybeSingle();
  const overrides = { ...((cu?.overrides ?? {}) as Record<string, unknown>) };
  delete overrides.terminology;

  const { error } = await supabase
    .from("tenant_pack_overrides")
    .upsert({ tenant_id: tenantId, overrides }, { onConflict: "tenant_id" });
  if (error) return { error: "failed" };

  revalidatePath("/app", "layout");
  return { error: null };
}
