import { createClient } from "@/lib/supabase/server";
import { SubmitView, type PublishedForm } from "./submit-view";
import type { FormField } from "../../settings/forms/types";

export const dynamic = "force-dynamic";

/** Gửi yêu cầu: chọn một biểu mẫu đã xuất bản → điền → gửi đi duyệt. */
export default async function NewRequestPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wf_forms")
    .select("id, name, description, fields, approval_levels")
    .eq("status", "published")
    .order("name");

  const forms: PublishedForm[] = (data ?? []).map((f) => ({
    id: f.id as string,
    name: f.name as string,
    description: (f.description as string | null) ?? null,
    fields: (f.fields ?? []) as FormField[],
    needsApproval: ((f.approval_levels ?? []) as unknown[]).length > 0,
  }));

  return <SubmitView forms={forms} />;
}
