import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { FormEditor, type EditorMember } from "./form-editor";
import type { ApprovalLevel, FormField } from "../types";

export const dynamic = "force-dynamic";

/** Màn dựng một biểu mẫu: thêm ô nhập, chọn ai duyệt, xem thử rồi xuất bản. */
export default async function FormEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  if (member?.role !== "owner" && member?.role !== "admin") notFound();

  const [{ data: form }, { data: memberRows }, { data: profiles }, { count }] =
    await Promise.all([
      supabase
        .from("wf_forms")
        .select("id, name, description, status, fields, approval_levels")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("tenant_members").select("user_id, role").eq("status", "active"),
      supabase.from("profiles").select("user_id, display_name"),
      supabase
        .from("wf_form_submissions")
        .select("id", { count: "exact", head: true })
        .eq("form_id", id),
    ]);
  if (!form) notFound();

  const displayNames = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]),
  );
  const tOwner = await getTranslations("contacts.owner");
  const members: EditorMember[] = (memberRows ?? []).map((m) => {
    const userId = m.user_id as string;
    return {
      userId,
      name: displayNames.get(userId) ?? tOwner("member", { id: userId.slice(0, 8) }),
      role: m.role as string,
    };
  });

  return (
    <FormEditor
      formId={form.id as string}
      initialName={form.name as string}
      initialDescription={(form.description as string | null) ?? ""}
      status={form.status as "draft" | "published" | "archived"}
      initialFields={(form.fields ?? []) as FormField[]}
      initialLevels={(form.approval_levels ?? []) as ApprovalLevel[]}
      members={members}
      submissionCount={count ?? 0}
    />
  );
}
