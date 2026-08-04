"use server";

import { revalidatePath } from "next/cache";
import { emitEvent } from "@/lib/events";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "./types";

/**
 * Quy ước: error là chuỗi đã dịch theo locale hiện tại, hiển thị thẳng cho
 * người dùng (client toast res.error, không cần map mã lỗi).
 * Message zod = key trong messages/<locale>.json namespace "contacts.errors".
 */
type ActionResult = { error: string | null };

const contactInputSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "nameRequired")
    .max(120, "nameTooLong"),
  phone: z
    .string()
    .trim()
    .max(20, "phoneTooLong")
    .transform((v) => normalizePhone(v))
    .refine((v) => v === "" || /^0\d{9,10}$/.test(v), "phoneInvalid"),
  email: z
    .string()
    .trim()
    .max(254, "emailTooLong")
    .refine((v) => v === "" || z.email().safeParse(v).success, "emailInvalid"),
  sourceId: z.uuid().nullable(),
});

export type ContactInput = z.input<typeof contactInputSchema>;

/** SĐT hợp lệ dạng 0xxx → chuẩn E.164 +84xxx (cột dedupe phone_e164). */
function toE164(phone: string): string | null {
  return /^0\d{9,10}$/.test(phone) ? `+84${phone.slice(1)}` : null;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createContact(
  input: ContactInput & { firstNote?: string },
): Promise<ActionResult & { id?: string }> {
  const t = await getTranslations("contacts.errors");
  const parsed = contactInputSchema
    .extend({ firstNote: z.string().trim().max(4000, "noteTooLong").optional() })
    .safeParse(input);
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "invalidData") };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .maybeSingle();
  if (!tenant) return { error: t("tenantNotFound") };

  const { fullName, phone, email, sourceId, firstNote } = parsed.data;
  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({
      tenant_id: tenant.id,
      full_name: fullName,
      phone: phone || null,
      phone_e164: toE164(phone),
      email: email || null,
      source_id: sourceId,
      owner_id: user.id, // staff RLS: người tạo tự phụ trách
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !contact) return { error: t("createFailed") };

  await emitEvent(supabase, {
    type: "contact.created",
    aggregateType: "contact",
    aggregateId: contact.id as string,
    payload: { source_id: sourceId ?? null, channel: "crm" },
  });

  if (firstNote) {
    // Ghi chú đầu tiên thất bại không chặn việc tạo khách — bỏ qua lỗi
    await supabase.from("activities").insert({
      tenant_id: tenant.id,
      type: "note",
      body: firstNote,
      contact_id: contact.id,
      owner_id: user.id,
    });
  }

  revalidatePath("/app/contacts");
  return { error: null, id: contact.id as string };
}

export async function updateContact(
  contactId: string,
  input: ContactInput,
): Promise<ActionResult> {
  const t = await getTranslations("contacts.errors");
  const idParsed = z.uuid().safeParse(contactId);
  const parsed = contactInputSchema.safeParse(input);
  if (!idParsed.success) return { error: t("invalidContact") };
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "invalidData") };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { fullName, phone, email, sourceId } = parsed.data;
  // Đọc giá trị cũ để tính changed_fields cho event (RLS đã giới hạn tenant/quyền)
  const { data: before } = await supabase
    .from("contacts")
    .select("full_name, phone, email, source_id")
    .eq("id", idParsed.data)
    .maybeSingle();

  const { error } = await supabase
    .from("contacts")
    .update({
      full_name: fullName,
      phone: phone || null,
      phone_e164: toE164(phone),
      email: email || null,
      source_id: sourceId,
    })
    .eq("id", idParsed.data);
  if (error) return { error: t("updateFailed") };

  if (before) {
    const next: Record<string, string | null> = {
      full_name: fullName,
      phone: phone || null,
      email: email || null,
      source_id: sourceId ?? null,
    };
    const changed = Object.keys(next).filter(
      (k) => (before as Record<string, string | null>)[k] !== next[k],
    );
    if (changed.length > 0) {
      await emitEvent(supabase, {
        type: "contact.updated",
        aggregateType: "contact",
        aggregateId: idParsed.data,
        payload: { changed_fields: changed },
      });
    }
  }

  revalidatePath("/app/contacts");
  revalidatePath(`/app/contacts/${idParsed.data}`);
  return { error: null };
}

// Khớp check constraint contacts.tier trong migration gd1_crm_inbox_core
const tierSchema = z.enum(["new", "regular", "vip", "dormant"]);

