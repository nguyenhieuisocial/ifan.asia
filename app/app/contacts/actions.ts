"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { findCompanyByDomain } from "../companies/queries";
import { workEmailDomain } from "../companies/types";
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
  companyId: z.uuid().nullable(),
  // Trường tự khai theo pack ngành (V1a — chỉ lưu + hiện trên hồ sơ, mục 35.2
  // bước 4). Trần 500 ký tự/giá trị chặn nhập bậy, không phải luật nghiệp vụ.
  custom: z.record(z.string(), z.string().max(500)).optional(),
});

export type ContactInput = z.input<typeof contactInputSchema>;

/** SĐT hợp lệ dạng 0xxx → chuẩn E.164 +84xxx (cột dedupe phone_e164). */
function toE164(phone: string): string | null {
  return /^0\d{9,10}$/.test(phone) ? `+84${phone.slice(1)}` : null;
}

type CompanyLink = { companyId: string; method: "manual" | "auto_domain" };

/**
 * Tự động nối công ty theo đuôi email CÔNG VIỆC (an@spaxinh.vn → công ty có
 * domain spaxinh.vn). Hộp thư miễn phí (gmail…) không suy ra công ty nào.
 * Chưa có công ty khớp thì KHÔNG tự tạo — hồ sơ khách sẽ hiện gợi ý một chạm.
 */
async function autoLinkByDomain(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
): Promise<CompanyLink | null> {
  const domain = workEmailDomain(email);
  if (!domain) return null;
  const company = await findCompanyByDomain(supabase, domain);
  return company ? { companyId: company.id, method: "auto_domain" } : null;
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

  const { fullName, phone, email, sourceId, companyId, firstNote, custom } = parsed.data;
  // Người dùng chọn tay thì tôn trọng lựa chọn; bỏ trống mới xét đuôi email
  const link: CompanyLink | null = companyId
    ? { companyId, method: "manual" }
    : await autoLinkByDomain(supabase, email);

  // contact.created + contact.company_linked do trigger DB phát (migration #15);
  // client này chỉ gửi kèm cách nối công ty để payload giữ đúng hình dạng catalog.
  const writer = link ? await createClient({ linkMethod: link.method }) : supabase;
  const { data: contact, error } = await writer
    .from("contacts")
    .insert({
      tenant_id: tenant.id,
      full_name: fullName,
      phone: phone || null,
      phone_e164: toE164(phone),
      email: email || null,
      source_id: sourceId,
      company_id: link?.companyId ?? null,
      owner_id: user.id, // staff RLS: người tạo tự phụ trách
      created_by: user.id,
      custom: custom ?? {},
    })
    .select("id")
    .single();
  if (error || !contact) return { error: t("createFailed") };

  if (firstNote) {
    // Ghi chú đầu tiên thất bại không chặn việc tạo khách — bỏ qua lỗi
    await supabase.from("activities").insert({
      tenant_id: tenant.id,
      type: "note",
      body: firstNote,
      contact_id: contact.id,
      owner_id: user.id,
      done_at: new Date().toISOString(), // ghi chú là nhật ký đã xảy ra, không phải việc chờ (B10)
    });
  }

  revalidatePath("/app/contacts");
  if (link) revalidatePath("/app/companies"); // số khách của công ty đổi
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

  const { fullName, phone, email, sourceId, companyId, custom } = parsed.data;
  // Đọc công ty hiện tại để quyết định luật nối bên dưới (changed_fields của
  // contact.updated do trigger DB tự tính từ OLD/NEW — migration #15); đọc
  // luôn custom hiện có để MERGE, không ghi đè mất field khác (mục 35.2 bước 4)
  const { data: before } = await supabase
    .from("contacts")
    .select("company_id, custom")
    .eq("id", idParsed.data)
    .maybeSingle();

  /*
   * Luật nối công ty khi sửa khách:
   *  - chọn tay  → dùng lựa chọn đó (method "manual" nếu khác trước đó);
   *  - để trống mà khách ĐANG có công ty → tôn trọng việc gỡ, KHÔNG nối lại;
   *  - để trống và khách chưa có công ty → thử nối theo đuôi email công việc.
   */
  let nextCompanyId: string | null = companyId;
  let link: CompanyLink | null = null;
  if (companyId) {
    if (companyId !== before?.company_id) {
      link = { companyId, method: "manual" };
    }
  } else if (!before?.company_id) {
    link = await autoLinkByDomain(supabase, email);
    nextCompanyId = link?.companyId ?? null;
  }

  const writer = link ? await createClient({ linkMethod: link.method }) : supabase;
  const { error } = await writer
    .from("contacts")
    .update({
      full_name: fullName,
      phone: phone || null,
      phone_e164: toE164(phone),
      email: email || null,
      source_id: sourceId,
      company_id: nextCompanyId,
      ...(custom !== undefined
        ? { custom: { ...((before?.custom as Record<string, string> | null) ?? {}), ...custom } }
        : {}),
    })
    .eq("id", idParsed.data);
  if (error) return { error: t("updateFailed") };

  revalidatePath("/app/contacts");
  revalidatePath(`/app/contacts/${idParsed.data}`);
  if (nextCompanyId !== (before?.company_id ?? null)) {
    revalidatePath("/app/companies"); // số khách của công ty đổi
  }
  return { error: null };
}

// Đổi hạng bằng tay đã bỏ (migration #19): hạng do máy tính từ doanh thu, số lần
// mua và lần liên hệ cuối; đặt tay thì lần tính lại kế tiếp cũng ghi đè. Muốn đổi
// cách xếp hạng thì chỉnh ngưỡng ở Cài đặt → Phân hạng khách.

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
    // note/call là nhật ký đã xảy ra → đóng ngay lúc ghi, không treo thành việc chờ (B10)
    done_at:
      parsed.data.type === "note" || parsed.data.type === "call"
        ? new Date().toISOString()
        : null,
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
