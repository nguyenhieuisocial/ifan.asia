import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth/auth-shell";
import { createClient } from "@/lib/supabase/server";
import { rememberInvite } from "../actions";

export const dynamic = "force-dynamic";

/** Lỗi RPC `accept_invitation` → khoá dịch trong namespace "team.accept". */
function mapError(message: string): string {
  for (const key of [
    "invalid_token",
    "invitation_used",
    "invitation_expired",
    "invitation_email_mismatch",
    "seat_limit_reached",
  ]) {
    if (message.includes(key)) return key;
  }
  return "failed";
}

/**
 * Nhận lời mời vào tiệm. Người được mời chưa thuộc tiệm nào nên RLS không cho
 * họ tự tra lời mời — mọi việc đi qua RPC `accept_invitation` (migration #28),
 * hàm này cũng là nơi kiểm lại giới hạn ghế lần cuối (gói có thể đã bị hạ sau
 * khi lời mời được gửi).
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("team.accept");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AuthShell
        title={t("title")}
        subtitle={t("needLogin")}
        footer={<p className="text-xs leading-relaxed">{t("comeBack")}</p>}
      >
        {/* Hai nút đi qua server action để GHI NHỚ mã lời mời trước khi rời
            trang: đăng ký xong là vào thẳng tiệm được mời, không còn phải tự
            bấm lại đường link lần nữa. */}
        <div className="flex flex-col gap-2">
          <form action={rememberInvite.bind(null, token, "login")}>
            <Button type="submit" className="w-full">
              {t("loginCta")}
            </Button>
          </form>
          <form action={rememberInvite.bind(null, token, "signup")}>
            <Button type="submit" variant="outline" className="w-full">
              {t("signupCta")}
            </Button>
          </form>
        </div>
      </AuthShell>
    );
  }

  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (!error) redirect("/app");

  const key = mapError(error.message);
  return (
    <AuthShell title={t("title")}>
      <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-destructive">
        {t(`errors.${key}`)}
      </p>
      <Button asChild variant="outline" className="w-full">
        <Link href="/app">{t("backToApp")}</Link>
      </Button>
    </AuthShell>
  );
}
