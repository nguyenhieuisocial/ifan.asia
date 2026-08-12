"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Quản lý nhãn khách (V1b bước 5-6, mục 36.8-3): tạo/sửa/xoá/gộp. RLS
 * tags_manage đã chặn tới owner/admin/manager — action ở đây chỉ validate
 * đầu vào + dịch lỗi, không lặp lại kiểm vai (trừ merge/undo dùng RPC riêng,
 * có mã lỗi 42501 tách bạch để hiện đúng thông báo "cần quyền").
 */
type ActionResult = { error: string | null };

const INSUFFICIENT_PRIVILEGE = "42501";
const UNIQUE_VIOLATION = "23505";

const nameSchema = z
  .string()
  .trim()
  .min(1, "tagNameRequired")
  .max(50, "tagNameTooLong");

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createTag(name: string, color: string | null): Promise<ActionResult> {
  const t = await getTranslations("settings.tags.errors");
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: t(parsed.error.issues[0]?.message ?? "invalidData") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: t("tenantNotFound") };

  const { error } = await supabase
    .from("tags")
    .insert({ tenant_id: tenant.id, name: parsed.data, color: color || null });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: t("duplicateName") };
    return { error: t("createFailed") };
  }
  revalidatePath("/app/settings/tags");
  return { error: null };
}

export async function renameTag(tagId: string, name: string): Promise<ActionResult> {
  const t = await getTranslations("settings.tags.errors");
  const parsed = z.object({ tagId: z.uuid(), name: nameSchema }).safeParse({ tagId, name });
  if (!parsed.success) return { error: t("invalidData") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { error } = await supabase
    .from("tags")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.tagId);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: t("duplicateName") };
    return { error: t("renameFailed") };
  }
  revalidatePath("/app/settings/tags");
  revalidatePath("/app/contacts");
  return { error: null };
}

export async function recolorTag(tagId: string, color: string): Promise<ActionResult> {
  const t = await getTranslations("settings.tags.errors");
  const parsed = z
    .object({ tagId: z.uuid(), color: z.string().trim().min(1).max(20) })
    .safeParse({ tagId, color });
  if (!parsed.success) return { error: t("invalidData") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { error } = await supabase
    .from("tags")
    .update({ color: parsed.data.color })
    .eq("id", parsed.data.tagId);
  if (error) return { error: t("recolorFailed") };
  revalidatePath("/app/settings/tags");
  revalidatePath("/app/contacts");
  return { error: null };
}

/** Xoá mềm (bất biến 11) — set deleted_at, KHÔNG xoá contact_tags: nếu phục hồi thủ công qua CSDL thì lượt gắn vẫn còn nguyên. */
export async function deleteTag(tagId: string): Promise<ActionResult> {
  const t = await getTranslations("settings.tags.errors");
  const parsed = z.uuid().safeParse(tagId);
  if (!parsed.success) return { error: t("invalidData") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { error } = await supabase
    .from("tags")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data);
  if (error) return { error: t("deleteFailed") };
  revalidatePath("/app/settings/tags");
  revalidatePath("/app/contacts");
  return { error: null };
}

/** Gộp nhãn nguồn vào nhãn đích — mọi việc nặng nằm trong RPC merge_tags (migration #71). */
export async function mergeTagsAction(
  sourceTagId: string,
  targetTagId: string,
): Promise<ActionResult & { auditId?: number }> {
  const t = await getTranslations("settings.tags.errors");
  const parsed = z
    .object({ sourceTagId: z.uuid(), targetTagId: z.uuid() })
    .refine((v) => v.sourceTagId !== v.targetTagId, { message: "invalidPair" })
    .safeParse({ sourceTagId, targetTagId });
  if (!parsed.success) return { error: t("invalidData") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { data, error } = await supabase.rpc("merge_tags", {
    p_source_tag_id: parsed.data.sourceTagId,
    p_target_tag_id: parsed.data.targetTagId,
  });
  if (error) {
    if (error.code === INSUFFICIENT_PRIVILEGE) return { error: t("forbidden") };
    return { error: t("mergeFailed") };
  }

  revalidatePath("/app/settings/tags");
  revalidatePath("/app/contacts");
  return { error: null, auditId: data as number };
}

/** Hoàn tác đúng một lượt gộp — nút "Hoàn tác" trên toast sau khi gộp thành công. */
export async function undoMergeTagsAction(auditId: number): Promise<ActionResult> {
  const t = await getTranslations("settings.tags.errors");
  const parsed = z.number().int().positive().safeParse(auditId);
  if (!parsed.success) return { error: t("invalidData") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { error } = await supabase.rpc("undo_merge_tags", { p_audit_id: parsed.data });
  if (error) {
    if (error.code === INSUFFICIENT_PRIVILEGE) return { error: t("forbidden") };
    return { error: t("undoFailed") };
  }
  revalidatePath("/app/settings/tags");
  revalidatePath("/app/contacts");
  return { error: null };
}
