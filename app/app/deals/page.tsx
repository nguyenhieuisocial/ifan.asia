import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { seedLabel } from "@/lib/seed-i18n";
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

  // Bước bán hàng + lý do thua CÀI SẴN dịch được (migration #36); cột/lý do chủ
  // tiệm tự đặt tên không có khóa → in nguyên văn tên họ đặt, cả hai ngôn ngữ.
  const tSeed = await getTranslations("seed");
  const localizedBoard = {
    ...board,
    stages: board.stages.map((s) => ({
      ...s,
      name: seedLabel(s.i18n_key, s.name, tSeed),
    })),
    lostReasons: board.lostReasons.map((r) => ({
      ...r,
      name: seedLabel(r.i18n_key, r.name, tSeed),
    })),
  };

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
      board={localizedBoard}
    />
  );
}
