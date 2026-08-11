import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
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
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin";

  if (!canManage) return <FormsView canManage={false} forms={[]} />;

  const [{ data: forms }, { data: subCounts }] = await Promise.all([
    supabase
      .from("wf_forms")
      .select("id, name, description, status, fields, approval_levels, updated_at")
      .order("created_at", { ascending: false }),
    // Đếm bằng COUNT trong CSDL (migration #34). Trước đây tải TOÀN BỘ lượt gửi
    // về rồi đếm bằng .length: PostgREST cắt ở 1000 dòng nên "N lượt gửi" đứng
    // yên ở 1000 — và ở đây không có mốc thời gian nào, tiệm dùng lâu là chắc sai.
    supabase.rpc("form_submission_counts"),
  ]);

  const counts = (subCounts ?? {}) as Record<string, number | undefined>;

  const rows: FormRow[] = (forms ?? []).map((f) => ({
    id: f.id as string,
    name: f.name as string,
    description: (f.description as string | null) ?? null,
    status: f.status as FormRow["status"],
    fields: (f.fields ?? []) as FormField[],
    approvalLevels: (f.approval_levels ?? []) as ApprovalLevel[],
    submissionCount: counts[f.id as string] ?? 0,
    updatedAt: f.updated_at as string,
  }));

  return <FormsView canManage forms={rows} />;
}
