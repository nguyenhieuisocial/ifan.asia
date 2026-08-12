import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { fetchSupportSessionLog } from "@/app/app/support/queries";
import { SupportLogView } from "./support-log-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Nhật ký hỗ trợ (ADR-0006 mục 6, thẻ design man-ho-tro-chi-doc.html).
 * RLS support_sessions_select đã tự khoanh owner/admin của ĐÚNG tenant — trang
 * này chỉ hỏi vai để hiện đúng "không có quyền" thay vì bảng trống gây hiểu
 * lầm (cùng khuôn login-log/page.tsx).
 */
export default async function SupportLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin";

  if (!canManage) {
    return <SupportLogView canManage={false} sessions={[]} now={new Date().toISOString()} />;
  }

  const sessions = await fetchSupportSessionLog(supabase);
  return <SupportLogView canManage sessions={sessions} now={new Date().toISOString()} />;
}
