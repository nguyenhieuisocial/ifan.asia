import { createClient } from "@/lib/supabase/server";
import { LoginLogView, type LoginEventRow } from "./login-log-view";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 200;

/**
 * Cài đặt → Nhật ký đăng nhập (chỉ đạo founder 11/08, migration #63).
 * RLS login_events_select đã tự lọc owner/admin của ĐÚNG tenant — trang này
 * chỉ hỏi "vai tôi có phải owner/admin" để hiện đúng thông điệp "không có
 * quyền" thay vì một bảng trống gây hiểu lầm (lịch sự UI, quyền thật ở RLS).
 * Thẻ design: design-system/nhat-ky-dang-nhap.html.
 */
export default async function LoginLogPage() {
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

  if (!canManage) {
    return <LoginLogView canManage={false} events={[]} />;
  }

  const { data: events } = await supabase
    .from("login_events")
    .select("id, user_id, method, ip, city, region, country, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  const userIds = [...new Set((events ?? []).map((e) => e.user_id as string))];
  const [{ data: profiles }, { data: members }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("user_id, display_name, phone").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from("tenant_members").select("user_id, role").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
  ]);
  const profileOf = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));
  const roleOf = new Map((members ?? []).map((m) => [m.user_id as string, m.role as string]));

  const rows: LoginEventRow[] = (events ?? []).map((e) => ({
    id: e.id as number,
    method: e.method as LoginEventRow["method"],
    ip: e.ip as string | null,
    city: e.city as string | null,
    region: e.region as string | null,
    country: e.country as string | null,
    userAgent: e.user_agent as string | null,
    createdAt: e.created_at as string,
    displayName: profileOf.get(e.user_id as string)?.display_name ?? "—",
    phone: (profileOf.get(e.user_id as string)?.phone as string | null) ?? null,
    role: roleOf.get(e.user_id as string) ?? null,
  }));

  return <LoginLogView canManage events={rows} listLimit={LIST_LIMIT} />;
}
