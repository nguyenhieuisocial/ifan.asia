"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { findCompanyByDomain } from "./queries";
import { isValidTaxCode, normalizeTaxCode, workEmailDomain } from "./types";

/**
 * Quy ước lỗi giống contacts/actions.ts: error là chuỗi ĐÃ DỊCH, client toast thẳng.
 * Message zod = key trong messages/<locale>.json namespace "companies.errors".
 */
type ActionResult = { error: string | null };

/** Postgres unique_violation — MST trùng trong tenant (index companies_tenant_tax_code_uniq). */
const UNIQUE_VIOLATION = "23505";

/**
 * Chuẩn hóa đuôi email công ty: nhận "spaxinh.vn", "@spaxinh.vn",
 * "https://spaxinh.vn/lien-he" đều ra "spaxinh.vn".
 */
function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^@/, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

const companyInputSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(160, "nameTooLong"),
  emailDomain: z
    .string()
    .transform(normalizeDomain)
    .refine(
      (v) => v === "" || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v),
      "domainInvalid",
    ),
  taxCode: z
    .string()
    .transform((v) => normalizeTaxCode(v))
    .refine((v) => v === "" || isValidTaxCode(v), "taxCodeInvalid"),
});

export type CompanyInput = z.input<typeof companyInputSchema>;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createCompany(
  input: CompanyInput,
): Promise<ActionResult & { id?: string; name?: string }> {
  const t = await getTranslations("companies.errors");
  const parsed = companyInputSchema.safeParse(input);
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

  const { name, emailDomain, taxCode } = parsed.data;
  const { data: company, error } = await supabase
    .from("companies")
    .insert({
      tenant_id: tenant.id,
      name,
      email_domain: emailDomain || null,
      tax_code: taxCode || null,
      owner_id: user.id,
      created_by: user.id,
    })
    .select("id, name")
    .single();
  if (error || !company) {
    // MST trùng: chặn hẳn, nói rõ lý do thay vì "không tạo được"
    if (error?.code === UNIQUE_VIOLATION) return { error: t("taxCodeDuplicate") };
    return { error: t("createFailed") };
  }

  revalidatePath("/app/companies");
  return { error: null, id: company.id as string, name: company.name as string };
}

export async function updateCompany(
  companyId: string,
  input: CompanyInput,
): Promise<ActionResult> {
  const t = await getTranslations("companies.errors");
  const idParsed = z.uuid().safeParse(companyId);
  const parsed = companyInputSchema.safeParse(input);
  if (!idParsed.success) return { error: t("invalidCompany") };
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "invalidData") };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { name, emailDomain, taxCode } = parsed.data;
  // company.updated (changed_fields) do trigger DB tự tính từ OLD/NEW — migration #15
  const { error } = await supabase
    .from("companies")
    .update({
      name,
      email_domain: emailDomain || null,
      tax_code: taxCode || null,
    })
    .eq("id", idParsed.data);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: t("taxCodeDuplicate") };
    return { error: t("updateFailed") };
  }

  revalidatePath("/app/companies");
  revalidatePath(`/app/companies/${idParsed.data}`);
  return { error: null };
}

/** Xóa mềm như khách hàng: set deleted_at; contacts.company_id giữ nguyên nhưng mọi query đã lọc. */
export async function softDeleteCompany(
  companyId: string,
): Promise<ActionResult> {
  const t = await getTranslations("companies.errors");
  const idParsed = z.uuid().safeParse(companyId);
  if (!idParsed.success) return { error: t("invalidCompany") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  // Gỡ khách khỏi công ty trước để hồ sơ khách không trỏ vào công ty đã xóa
  await supabase
    .from("contacts")
    .update({ company_id: null })
    .eq("company_id", idParsed.data);

  const { error } = await supabase
    .from("companies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", idParsed.data);
  if (error) return { error: t("deleteFailed") };

  revalidatePath("/app/companies");
  return { error: null };
}

/** Gắn khách vào công ty từ gợi ý trên hồ sơ khách (người dùng bấm → method "manual"). */
export async function linkContactCompany(
  contactId: string,
  companyId: string,
): Promise<ActionResult> {
  const t = await getTranslations("companies.errors");
  const parsed = z
    .object({ contactId: z.uuid(), companyId: z.uuid() })
    .safeParse({ contactId, companyId });
  if (!parsed.success) return { error: t("invalidData") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { error } = await supabase
    .from("contacts")
    .update({ company_id: parsed.data.companyId })
    .eq("id", parsed.data.contactId);
  if (error) return { error: t("linkFailed") };

  revalidatePath("/app/companies");
  revalidatePath(`/app/companies/${parsed.data.companyId}`);
  revalidatePath(`/app/contacts/${parsed.data.contactId}`);
  return { error: null };
}

/**
 * Gợi ý "chưa có công ty nào dùng @domain — tạo?" trên hồ sơ khách:
 * tạo công ty lấy chính tên miền làm tên rồi gắn khách vào.
 * Chỉ chạy khi người dùng BẤM — hệ thống không bao giờ tự tạo công ty.
 */
export async function createCompanyFromContactDomain(
  contactId: string,
): Promise<ActionResult & { companyId?: string }> {
  const t = await getTranslations("companies.errors");
  const idParsed = z.uuid().safeParse(contactId);
  if (!idParsed.success) return { error: t("invalidData") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact) return { error: t("contactNotFound") };

  const domain = workEmailDomain(contact.email as string | null);
  if (!domain) return { error: t("noWorkEmail") };

  // Người khác vừa tạo công ty cùng domain → dùng luôn, không tạo bản trùng
  const existing = await findCompanyByDomain(supabase, domain);
  if (existing) {
    const linked = await linkContactCompany(idParsed.data, existing.id);
    return linked.error
      ? { error: linked.error }
      : { error: null, companyId: existing.id };
  }

  const created = await createCompany({
    name: domain,
    emailDomain: domain,
    taxCode: "",
  });
  if (created.error || !created.id) {
    return { error: created.error ?? t("createFailed") };
  }

  const linked = await linkContactCompany(idParsed.data, created.id);
  return linked.error
    ? { error: linked.error }
    : { error: null, companyId: created.id };
}
