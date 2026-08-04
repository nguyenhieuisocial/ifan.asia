import { createClient } from "@/lib/supabase/server";
import { FormsView } from "./forms-view";
import type { ApprovalLevel, FormField, FormRow } from "./types";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Biểu mẫu (form động, migration #29).
 * Chỉ owner/admin dựng — staff thấy trạng thái không có quyền, và vẫn ĐIỀN được
 * biểu mẫu đã xuất bản ở màn "Duyệt & yêu cầu".
 */
export default async function FormsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const canManage = member?.role === "owner" || member?.role === "admin";

  if (!canManage) return <FormsView canManage={false} forms={[]} />;

  const [{ data: forms }, { data: subs }] = await Promise.all([
    supabase
      .from("wf_forms")
      .select("id, name, description, status, fields, approval_levels, updated_at")
      .order("created_at", { ascending: false }),
    supabase.from("wf_form_submissions").select("form_id"),
  ]);

  const counts = new Map<string, number>();
  for (const s of subs ?? []) {
    const id = s.form_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const rows: FormRow[] = (forms ?? []).map((f) => ({
    id: f.id as string,
    name: f.name as string,
    description: (f.description as string | null) ?? null,
    status: f.status as FormRow["status"],
    fields: (f.fields ?? []) as FormField[],
    approvalLevels: (f.approval_levels ?? []) as ApprovalLevel[],
    submissionCount: counts.get(f.id as string) ?? 0,
    updatedAt: f.updated_at as string,
  }));

  return <FormsView canManage forms={rows} />;
}
