"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { FIELD_TYPES, MAX_FIELDS, MAX_OPTIONS } from "./types";

type ActionResult = { error: string | null };

/**
 * Chỉ chủ tài khoản / quản trị viên dựng được biểu mẫu — khớp RLS `wf_forms_manage`
 * (migration #29). Action vẫn tự kiểm vai trò trước (defense in depth, theo mẫu
 * settings/workflows/actions.ts).
 */
const MANAGE_ROLES = ["owner", "admin"];

type Manager = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  tenantId: string;
};

async function requireManager(): Promise<Manager | { errorKey: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errorKey: "not_authenticated" };

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role, tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!MANAGE_ROLES.includes(member?.role ?? "")) return { errorKey: "forbidden" };

  return { supabase, userId: user.id, tenantId: member?.tenant_id as string };
}

const NO_TAGS = /^[^<>]*$/;

/** Hợp đồng phải khớp `wf_form_fields_valid()` trong DB — DB vẫn là lưới cuối. */
const fieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
    label: z.string().min(1).max(120).regex(NO_TAGS),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().optional(),
    help: z.string().max(300).regex(NO_TAGS).optional(),
    options: z.array(z.string().min(1).max(80).regex(NO_TAGS)).max(MAX_OPTIONS).optional(),
  })
  .refine(
    (f) =>
      f.type === "select" || f.type === "multiselect"
        ? (f.options?.length ?? 0) >= 1 &&
          new Set(f.options).size === (f.options?.length ?? 0)
        : (f.options?.length ?? 0) === 0,
    { message: "options" },
  );

const levelSchema = z.object({
  to: z
    .string()
    .regex(
      /^(role:(owner|admin|staff)|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,
    ),
});

const saveSchema = z.object({
  formId: z.uuid(),
  name: z.string().min(1).max(120).regex(NO_TAGS),
  description: z.string().max(500).regex(NO_TAGS).nullable(),
  fields: z.array(fieldSchema).max(MAX_FIELDS),
  approvalLevels: z.array(levelSchema).max(2),
});

/** Tạo biểu mẫu rỗng ở trạng thái nháp; trả id để chuyển sang màn dựng. */
export async function createForm(
  name: string,
): Promise<{ error: string | null; formId?: string }> {
  const parsed = z.string().min(1).max(120).regex(NO_TAGS).safeParse(name.trim());
  if (!parsed.success) return { error: "invalid_input" };

  const m = await requireManager();
  if ("errorKey" in m) return { error: m.errorKey };

  const { data, error } = await m.supabase
    .from("wf_forms")
    .insert({ tenant_id: m.tenantId, name: parsed.data, created_by: m.userId })
    .select("id")
    .single();
  if (error || !data) return { error: "failed" };

  revalidatePath("/app/settings/forms");
  return { error: null, formId: data.id as string };
}

export async function saveForm(input: {
  formId: string;
  name: string;
  description: string | null;
  fields: unknown[];
  approvalLevels: unknown[];
}): Promise<ActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const m = await requireManager();
  if ("errorKey" in m) return { error: m.errorKey };

  const { data, error } = await m.supabase
    .from("wf_forms")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      fields: parsed.data.fields,
      approval_levels: parsed.data.approvalLevels,
    })
    .eq("id", parsed.data.formId)
    .select("id");
  if (error) return { error: "failed" };
  // RLS chặn thì UPDATE không báo lỗi, chỉ không chạm dòng nào → nói rõ là không đủ quyền
  if (!data || data.length === 0) return { error: "forbidden" };

  revalidatePath("/app/settings/forms");
  revalidatePath(`/app/settings/forms/${parsed.data.formId}`);
  return { error: null };
}

/**
 * Xuất bản = cho cả nhà dùng. Mỗi lần xuất bản tăng `version`; phiếu đã nộp giữ
 * bản chụp cấu hình cũ nên không bị ảnh hưởng.
 */
export async function setFormStatus(
  formId: string,
  status: "draft" | "published" | "archived",
): Promise<ActionResult> {
  const parsed = z
    .object({ formId: z.uuid(), status: z.enum(["draft", "published", "archived"]) })
    .safeParse({ formId, status });
  if (!parsed.success) return { error: "invalid_input" };

  const m = await requireManager();
  if ("errorKey" in m) return { error: m.errorKey };

  const { data: current } = await m.supabase
    .from("wf_forms")
    .select("fields, version")
    .eq("id", parsed.data.formId)
    .maybeSingle();
  if (!current) return { error: "forbidden" };
  if (
    parsed.data.status === "published" &&
    (current.fields as unknown[] | null)?.length === 0
  ) {
    return { error: "no_fields" };
  }

  const patch: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status === "published") {
    patch.version = ((current.version as number) ?? 1) + 1;
  }

  const { data, error } = await m.supabase
    .from("wf_forms")
    .update(patch)
    .eq("id", parsed.data.formId)
    .select("id");
  if (error) return { error: "failed" };
  if (!data || data.length === 0) return { error: "forbidden" };

  revalidatePath("/app/settings/forms");
  revalidatePath(`/app/settings/forms/${parsed.data.formId}`);
  revalidatePath("/app/approvals/new");
  return { error: null };
}

/** Xóa hẳn biểu mẫu (kéo theo phiếu đã nộp — chỉ dùng khi dựng nhầm). */
export async function deleteForm(formId: string): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(formId);
  if (!parsed.success) return { error: "invalid_input" };

  const m = await requireManager();
  if ("errorKey" in m) return { error: m.errorKey };

  const { data, error } = await m.supabase
    .from("wf_forms")
    .delete()
    .eq("id", parsed.data)
    .select("id");
  if (error) return { error: "failed" };
  if (!data || data.length === 0) return { error: "forbidden" };

  revalidatePath("/app/settings/forms");
  return { error: null };
}
