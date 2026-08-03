"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "./types";

/**
 * Quy ước: error là chuỗi tiếng Việt hiển thị thẳng cho người dùng
 * (client toast res.error, không cần map mã lỗi).
 */
type ActionResult = { error: string | null };

const contactInputSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập tên khách")
    .max(120, "Tên khách tối đa 120 ký tự"),
  phone: z
    .string()
    .trim()
    .max(20, "Số điện thoại quá dài")
    .transform((v) => normalizePhone(v))
    .refine(
      (v) => v === "" || /^0\d{9,10}$/.test(v),
      "Số điện thoại không hợp lệ (dạng 0xxxxxxxxx)",
    ),
  email: z
    .string()
    .trim()
    .max(254, "Email quá dài")
    .refine(
      (v) => v === "" || z.email().safeParse(v).success,
      "Email không hợp lệ",
    ),
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
  const parsed = contactInputSchema
    .extend({ firstNote: z.string().trim().max(4000, "Ghi chú tối đa 4000 ký tự").optional() })
    .safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Phiên đăng nhập hết hạn, tải lại trang" };

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .maybeSingle();
  if (!tenant) return { error: "Không tìm thấy doanh nghiệp của bạn" };

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
  if (error || !contact) return { error: "Không tạo được khách hàng, thử lại" };

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
  const idParsed = z.uuid().safeParse(contactId);
  const parsed = contactInputSchema.safeParse(input);
  if (!idParsed.success) return { error: "Khách hàng không hợp lệ" };
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Phiên đăng nhập hết hạn, tải lại trang" };

  const { fullName, phone, email, sourceId } = parsed.data;
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
  if (error) return { error: "Không lưu được thay đổi, thử lại" };

  revalidatePath("/app/contacts");
  revalidatePath(`/app/contacts/${idParsed.data}`);
  return { error: null };
}

/** Xóa mềm: set deleted_at — mọi query danh sách/chi tiết đã loại trừ. */
export async function softDeleteContact(contactId: string): Promise<ActionResult> {
  const idParsed = z.uuid().safeParse(contactId);
  if (!idParsed.success) return { error: "Khách hàng không hợp lệ" };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Phiên đăng nhập hết hạn, tải lại trang" };

  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", idParsed.data);
  if (error) return { error: "Không xóa được khách hàng, thử lại" };

  revalidatePath("/app/contacts");
  return { error: null };
}

/** Thêm thẻ theo tên: tìm thẻ sẵn có (không phân biệt hoa thường), chưa có thì tạo. */
export async function addTagToContact(
  contactId: string,
  name: string,
): Promise<ActionResult> {
  const parsed = z
    .object({
      contactId: z.uuid(),
      name: z
        .string()
        .trim()
        .min(1, "Vui lòng nhập tên thẻ")
        .max(50, "Tên thẻ tối đa 50 ký tự"),
    })
    .safeParse({ contactId, name });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Phiên đăng nhập hết hạn, tải lại trang" };

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, tenant_id")
    .eq("id", parsed.data.contactId)
    .maybeSingle();
  if (!contact) return { error: "Không tìm thấy khách hàng" };

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
      return { error: "Không tạo được thẻ mới (cần quyền quản lý)" };
    }
    tagId = created.id as string;
  }

  const { error } = await supabase.from("contact_tags").upsert(
    { tenant_id: contact.tenant_id, contact_id: contact.id, tag_id: tagId },
    { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
  );
  if (error) return { error: "Không gắn được thẻ, thử lại" };

  revalidatePath("/app/contacts");
  revalidatePath(`/app/contacts/${contact.id}`);
  return { error: null };
}

export async function removeTagFromContact(
  contactId: string,
  tagId: string,
): Promise<ActionResult> {
  const parsed = z
    .object({ contactId: z.uuid(), tagId: z.uuid() })
    .safeParse({ contactId, tagId });
  if (!parsed.success) return { error: "Dữ liệu không hợp lệ" };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Phiên đăng nhập hết hạn, tải lại trang" };

  const { error } = await supabase
    .from("contact_tags")
    .delete()
    .eq("contact_id", parsed.data.contactId)
    .eq("tag_id", parsed.data.tagId);
  if (error) return { error: "Không gỡ được thẻ, thử lại" };

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
      .min(1, "Vui lòng nhập nội dung")
      .max(4000, "Nội dung tối đa 4000 ký tự"),
    dueAt: z.iso.datetime().optional(),
  })
  .refine((v) => v.type !== "task" || v.dueAt, {
    message: "Chọn hạn hoàn thành cho việc cần làm",
  });

export async function addActivity(
  contactId: string,
  input: { type: "note" | "call" | "meeting" | "task"; content: string; dueAt?: string },
): Promise<ActionResult> {
  const idParsed = z.uuid().safeParse(contactId);
  const parsed = activitySchema.safeParse(input);
  if (!idParsed.success) return { error: "Khách hàng không hợp lệ" };
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Phiên đăng nhập hết hạn, tải lại trang" };

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, tenant_id")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (!contact) return { error: "Không tìm thấy khách hàng" };

  const { error } = await supabase.from("activities").insert({
    tenant_id: contact.tenant_id,
    type: parsed.data.type,
    body: parsed.data.content,
    contact_id: contact.id,
    owner_id: user.id, // staff RLS: người ghi tự phụ trách
    due_at: parsed.data.dueAt ?? null,
  });
  if (error) return { error: "Không lưu được hoạt động, thử lại" };

  revalidatePath(`/app/contacts/${contact.id}`);
  return { error: null };
}

export async function toggleActivityDone(
  activityId: string,
  done: boolean,
): Promise<ActionResult> {
  const parsed = z
    .object({ activityId: z.uuid(), done: z.boolean() })
    .safeParse({ activityId, done });
  if (!parsed.success) return { error: "Dữ liệu không hợp lệ" };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Phiên đăng nhập hết hạn, tải lại trang" };

  const { data: updated, error } = await supabase
    .from("activities")
    .update({ done_at: parsed.data.done ? new Date().toISOString() : null })
    .eq("id", parsed.data.activityId)
    .select("contact_id")
    .maybeSingle();
  if (error || !updated) return { error: "Không cập nhật được, thử lại" };

  if (updated.contact_id) revalidatePath(`/app/contacts/${updated.contact_id}`);
  return { error: null };
}
