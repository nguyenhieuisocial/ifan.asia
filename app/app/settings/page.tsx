import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight, CreditCard, Radio, Users, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { visibleSettingsItems, type SettingsGroup } from "./access";

export const dynamic = "force-dynamic";

/** Thứ tự + icon 4 cụm card — mô tả nằm ở settings.index.groups.* (vi+en). */
const GROUPS: { group: SettingsGroup; icon: typeof Radio }[] = [
  { group: "channels", icon: Radio },
  { group: "team", icon: Users },
  { group: "automation", icon: Zap },
  { group: "billing", icon: CreditCard },
];

/**
 * /app/settings — trang index khu Cài đặt: 4 cụm card Kênh / Đội ngũ /
 * Tự động hóa / Gói & tiền (trước đây redirect thẳng vào Kênh kết nối, người
 * dùng không có bức tranh chung). Mục con lọc theo vai (access.ts) — cụm nào
 * vai này không còn mục nào thì ẩn cả card.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // layout /app đã redirect khi chưa đăng nhập — user luôn có ở đây
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const items = visibleSettingsItems(member?.role ?? "");

  const t = await getTranslations("settings.index");
  const tNav = await getTranslations("settings.nav");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {GROUPS.map(({ group, icon: Icon }) => {
            const links = items.filter((i) => i.group === group);
            if (links.length === 0) return null;
            return (
              <section key={group} className="rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  <h2 className="text-sm font-semibold">
                    {t(`groups.${group}.title`)}
                  </h2>
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {t(`groups.${group}.description`)}
                </p>
                <ul className="mt-3 space-y-0.5">
                  {links.map(({ key, href }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="-mx-1.5 flex items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                      >
                        {tNav(key)}
                        <ChevronRight
                          className="size-3.5 shrink-0 text-muted-foreground/60"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
