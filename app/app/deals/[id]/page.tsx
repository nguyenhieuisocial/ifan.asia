import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nowVN } from "@/lib/datetime";
import { seedLabel } from "@/lib/seed-i18n";
import { createClient } from "@/lib/supabase/server";
import {
  fetchActiveDealSlaPolicy,
  fetchDealActivities,
  fetchDealDetail,
  fetchDealPermissions,
  fetchDealStageHistory,
  fetchLostReasons,
  fetchPipelineStages,
} from "../queries";
import { buildMemberOptions, overdueMinutes } from "../types";
import { DealDetail } from "./deal-detail";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function NotFoundState() {
  const t = await getTranslations("deals.notFound");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-muted p-6">
        <SearchX className="size-10 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t("description")}
      </p>
      <Button asChild variant="outline">
        <Link href="/app/deals">
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>
    </div>
  );
}

/**
 * Server component: chi tiết một cơ hội (spec CRM §4.5 — stepper bước, thông tin,
 * dòng thời gian riêng của cơ hội, lịch sử qua các bước, panel cam kết phản hồi).
 * RLS `deals_select` là lưới cuối: khác tenant hoặc nhân viên không phụ trách →
 * fetchDealDetail trả null → màn "không tìm thấy", không lộ dữ liệu.
 */
export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // Next 16: params phải await
  if (!UUID_RE.test(id)) return <NotFoundState />;

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

  const deal = await fetchDealDetail(supabase, id);
  if (!deal) return <NotFoundState />;

  const [stages, activities, history, slaPolicy, lostReasons, permissions, profilesRes] =
    await Promise.all([
      fetchPipelineStages(supabase, deal.pipeline_id),
      fetchDealActivities(supabase, deal.id),
      fetchDealStageHistory(supabase, deal.id),
      fetchActiveDealSlaPolicy(supabase),
      fetchLostReasons(supabase),
      fetchDealPermissions(supabase, user.id),
      // RLS profiles chỉ trả đồng nghiệp cùng tenant
      supabase.from("profiles").select("user_id, display_name"),
    ]);

  const memberNames = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
  );
  const tOwner = await getTranslations("contacts.owner");

  // Cùng luật với bảng Cơ hội: bước/lý do CÀI SẴN dịch được (migration #36), tên
  // chủ tiệm tự đặt giữ nguyên. Hai màn phải đọc GIỐNG HỆT nhau.
  const tSeed = await getTranslations("seed");
  const localizedStages = stages.map((s) => ({
    ...s,
    name: seedLabel(s.i18n_key, s.name, tSeed),
  }));
  const localizedReasons = lostReasons.map((r) => ({
    ...r,
    name: seedLabel(r.i18n_key, r.name, tSeed),
  }));
  const localizedDeal = {
    ...deal,
    lost_reasons: deal.lost_reasons
      ? {
          ...deal.lost_reasons,
          name: seedLabel(
            deal.lost_reasons.i18n_key,
            deal.lost_reasons.name,
            tSeed,
          ),
        }
      : null,
  };

  // Mốc "bây giờ" chốt ở server: HTML server và lần hydrate đầu dùng CÙNG một số,
  // không sinh cảnh báo lệch nội dung trên console.
  const now = nowVN().getTime();

  return (
    <DealDetail
      deal={localizedDeal}
      stages={localizedStages}
      activities={activities}
      history={history}
      lostReasons={localizedReasons}
      slaPolicy={slaPolicy}
      overdue={overdueMinutes(deal, now)}
      now={now}
      currentUserId={user.id}
      memberNames={memberNames}
      members={buildMemberOptions(
        permissions.memberIds,
        memberNames,
        user.id,
        tOwner,
      )}
      canAssignOthers={permissions.canAssignOthers}
    />
  );
}
