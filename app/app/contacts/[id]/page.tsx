import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentMembership } from "@/lib/auth/membership";
import { seedLabel } from "@/lib/seed-i18n";
import { createClient } from "@/lib/supabase/server";
import { getTenantPack } from "@/lib/tenant-pack";
import { findCompanyByDomain } from "../../companies/queries";
import { workEmailDomain } from "../../companies/types";
import {
  ensureDealDefaults,
  fetchContactDeals,
  fetchDealPermissions,
  fetchOpenStages,
} from "../../deals/queries";
import { buildMemberOptions } from "../../deals/types";
import {
  fetchContactDetail,
  fetchContactTimeline,
  fetchLeadSources,
  fetchWonDealCount,
} from "../queries";
import { silentDays } from "../types";
import {
  ContactDetail,
  type CompanySuggestionData,
} from "./contact-detail";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function NotFoundState() {
  const t = await getTranslations("contacts.notFound");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-muted p-6">
        <UserX className="size-10 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t("description")}
      </p>
      <Button asChild variant="outline">
        <Link href="/app/contacts">
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>
    </div>
  );
}

/** Server component: hồ sơ khách + dòng thời gian (activities + hội thoại inbox). */
export default async function ContactDetailPage({
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

  const contact = await fetchContactDetail(supabase, id);
  if (!contact) return <NotFoundState />;

  // Nút "Tạo cơ hội" cần pipeline sẵn sàng — idempotent, lần 2 trở đi là no-op
  await ensureDealDefaults(supabase);

  const [
    timeline,
    leadSources,
    profilesRes,
    deals,
    openStages,
    permissions,
    wonDeals,
    pack,
    membership,
  ] = await Promise.all([
    fetchContactTimeline(supabase, id),
    fetchLeadSources(supabase),
    // Tên hiển thị người phụ trách — RLS profiles chỉ trả đồng nghiệp cùng tenant
    supabase.from("profiles").select("user_id, display_name"),
    fetchContactDeals(supabase, id),
    fetchOpenStages(supabase),
    fetchDealPermissions(supabase, user.id),
    // Số lần đã mua — lý do khách đang ở hạng hiện tại
    fetchWonDealCount(supabase, id),
    // Trường tự khai theo pack ngành (V1a — mục 35.2 bước 4)
    getTenantPack(supabase),
    // Vai owner/admin mới thấy tab Lịch sử (contact_audit_history) — vai khác vẫn thấy hồ sơ y hệt trước đây.
    getCurrentMembership(supabase, user.id),
  ]);
  const canViewHistory = membership?.role === "owner" || membership?.role === "admin";

  const memberNames = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
  );
  const tOwner = await getTranslations("contacts.owner");

  // Nguồn khách + bước bán hàng CÀI SẴN dịch được (migration #36) — hồ sơ khách
  // phải đọc giống hệt danh sách khách và bảng Cơ hội; tên chủ tiệm tự đặt giữ nguyên.
  const tSeed = await getTranslations("seed");
  const localizedContact = {
    ...contact,
    lead_sources: contact.lead_sources
      ? {
          ...contact.lead_sources,
          name: seedLabel(
            contact.lead_sources.i18n_key,
            contact.lead_sources.name,
            tSeed,
          ),
        }
      : null,
  };
  const localizedSources = leadSources.map((s) => ({
    ...s,
    name: seedLabel(s.i18n_key, s.name, tSeed),
  }));
  const localizedOpenStages = openStages.map((s) => ({
    ...s,
    name: seedLabel(s.i18n_key, s.name, tSeed),
  }));
  const localizedDeals = deals.map((d) => ({
    ...d,
    pipeline_stages: d.pipeline_stages
      ? {
          ...d.pipeline_stages,
          name: seedLabel(
            d.pipeline_stages.i18n_key,
            d.pipeline_stages.name,
            tSeed,
          ),
        }
      : null,
  }));

  // Gợi ý nối công ty: chỉ khi khách chưa có công ty VÀ email là email công việc
  const domain = contact.company_id ? null : workEmailDomain(contact.email);
  const companySuggestion: CompanySuggestionData | null = domain
    ? { domain, company: await findCompanyByDomain(supabase, domain) }
    : null;

  return (
    <ContactDetail
      currentUserId={user.id}
      memberNames={memberNames}
      contact={localizedContact}
      activities={timeline.activities}
      conversations={timeline.conversations}
      leadSources={localizedSources}
      deals={localizedDeals}
      openStages={localizedOpenStages}
      members={buildMemberOptions(
        permissions.memberIds,
        memberNames,
        user.id,
        tOwner,
      )}
      canAssignOthers={permissions.canAssignOthers}
      companySuggestion={companySuggestion}
      wonDeals={wonDeals}
      silentDays={silentDays(contact.last_interaction_at, contact.created_at)}
      customFields={pack.custom_fields}
      canViewHistory={canViewHistory}
    />
  );
}
