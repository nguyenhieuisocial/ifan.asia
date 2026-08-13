import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { getCustomInstruction, listKbEntries } from "@/lib/ai/kb";
import { KnowledgeView } from "./knowledge-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Kho tri thức (ADR-0015 việc 3, thẻ design man-kho-tri-thuc.html).
 *
 * Mở cho MỌI thành viên (khác màn AI trực việc chỉ owner/admin/manager) —
 * nhân viên cần thấy kho để soạn mục, và cần thấy lời dặn riêng đang là gì
 * (nếu họ có quyền đọc) để hiểu AI đang nói giọng nào với khách. Quyền THẬT
 * (đăng/gỡ đăng/xoá/sửa lời dặn) siết ở actions.ts + trigger CSDL.
 */
export default async function KnowledgeSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const role = member?.role ?? "";
  // RLS ai_autopilot_manage đã tự trả null cho staff — gọi luôn, không cần
  // if/else, tránh hai đường code cho cùng một câu hỏi (bất biến 3).
  const [entries, customInstruction] = await Promise.all([
    listKbEntries(supabase),
    getCustomInstruction(supabase),
  ]);

  return <KnowledgeView role={role} initialEntries={entries} initialCustomInstruction={customInstruction} />;
}
