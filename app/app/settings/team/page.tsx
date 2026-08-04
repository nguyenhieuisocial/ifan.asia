import { createClient } from "@/lib/supabase/server";
import { TeamView } from "./team-view";
import type { InviteRow, MemberRow, SeatInfo } from "./types";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Nhân viên (migration #28).
 * Số ghế do gói quyết định: `tenant_seats()` là nguồn duy nhất, đúng cùng con số
 * mà trigger tầng DB dùng để chặn — màn hình và ràng buộc không bao giờ lệch nhau.
 */
export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: seats }, { data: members }, { data: invites }] = await Promise.all([
    supabase.rpc("tenant_seats"),
    supabase
      .from("tenant_members")
      .select("user_id, role, joined_at, created_at")
      .eq("status", "active")
      .order("created_at"),
    supabase
      .from("invitations")
      .select("id, email, role, expires_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const ids = (members ?? []).map((m) => m.user_id as string);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", ids)
    : { data: [] };
  const nameOf = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]),
  );

  const rows: MemberRow[] = (members ?? []).map((m) => ({
    user_id: m.user_id as string,
    role: m.role as string,
    display_name: nameOf.get(m.user_id as string) ?? "—",
    joined_at: (m.joined_at ?? m.created_at) as string | null,
  }));
  const me = rows.find((r) => r.user_id === user?.id);
  const canManage = me?.role === "owner" || me?.role === "admin";

  return (
    <TeamView
      seats={(seats as SeatInfo | null) ?? null}
      members={rows}
      invites={
        canManage
          ? ((invites as InviteRow[] | null) ?? []).filter(
              (i) => new Date(i.expires_at) > new Date(),
            )
          : []
      }
      canManage={canManage}
      currentUserId={user?.id ?? ""}
    />
  );
}
