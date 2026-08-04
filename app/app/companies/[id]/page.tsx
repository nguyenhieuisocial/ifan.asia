import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  fetchCompanyContacts,
  fetchCompanyDeals,
  fetchCompanyDetail,
  fetchCompanyStats,
} from "../queries";
import { CompanyDetail } from "./company-detail";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function NotFoundState() {
  const t = await getTranslations("companies.notFound");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-muted p-6">
        <Building2 className="size-10 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t("description")}
      </p>
      <Button asChild variant="outline">
        <Link href="/app/companies">
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>
    </div>
  );
}

/** Server component: hồ sơ công ty + khách thuộc công ty + cơ hội của họ. */
export default async function CompanyDetailPage({
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

  const company = await fetchCompanyDetail(supabase, id);
  if (!company) return <NotFoundState />;

  const [stats, contacts, deals] = await Promise.all([
    fetchCompanyStats(supabase, id),
    fetchCompanyContacts(supabase, id),
    fetchCompanyDeals(supabase, id),
  ]);

  return (
    <CompanyDetail
      company={company}
      stats={stats}
      contacts={contacts}
      deals={deals}
    />
  );
}
