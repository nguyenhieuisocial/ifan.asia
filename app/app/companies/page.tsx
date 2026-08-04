import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompaniesShell } from "./companies-shell";
import { fetchCompaniesPage } from "./queries";

export const dynamic = "force-dynamic";

/** Server component: trang đầu danh sách công ty (50 công ty mới nhất theo ?q=). */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const initialQ = typeof sp.q === "string" ? sp.q : "";

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

  const initialPage = await fetchCompaniesPage(supabase, initialQ, null);

  return <CompaniesShell initialQ={initialQ} initialPage={initialPage} />;
}
