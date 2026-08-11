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

  const { error } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("entity_type", "tenant")
    .eq("entity_id", tenantId)
    .is("deleted_at", null);
  if (error) return { error: "remove_failed" };

  revalidatePath("/app/settings/industry");
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
