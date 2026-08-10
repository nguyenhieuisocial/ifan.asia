import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand-mark";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { MobileNav, SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

export const dynamic = "force-dynamic";

/** App shell: sidebar trái (desktop) + bottom nav (mobile) + topbar. Double-check auth sau proxy. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: tenant }, { data: profile }] = await Promise.all([
    // id cho MobileNav: đặt tên topic realtime Hộp thư (badge số chưa trả lời)
    supabase.from("tenants").select("id, name, slug").maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (!tenant) redirect("/onboarding");

  return (
    <div className="flex h-svh w-full overflow-hidden">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-12 shrink-0 items-center border-b px-4">
          <BrandMark suffix />
        </div>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="truncate text-sm font-semibold">{tenant.name}</p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              @{tenant.slug}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell />
            <UserMenu
              email={user.email ?? ""}
              displayName={profile?.display_name ?? null}
            />
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
      <MobileNav tenantId={tenant.id as string} />
    </div>
  );
}
