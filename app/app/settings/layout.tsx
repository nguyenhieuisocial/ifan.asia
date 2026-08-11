import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { SettingsNav } from "./settings-nav";

/**
 * Khung khu Cài đặt: sub-nav trên cùng, nội dung từng mục tự cuộn bên dưới.
 * Lấy vai ở đây để sub-nav chỉ hiện mục vai đó mở ra có nội dung (access.ts) —
 * phép lịch sự UI, quyền thật vẫn ở từng page + RLS.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // layout /app đã redirect khi chưa đăng nhập — user luôn có ở đây
  const member = await getCurrentMembership(supabase, user?.id ?? "");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsNav role={member?.role ?? ""} />
      {children}
    </div>
  );
}
