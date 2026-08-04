import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchConversations, fetchMessages } from "./queries";
import type { Member, MemberNames } from "./types";
import { InboxShell } from "./inbox-shell";

export const dynamic = "force-dynamic";

/** Server component: load initial (50 hội thoại mới nhất + messages của hội thoại chọn qua ?c=). */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const requestedId = typeof sp.c === "string" ? sp.c : null;

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

  const [channelsRes, conversations, membersRes, profilesRes] =
    await Promise.all([
      supabase.from("channels").select("id", { count: "exact", head: true }),
      fetchConversations(supabase),
      supabase
        .from("tenant_members")
        .select("user_id, role")
        .eq("status", "active")
        .order("created_at", { ascending: true }),
      // Tên hiển thị thành viên — RLS profiles chỉ trả đồng nghiệp cùng tenant
      supabase.from("profiles").select("user_id, display_name"),
    ]);
  const memberNames: MemberNames = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
  );

  const selectedId =
    requestedId && conversations.some((c) => c.id === requestedId)
      ? requestedId
      : null;
  const initialMessages = selectedId
    ? await fetchMessages(supabase, selectedId)
    : null;

  return (
    <InboxShell
      tenantId={tenant.id as string}
      currentUserId={user.id}
      hasChannels={(channelsRes.count ?? 0) > 0}
      members={(membersRes.data ?? []) as Member[]}
      memberNames={memberNames}
      initialConversations={conversations}
      initialSelectedId={selectedId}
      initialMessages={initialMessages}
    />
  );
}
