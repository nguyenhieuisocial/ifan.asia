"use client";

import { useMemo, useTransition } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { enterSampleTenant, signOut, switchTenant } from "@/app/auth/actions";
import { canSeeNavItem, MOBILE_OVERFLOW_ITEMS } from "@/app/app/sidebar-nav";
import { fetchPendingApprovalCount } from "@/app/app/approvals/queries";
import { setLocale } from "@/i18n/actions";
import { createClient } from "@/lib/supabase/client";
import { SPOTLIGHT_INDUSTRIES } from "@/lib/industries";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Hàng trong menu chuyển tiệm — khớp cột trả về của RPC my_tenants() (ADR-0005). */
type MyTenantRow = {
  tenant_id: string;
  name: string;
  slug: string;
  industry: string | null;
  role: string;
  is_sample: boolean;
  is_active: boolean;
};

const THEMES = ["light", "dark", "system"] as const;

/** Nhịp hỏi lại số phiếu chờ duyệt — mẫu chuông thông báo (POLL_MS), RPC đếm trong CSDL nên rẻ. */
const APPROVAL_POLL_MS = 60_000;

/** Trên 99 thì con số cụ thể không còn giúp gì — bóp gọn để không vỡ huy hiệu (mẫu chuông). */
const BADGE_MAX = 99;

export function UserMenu({
  email,
  displayName,
  role,
}: {
  email: string;
  displayName: string | null;
  role: string;
}) {
  const t = useTranslations("shell.userMenu");
  const tNav = useTranslations("shell.nav");
  const tTheme = useTranslations("common.theme");
  const tIndustries = useTranslations("common.industries");
  const tRoles = useTranslations("team.roles");
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const supabase = useMemo(() => createClient(), []);
  const shown = displayName || email;
  const [switching, startSwitch] = useTransition();

  // Menu chuyển tiệm (ADR-0005) — my_tenants() là security definer, không lộ
  // tiệm người khác. staleTime dài: đổi tiệm luôn redirect() (điều hướng
  // trang thật), nên component này mount lại mỗi lần dù sao.
  const tenantsQuery = useQuery({
    queryKey: ["my-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_tenants");
      if (error) throw error;
      return (data ?? []) as MyTenantRow[];
    },
    staleTime: 60_000,
  });
  const myTenants = tenantsQuery.data ?? [];
  const realTenants = myTenants.filter((row) => !row.is_sample);
  const activeSampleIndustry = myTenants.find((row) => row.is_sample)?.industry ?? null;

  const doSwitch = (tenantId: string) => {
    startSwitch(async () => {
      const res = await switchTenant(tenantId);
      if (res?.error) toast.error(t("switchFailed"));
    });
  };
  const doEnterSample = (industry: (typeof SPOTLIGHT_INDUSTRIES)[number]) => {
    startSwitch(async () => {
      await enterSampleTenant(industry, "/app/today");
    });
  };

  // Trên điện thoại màn Duyệt nằm khuất trong menu này — phiếu chờ mình duyệt
  // sẽ nằm im không ai biết. Đếm như chuông thông báo (approval_pending_count,
  // migration #37: CSDL đếm) → chấm đỏ trên avatar + con số cạnh mục "Duyệt".
  const pendingQuery = useQuery({
    queryKey: ["approvals", "pending-count"],
    queryFn: () => fetchPendingApprovalCount(supabase),
    refetchInterval: APPROVAL_POLL_MS,
  });
  const pendingCount = pendingQuery.data ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative gap-2 px-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">
              {(shown[0] ?? "?").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {/* Chấm đỏ CHỈ <md: desktop có mục Duyệt ngay trên sidebar, chấm ở
              avatar chỉ gây thắc mắc. Con số cụ thể nằm cạnh mục "Duyệt" trong
              menu (screen reader đọc số ở đó) — chấm này thuần trang trí. */}
          {pendingCount > 0 && (
            <span
              aria-hidden
              className="absolute top-1 right-1 size-2 rounded-full bg-destructive md:hidden"
            />
          )}
          <span className="hidden max-w-44 truncate text-sm sm:inline">
            {shown}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        {/* Chuyển tiệm (ADR-0005) — CHỈ hiện khi có ≥2 tiệm thật, tránh menu
            dài vô ích cho đa số chủ tiệm nhỏ chỉ có 1 tiệm (đúng thẻ design
            chuyen-tiem.html nhóm 2). */}
        {realTenants.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t("myTenants")}
            </DropdownMenuLabel>
            {realTenants.map((row) => (
              <DropdownMenuItem
                key={row.tenant_id}
                disabled={switching}
                onSelect={() => doSwitch(row.tenant_id)}
              >
                <span className="w-3.5 shrink-0">
                  {row.is_active && <Check className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                  {tRoles(row.role)}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        {/* Xem thử tiệm mẫu — hiện với MỌI người, không phụ thuộc số tiệm
            đang có (khách đã có tiệm thật vẫn xem được ngành khác, 11/08). */}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={switching}>
            {t("sampleTour")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {SPOTLIGHT_INDUSTRIES.map((key) => (
              <DropdownMenuItem key={key} onSelect={() => doEnterSample(key)}>
                {activeSampleIndustry === key && <Check className="size-3.5" />}
                {tIndustries(`${key}.label`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {/* Chỉ <md: thanh đáy chỉ có 4 ô, các mục còn lại (Cài đặt, Công ty,
            Báo cáo, Duyệt) không có lối vào nào khác trên điện thoại.
            Lọc theo vai: staff không thấy Báo cáo (mở ra chỉ gặp "không có
            quyền" — cùng luật với sidebar). */}
        <div className="md:hidden">
          <DropdownMenuSeparator />
          {MOBILE_OVERFLOW_ITEMS.filter((item) => canSeeNavItem(item, role)).map(
            ({ href, labelKey, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href}>
                  <Icon />
                  {tNav(labelKey)}
                  {/* Số phiếu đang chờ chính mình duyệt — screen reader đọc số
                      như một phần nhãn mục menu */}
                  {labelKey === "approvals" && pendingCount > 0 && (
                    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white">
                      {pendingCount > BADGE_MAX ? `${BADGE_MAX}+` : pendingCount}
                    </span>
                  )}
                </Link>
              </DropdownMenuItem>
            ),
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("language")}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void setLocale("vi")}>
          {t("vietnamese")}
          {locale === "vi" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void setLocale("en")}>
          {t("english")}
          {locale === "en" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {tTheme("label")}
        </DropdownMenuLabel>
        {THEMES.map((mode) => (
          <DropdownMenuItem key={mode} onSelect={() => setTheme(mode)}>
            {tTheme(mode)}
            {theme === mode && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
