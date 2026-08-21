import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { switchTenant } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { getTenantPack } from "@/lib/tenant-pack";
import type { Industry } from "@/lib/industries";
import type { Locale } from "@/i18n/config";
import { BrandMark } from "@/components/brand-mark";
import { GlobalSearchHeaderTrigger } from "@/components/global-search/global-search";
import { BoiCanhBangLenh } from "@/components/global-search/boi-canh";
import { KeoDeTaiLai } from "@/components/keo-de-tai-lai";
import { coBat } from "@/lib/cong-tac";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { SupportSessionBanner } from "@/components/support/support-session-banner";
import { fetchActiveSupportSession } from "./support/queries";
import { MobileNav, SidebarNav } from "./sidebar-nav";
import { SampleTourBanner } from "./sample-tour-banner";
import { UserMenu } from "./user-menu";

export const dynamic = "force-dynamic";

/** Hàng tiệm còn hiệu lực của CHÍNH mình — khớp cột RPC `my_tenants()` (migration #66). */
type MyTenantRow = { tenant_id: string; name: string };

/**
 * Đổi tiệm từ màn chặn bên dưới. Bọc `switchTenant` (KHÔNG viết lại RPC) chỉ vì
 * một lý do kỹ thuật: `switchTenant` trả `{error}` khi RPC hỏng, còn `action`
 * của <form> bắt buộc trả void. Đường thành công đã `redirect()` bên trong nó.
 */
