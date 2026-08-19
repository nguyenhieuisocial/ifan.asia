import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { formatVN, nowVN } from "@/lib/datetime";
import { buildMemberOptions } from "../../deals/types";
import { fetchDealPermissions } from "../../deals/queries";
import {
  PROJECT_COST_LIMIT,
  PROJECT_TASK_LIMIT,
  fetchProject,
  fetchProjectCosts,
  fetchProjectTasks,
  fetchTaskBlocks,
  seesAllTasks,
  seesMoney,
} from "../queries";
import type { ProjectCost } from "../types";
import { ProjectDetail } from "./project-detail";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cùng khuôn NotFoundState của chi tiết đơn (app/app/orders/[id]/page.tsx). */
async function NotFoundState() {
  const t = await getTranslations("projects.notFound");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-muted p-6">
        <FolderKanban className="size-10 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{t("description")}</p>
      <Button asChild variant="outline">
        <Link href="/app/projects">
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>
    </div>
  );
}

/**
 * `/app/projects/[id]` — thẻ `man-du-an.html`.
 *
 * Màn này CỐ Ý không đổ hết danh sách việc ra (quyết định 1 của thẻ): mặc định
 * chỉ hiện việc đang CHẶN việc khác, việc đang làm và việc trễ. Danh sách đầy
 * đủ nằm sau một nút bấm — cần để lập kế hoạch, không cần để nhìn hằng ngày.
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return <NotFoundState />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const project = await fetchProject(supabase, id);
  if (!project) return <NotFoundState />;

  const member = await getCurrentMembership(supabase, user.id);
  const role = member?.role ?? "";
  const canManage = role === "owner" || role === "admin" || role === "manager";
  const canSeeMoney = seesMoney(role);

  const [tasksRes, permissions, profilesRes, costsRes] = await Promise.all([
    fetchProjectTasks(supabase, id),
    fetchDealPermissions(supabase, user.id),
    supabase.from("profiles").select("user_id, display_name"),
    canSeeMoney
      ? fetchProjectCosts(supabase, id)
      : Promise.resolve({ rows: [] as ProjectCost[], atLimit: false }),
  ]);

  const blocks = await fetchTaskBlocks(
    supabase,
    tasksRes.rows.map((task) => task.id),
  );

  const memberNames = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
  );
  const tOwner = await getTranslations("contacts.owner");

  return (
    <ProjectDetail
      project={project}
      tasks={tasksRes.rows}
      tasksAtLimit={tasksRes.atLimit}
      taskLimit={PROJECT_TASK_LIMIT}
      blocks={blocks}
      costs={costsRes.rows}
      costsAtLimit={costsRes.atLimit}
      costLimit={PROJECT_COST_LIMIT}
      canSeeMoney={canSeeMoney}
      canManage={canManage}
      // Khớp RLS `activities_insert`: mọi vai TRỪ viewer ghi được việc (staff
      // chỉ ghi được việc giao cho CHÍNH MÌNH — nên ô chọn người bị khoá lại).
      canWriteTasks={role !== "viewer"}
      canAssignOthers={permissions.canAssignOthers}
      members={buildMemberOptions(permissions.memberIds, memberNames, user.id, tOwner)}
      currentUserId={user.id}
      memberNames={memberNames}
      partialTaskScope={!seesAllTasks(role)}
      todayVN={formatVN(nowVN(), "yyyy-MM-dd")}
    />
  );
}
