import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchTodayQueue } from "./types";
import { TodayView } from "./today-view";

export const dynamic = "force-dynamic";

/** Vai được xem việc của CẢ TIỆM (khớp policy activities/deals/contacts_select). */
const SEE_ALL_ROLES = ["owner", "admin", "manager"];

/**
 * `/app/today` — "Hôm nay gọi ai": hàng đợi việc trong ngày của người bán
 * (US-S4 spec CRM §3). Toàn bộ 4 khối lấy 1 lần qua RPC today_queue()
 * (SECURITY INVOKER — RLS khoanh tenant + vai, migration #16).
 */
export default async function TodayPage() {
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

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const canSeeAll = SEE_ALL_ROLES.includes(member?.role ?? "");

  // Staff luôn ở chế độ "của tôi": RLS đã khoanh activities/deals/contacts theo
  // người phụ trách, nhưng hộp thư dùng chung cả tiệm nên phải lọc thêm ở RPC.
  const initialQueue = await fetchTodayQueue(supabase, !canSeeAll);

  return (
    <TodayView
      canSeeAll={canSeeAll}
      initialQueue={initialQueue}
      now={new Date().toISOString()}
    />
  );
}