async function doiSangTiemKhac(tenantId: string) {
  "use server";
  const res = await switchTenant(tenantId);
  // Tới được đây nghĩa là RPC hỏng. Không nuốt im lặng: ghi log để còn lần ra,
  // còn người dùng thấy lại đúng màn chọn tiệm này để bấm lần nữa.
  if (res?.error) {
    console.error(
      "[shell] không đổi được tiệm sau khi mất tư cách thành viên:",
      tenantId,
    );
  }
}

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

  const [
    { data: tenant },
    { data: profile },
    member,
    pack,
    activeSupportSession,
    locale,
  ] = await Promise.all([
    // id cho MobileNav: đặt tên topic realtime Hộp thư (badge số chưa trả lời)
    // is_sample/industry: dải cam "đang xem tiệm mẫu" (15b, migration #64)
    supabase
      .from("tenants")
      .select("id, name, slug, is_sample, industry")
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name, must_change_password")
      .eq("user_id", user.id)
      .maybeSingle(),
    // Tư cách thành viên trong tiệm đang mở: vừa là CHỐT VÀO CỬA (xem khối
    // `if (!member)` ngay dưới), vừa cho nav biết vai để ẩn mục không thuộc vai.
    getCurrentMembership(supabase, user.id),
    // Khung nav theo pack (Quy hoạch mục 35.1 việc 8): nhãn Khách/Cơ hội đổi
    // theo từ vựng ngành — chưa chọn ngành thì terminology rỗng, nav dùng
    // đúng chuỗi mặc định hiện có.
    getTenantPack(supabase),
    // Dải "iFan đang xem tiệm bạn để hỗ trợ" (ADR-0006 mục 6, task #81) —
    // dính MỌI màn suốt phiên, không riêng màn nào đọc lại trạng thái này.
    fetchActiveSupportSession(supabase),
    getLocale(),
  ]);
  if (!tenant) redirect("/onboarding");
  // Bất biến 31.29: mật khẩu tạm bắt đổi ngay lần vào đầu — chặn ở ĐÂY (khung
  // bọc mọi /app/*), không phải chỉ ẩn nút, nên không đường nào lách qua được.
  if (profile?.must_change_password) redirect("/force-password-change");

  // Không còn tư cách thành viên CÒN HIỆU LỰC trong tiệm đang mở ⇒ không vào
  // được màn nào của /app. Chặn ở KHUNG, cùng nếp với hai chốt ngay trên.
  //
  // Trước 20/08 chỗ này chỉ dùng để ẩn bớt mục trên thanh điều hướng, với lý do
  // "lịch sự UI — quyền thật vẫn ở từng page + RLS". Nguyên tắc ấy ĐÚNG, nhưng
  // áp ở đây thì SAI (cùng dạng sai lầm đã ghi trong migration #202: nguyên tắc
  // đúng, chỗ áp sai). Đo thật trên CSDL, đóng vai người vừa bị gỡ:
  //   · `removeMember` chỉ đổi `status='removed'`, KHÔNG xoá dòng;
  //   · `current_tenant_id()`/`app_role()` đọc từ THẺ đăng nhập (sống ~1 giờ)
  //     nên vẫn coi họ là admin tiệm cũ ⇒ RLS không gác được;
  //   · ghi thử vào `deals`/`saved_views`: CSDL KHÔNG chặn ⇒ tầng web là chốt
  //     DUY NHẤT, mà nhiều page/server action lại không tự gác.
  // ⇒ "quyền thật ở từng page + RLS" không đúng trên thực tế, nên phải gác ở gốc.
  if (!member) {
    // `my_tenants()` (security definer, không tham số) là cách DUY NHẤT thấy hết
    // tiệm của chính mình: RLS `tenant_members`/`tenants` chỉ cho thấy tiệm đang mở.
    const { data: mine } = await supabase.rpc("my_tenants");
    // Hàm đó lọc `status='active'` nhưng KHÔNG xét `expires_at` (đo 20/08) ⇒ với
    // phiên hỗ trợ chỉ-đọc vừa hết hạn, nó vẫn liệt kê chính tiệm ĐANG MỞ. Bỏ
    // tiệm đang mở ra, không thì bấm vào nó chỉ quay lại đúng màn này.
    const tiemKhac = ((mine ?? []) as MyTenantRow[]).filter(
      (row) => row.tenant_id !== tenant.id,
    );
    // Hết sạch tiệm ⇒ về /onboarding, đúng đường của người chưa có tiệm nào.
    // CHỈ đi đường này khi danh sách RỖNG. Đo được: người còn tiệm khác mà bị đá
    // về /onboarding thì hoặc bị `can_create_tenant()=false` đá ngược lại /app
    // (vòng lặp), hoặc `=true` rồi đẻ ra một tiệm rác. Cả hai đều sai.
    if (tiemKhac.length === 0) redirect("/onboarding");
    const tNoAccess = await getTranslations("shell.noAccess");
    return (
      <div className="flex h-svh w-full flex-col items-center justify-center gap-5 p-6">
        <BrandMark suffix />
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-base font-semibold">{tNoAccess("title")}</h1>
          <p className="text-sm text-muted-foreground">{tNoAccess("body")}</p>
          <ul className="space-y-2">
            {tiemKhac.map((row) => (
              <li key={row.tenant_id}>
                <form action={doiSangTiemKhac.bind(null, row.tenant_id)}>
                  <button
                    type="submit"
                    // `max-md:min-h-11` = 44px trên điện thoại. Không có nó thì nút này cao
                    // ~42px — thấp hơn ĐÚNG cái luật vùng chạm chốt cùng đêm
                    // (`design-system/luat-vung-cham.html`). Luật tự mâu thuẫn ngay
                    // trong màn mới nhất là cách nhanh nhất để luật chết.
                    className="w-full rounded-lg border px-3.5 py-2.5 text-left text-sm font-medium transition-colors max-md:min-h-11 hover:border-primary/40 hover:bg-primary-tint"
                  >
                    {row.name}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  const role = member.role;
  // Tiệm mẫu (15b) chỉ gắn vai viewer — kiểm cả hai vế phòng khi sau này có
  // vai khác vào tiệm is_sample (không đoán chỉ từ is_sample một mình).
  const isSampleTour = tenant.is_sample === true && role === "viewer";

  /**
   * ⚠️ LỚP CÂU CHỮ ĐẦY ĐỦ cho khu sau đăng nhập. Khung gốc CỐ Ý chỉ trao phần
   *   công khai (xem `i18n/nhanh-cong-khai.ts`): đo 22/08, trao cả kho làm mọi
   *   trang giới thiệu cõng thêm 219 KB chữ của các màn chỉ dùng khi đã đăng
   *   nhập. Lớp này chỉ dựng cho người ĐÃ đăng nhập.
   */
  const chuDayDu = await getMessages();

  return (
    <NextIntlClientProvider messages={chuDayDu}>
      {/* Bang lenh (Ctrl K) mo duoc tu thanh tren VA tu man "Hom nay" — ca hai
        deu can biet vai de khong goi y mot canh cua khoa. Boc o day mot lan
        thay vi chuyen tay qua tung lop man o giua. */}
      <BoiCanhBangLenh role={role} pack={pack} bat={await coBat("bang-lenh")}>
      <div className="flex h-svh w-full flex-col overflow-hidden">
        {/* Mất mạng đứng TRƯỚC dải tiệm mẫu — chuyện mạng cấp bách hơn nhắc tham quan. */}
        <OfflineBanner />
        {isSampleTour && (
          <SampleTourBanner
            industry={(tenant.industry as Industry | null) ?? null}
          />
        )}
        {activeSupportSession && (
          <SupportSessionBanner
            session={activeSupportSession}
            locale={locale as Locale}
          />
        )}
        <div className="flex min-h-0 flex-1 w-full overflow-hidden">
          {/* `min-h-0`: con của flex mặc định min-height:auto ⇒ KHÔNG co lại được,
            nên lớp cuộn của <SidebarNav> bên trong sẽ vô tác dụng nếu thiếu dòng
            này. Xem ADR-0026 mục 1.1. */}
          <aside className="hidden w-60 min-h-0 shrink-0 flex-col border-r bg-sidebar md:flex">
            <div className="flex h-12 shrink-0 items-center border-b px-4">
              <BrandMark suffix />
            </div>
            <SidebarNav role={role} pack={pack} />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem_+_env(safe-area-inset-bottom))] md:pb-0">
            <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
              <div className="flex min-w-0 items-baseline gap-2">
                <p className="truncate text-sm font-semibold">{tenant.name}</p>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  @{tenant.slug}
                </p>
              </div>
              {/* Vùng chạm 44×44 cho cả ba nút (tìm · chuông · ảnh đại diện).
                Ba nút này nằm ở MỌI màn nên nới ở đây một lần thay vì sửa từng
                component. Chỉ nới min-width/min-height của chính cái nút —
                biểu tượng bên trong giữ nguyên cỡ, và 44 < 48 (h-12) nên thanh
                trên KHÔNG cao thêm. `>button` chỉ với tới 4 nút con trực tiếp;
                nội dung menu/hộp thoại nằm ở portal nên không dính. */}
              <div className="flex shrink-0 items-center gap-1 max-md:[&>button]:min-h-11 max-md:[&>button]:min-w-11">
                <GlobalSearchHeaderTrigger />
                <NotificationBell />
                <UserMenu
                  email={user.email ?? ""}
                  displayName={profile?.display_name ?? null}
                />
              </div>
            </header>
            <main
              id="noi-dung-chinh"
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              {children}
            </main>
          </div>
          <MobileNav tenantId={tenant.id as string} role={role} pack={pack} />
        </div>
        {/* Kéo xuống để tải lại (thẻ `man-thao-tac-kieu-app`). MỘT bản duy nhất
          ở khung: mỗi màn có lớp cuộn riêng, gắn tay vào từng màn là 40 chỗ
          phải nhớ và chỗ nào quên thì người dùng thấy iFan "lúc có lúc không".
          Nó tự tìm lớp cuộn gần nhất của chỗ ngón tay chạm. */}
        <KeoDeTaiLai />
        {/* Mời cài lên máy — chỉ hỏi người ĐÃ đăng nhập, không hỏi khách lạ ghé landing. */}
        <InstallPrompt />
      </div>
      </BoiCanhBangLenh>
    </NextIntlClientProvider>
  );
}
