import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { getTenantPack } from "@/lib/tenant-pack";
import type { Industry } from "@/lib/industries";
import { BrandMark } from "@/components/brand-mark";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { MobileNav, SidebarNav } from "./sidebar-nav";
import { SampleTourBanner } from "./sample-tour-banner";
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

  const [{ data: tenant }, { data: profile }, member, pack] = await Promise.all([
    // id cho MobileNav: đặt tên topic realtime Hộp thư (badge số chưa trả lời)
    // is_sample/industry: dải cam "đang xem tiệm mẫu" (15b, migration #64)
    supabase.from("tenants").select("id, name, slug, is_sample, industry").maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name, must_change_password")
      .eq("user_id", user.id)
      .maybeSingle(),
    // Vai của người đang đăng nhập: nav ẩn mục vai này mở ra chỉ gặp "không có
    // quyền" (lịch sự UI — quyền thật vẫn ở từng page + RLS)
    getCurrentMembership(supabase, user.id),
    // Khung nav theo pack (Quy hoạch mục 35.1 việc 8): nhãn Khách/Cơ hội đổi
    // theo từ vựng ngành — chưa chọn ngành thì terminology rỗng, nav dùng
    // đúng chuỗi mặc định hiện có.
    getTenantPack(supabase),
  ]);
  if (!tenant) redirect("/onboarding");
  // Bất biến 31.29: mật khẩu tạm bắt đổi ngay lần vào đầu — chặn ở ĐÂY (khung
  // bọc mọi /app/*), không phải chỉ ẩn nút, nên không đường nào lách qua được.
  if (profile?.must_change_password) redirect("/force-password-change");
  const role = (member?.role as string | null) ?? "";
  // Tiệm mẫu (15b) chỉ gắn vai viewer — kiểm cả hai vế phòng khi sau này có
  // vai khác vào tiệm is_sample (không đoán chỉ từ is_sample một mình).
  const isSampleTour = tenant.is_sample === true && role === "viewer";

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden">
      {isSampleTour && <SampleTourBanner industry={(tenant.industry as Industry | null) ?? null} />}
      <div className="flex min-h-0 flex-1 w-full overflow-hidden">
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
          <div className="flex h-12 shrink-0 items-center border-b px-4">
            <BrandMark suffix />
          </div>
          <SidebarNav role={role} pack={pack} />
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
                role={role}
              />
            </div>
          </header>
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </main>
        </div>
        <MobileNav tenantId={tenant.id as string} pack={pack} />
      </div>
    </div>
  );
}
