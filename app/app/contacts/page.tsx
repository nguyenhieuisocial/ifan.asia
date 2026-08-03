import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchContactsPage, fetchLeadSources } from "./queries";
import { ContactsShell } from "./contacts-shell";

export const dynamic = "force-dynamic";

/** Server component: load nguồn khách + trang đầu (50 khách mới nhất theo ?q=). */
export default async function ContactsPage({
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

  const [leadSources, initialPage] = await Promise.all([
    fetchLeadSources(supabase),
    fetchContactsPage(
      supabase,
      { q: initialQ, sourceId: null, mineOnly: false, userId: user.id },
      null,
    ),
  ]);

  return (
    <ContactsShell
      currentUserId={user.id}
      leadSources={leadSources}
      initialQ={initialQ}
      initialPage={initialPage}
    />
  );
}
