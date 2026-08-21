import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { DataExportLogView, type DataExportEventRow, type ExportKind } from "./data-export-log-view";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 200;

/**
 * Cài đặt → Nhật ký tải dữ liệu (việc #207).
 *
 * Bốn đường mang dữ liệu ra khỏi phần mềm — ba route CSV (`app/api/export/*`)
 * và nút Xuất Excel ở màn Khách hàng — ghi qua RPC `record_audit_log()` với
 * `entity_type='data_export'`, `action='exported'` (migration #60, KHÔNG bảng
 * riêng — đúng hợp đồng 24q của `record_audit`). RLS `record_audit_select` đã
 * tự lọc owner/admin của ĐÚNG tenant; trang này chỉ hỏi "vai tôi có phải
 * owner/admin" để hiện đúng thông điệp "không có quyền" thay vì một bảng
 * trống gây hiểu lầm — đúng khuôn `login-log/page.tsx`.
 * Thẻ design: design-system/man-nhat-ky-tai-du-lieu.html.
 */
export default async function DataExportLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin";

  if (!canManage) {
    return <DataExportLogView loadFailed={false} canManage={false} events={[]} />;
  }

  // ⚠️ PHẢI đọc `error`. Bỏ qua nó thì lỗi đọc biến thành nhật ký RỖNG, và
  // màn nói "chưa ai tải dữ liệu về" — đúng câu người ta muốn nghe nhất khi đi
  // soát xem có ai mang dữ liệu khách ra ngoài không. Một cuốn sổ an ninh nói
  // "không có gì" vì nó không đọc được chính nó là loại sai nguy hiểm nhất.
  const { data: events, error: loiEvents } = await supabase
    .from("record_audit")
    .select("id, actor_id, diff, at")
    .eq("entity_type", "data_export")
    .eq("action", "exported")
    .order("at", { ascending: false })
    .limit(LIST_LIMIT);

  const userIds = [...new Set((events ?? []).map((e) => e.actor_id as string | null).filter((id): id is string => id !== null))];
  const [{ data: profiles }, { data: members }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("user_id, display_name").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from("tenant_members").select("user_id, role").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
  ]);
  const profileOf = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));
  const roleOf = new Map((members ?? []).map((m) => [m.user_id as string, m.role as string]));

  const KNOWN_KINDS: readonly ExportKind[] = ["contacts", "orders", "appointments"];

  const rows: DataExportEventRow[] = (events ?? []).map((e) => {
    // `diff` do chính route ghi (xem chú thích trên) — vẫn phòng hờ dữ liệu cũ
    // hoặc lỗi ghi để lại hình dạng thiếu, không để cả trang vỡ vì một dòng lạ.
    const diff = (e.diff ?? {}) as { loai?: string; rows?: number; truncated?: boolean };
    const kind: ExportKind = KNOWN_KINDS.includes(diff.loai as ExportKind)
      ? (diff.loai as ExportKind)
      : "unknown";
    const actorId = e.actor_id as string | null;
    return {
      id: e.id as number,
      kind,
      rows: diff.rows ?? 0,
      truncated: diff.truncated ?? false,
      createdAt: e.at as string,
      displayName: (actorId && profileOf.get(actorId)?.display_name) || "—",
      role: actorId ? (roleOf.get(actorId) ?? null) : null,
    };
  });

  return (
    <DataExportLogView
      loadFailed={Boolean(loiEvents)}
      canManage
      events={rows}
      listLimit={LIST_LIMIT}
    />
  );
}
