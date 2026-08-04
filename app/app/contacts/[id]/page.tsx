import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
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
} from "../queries";
import { ContactDetail } from "./contact-detail";

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

  const [timeline, leadSources, profilesRes, deals, openStages, permissions] =
    await Promise.all([
      fetchContactTimeline(supabase, id),
      fetchLeadSources(supabase),
      // Tên hiển thị người phụ trách — RLS profiles chỉ trả đồng nghiệp cùng tenant
      supabase.from("profiles").select("user_id, display_name"),
      fetchContactDeals(supabase, id),
      fetchOpenStages(supabase),
      fetchDealPermissions(supabase, user.id),
    ]);

  const memberNames = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
  );
  const tOwner = await getTranslations("contacts.owner");

  return (
    <ContactDetail
      currentUserId={user.id}
      memberNames={memberNames}
      contact={contact}
      activities={timeline.activities}
      conversations={timeline.conversations}
      leadSources={leadSources}
      deals={deals}
      openStages={openStages}
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