/** Đổi phân hạng khách (Mới · Quen · VIP · Nguội) — RLS giới hạn theo tenant/quyền. */
export async function updateContactTier(
  contactId: string,
  tier: string,
): Promise<ActionResult> {
  const t = await getTranslations("contacts.errors");
  const idParsed = z.uuid().safeParse(contactId);
  const tierParsed = tierSchema.safeParse(tier);
  if (!idParsed.success) return { error: t("invalidContact") };
  if (!tierParsed.success) return { error: t("invalidData") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { data: before } = await supabase
    .from("contacts")
    .select("tier")
    .eq("id", idParsed.data)
    .maybeSingle();

  const { error } = await supabase
    .from("contacts")
    .update({ tier: tierParsed.data })
    .eq("id", idParsed.data);
  if (error) return { error: t("updateFailed") };

  // catalog: contact.tier_changed (old_tier, new_tier) — consumer chăm-lại/báo cáo
  if (before && before.tier !== tierParsed.data) {
    await emitEvent(supabase, {
      type: "contact.tier_changed",
      aggregateType: "contact",
      aggregateId: idParsed.data,
      payload: { old_tier: before.tier, new_tier: tierParsed.data },
    });
  }

  revalidatePath("/app/contacts");
  revalidatePath(`/app/contacts/${idParsed.data}`);
  return { error: null };
}

/** Xóa mềm: set deleted_at — mọi query danh sách/chi tiết đã loại trừ. */
export async function softDeleteContact(contactId: string): Promise<ActionResult> {
  const t = await getTranslations("contacts.errors");
  const idParsed = z.uuid().safeParse(contactId);
  if (!idParsed.success) return { error: t("invalidContact") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", idParsed.data);
  if (error) return { error: t("deleteFailed") };

  revalidatePath("/app/contacts");
  return { error: null };
}

/** Thêm thẻ theo tên: tìm thẻ sẵn có (không phân biệt hoa thường), chưa có thì tạo. */
export async function addTagToContact(
  contactId: string,
  name: string,
): Promise<ActionResult> {
  const t = await getTranslations("contacts.errors");
  const parsed = z
    .object({
      contactId: z.uuid(),
      name: z
        .string()
        .trim()
        .min(1, "tagNameRequired")
        .max(50, "tagNameTooLong"),
    })
    .safeParse({ contactId, name });
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "invalidData") };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, tenant_id")
    .eq("id", parsed.data.contactId)
    .maybeSingle();
  if (!contact) return { error: t("contactNotFound") };

  // ilike không wildcard = so khớp chính xác không phân biệt hoa thường
  const { data: existing } = await supabase
    .from("tags")
    .select("id")
    .ilike("name", parsed.data.name.replace(/[%_]/g, "\\$&"))
    .maybeSingle();

  let tagId = existing?.id as string | undefined;
  if (!tagId) {
    const { data: created, error: createError } = await supabase
      .from("tags")
      .insert({ tenant_id: contact.tenant_id, name: parsed.data.name })
      .select("id")
      .single();
    if (createError || !created) {
      // tags_manage RLS: staff không được tạo thẻ mới
      return { error: t("tagCreateDenied") };
    }
    tagId = created.id as string;
  }

  const { error } = await supabase.from("contact_tags").upsert(
    { tenant_id: contact.tenant_id, contact_id: contact.id, tag_id: tagId },
    { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
  );
  if (error) return { error: t("tagAttachFailed") };

  revalidatePath("/app/contacts");
  revalidatePath(`/app/contacts/${contact.id}`);
  return { error: null };
}

export async function removeTagFromContact(
  contactId: string,
  tagId: string,
): Promise<ActionResult> {
  const t = await getTranslations("contacts.errors");
  const parsed = z
    .object({ contactId: z.uuid(), tagId: z.uuid() })
    .safeParse({ contactId, tagId });
  if (!parsed.success) return { error: t("invalidData") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { error } = await supabase
    .from("contact_tags")
    .delete()
    .eq("contact_id", parsed.data.contactId)
    .eq("tag_id", parsed.data.tagId);
  if (error) return { error: t("tagRemoveFailed") };

  revalidatePath("/app/contacts");
  revalidatePath(`/app/contacts/${parsed.data.contactId}`);
  return { error: null };
}

const activitySchema = z
  .object({
    type: z.enum(["note", "call", "meeting", "task"]),
    content: z
      .string()
      .trim()
      .min(1, "contentRequired")
      .max(4000, "contentTooLong"),
    dueAt: z.iso.datetime().optional(),
  })
  .refine((v) => v.type !== "task" || v.dueAt, {
    message: "taskDueRequired",
  });

export async function addActivity(
  contactId: string,
  input: { type: "note" | "call" | "meeting" | "task"; content: string; dueAt?: string },
): Promise<ActionResult> {
  const t = await getTranslations("contacts.errors");
  const idParsed = z.uuid().safeParse(contactId);
  const parsed = activitySchema.safeParse(input);
  if (!idParsed.success) return { error: t("invalidContact") };
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "invalidData") };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, tenant_id")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (!contact) return { error: t("contactNotFound") };

  const { error } = await supabase.from("activities").insert({
    tenant_id: contact.tenant_id,
    type: parsed.data.type,
    body: parsed.data.content,
    contact_id: contact.id,
    owner_id: user.id, // staff RLS: người ghi tự phụ trách
    due_at: parsed.data.dueAt ?? null,
  });
  if (error) return { error: t("activityFailed") };

  revalidatePath(`/app/contacts/${contact.id}`);
  return { error: null };
}

export async function toggleActivityDone(
  activityId: string,
  done: boolean,
): Promise<ActionResult> {
  const t = await getTranslations("contacts.errors");
  const parsed = z
    .object({ activityId: z.uuid(), done: z.boolean() })
    .safeParse({ activityId, done });
  if (!parsed.success) return { error: t("invalidData") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { data: updated, error } = await supabase
    .from("activities")
    .update({ done_at: parsed.data.done ? new Date().toISOString() : null })
    .eq("id", parsed.data.activityId)
    .select("contact_id")
    .maybeSingle();
  if (error || !updated) return { error: t("toggleFailed") };

  if (updated.contact_id) revalidatePath(`/app/contacts/${updated.contact_id}`);
  return { error: null };
}
