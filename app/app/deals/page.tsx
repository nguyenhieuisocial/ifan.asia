import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  ensureDealDefaults,
  fetchBoard,
  fetchDealPermissions,
} from "./queries";
import { DealsBoard } from "./deals-board";
import { buildMemberOptions } from "./types";

export const dynamic = "force-dynamic";

/** Server component: đảm bảo tenant có pipeline mặc định rồi tải bảng Kanban. */
export default async function DealsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .maybeSingle();
  if (!tenant) redirect("/onboarding");

  // Idempotent: tenant chưa có pipeline/cột Thua/lý do thua thì seed (migration #13)
  await ensureDealDefaults(supabase);

  const [board, permissions, profilesRes] = await Promise.all([
    fetchBoard(supabase),
    fetchDealPermissions(supabase, user.id),
    // RLS profiles chỉ trả đồng nghiệp cùng tenant
    supabase.from("profiles").select("user_id, display_name"),
  ]);

  if (!board) {
    const t = await getTranslations("deals");
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="rounded-full bg-muted p-6">
          <AlertTriangle className="size-10 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">{t("noPipeline.title")}</h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("noPipeline.description")}
        </p>
      </div>
    );
  }

  const memberNames = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
  );
  const tOwner = await getTranslations("contacts.owner");

  return (
    <DealsBoard
      currentUserId={user.id}
      memberNames={memberNames}
      members={buildMemberOptions(
        permissions.memberIds,
        memberNames,
        user.id,
        tOwner,
      )}
      canAssignOthers={permissions.canAssignOthers}
      board={board}
    />
  );
}
