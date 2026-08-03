import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createWorkspace } from "@/app/auth/actions";
import { Input } from "@/components/ui/input";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Double-check auth sau proxy + chống tạo tenant kép: đã có tenant thì về /app
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  if (member) redirect("/app");

  const { error } = await searchParams;
  const t = await getTranslations("auth.onboarding");
  const tErrors = await getTranslations("auth.errors");
  // Whitelist: ?error= chỉ được là key trong "auth.errors" — không bao giờ render chuỗi thô
  const errorText = error
    ? tErrors.has(error)
      ? tErrors(error)
      : tErrors("generic")
    : null;
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-24">
      <LocaleSwitcher className="absolute top-4 right-4" />
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {errorText && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorText}
          </p>
        )}
        <form action={createWorkspace} className="space-y-4">
          <Input
            name="name"
            required
            maxLength={120}
            placeholder={t("namePlaceholder")}
          />
          <Input
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9-]{1,28}[a-z0-9]"
            placeholder={t("slugPlaceholder")}
            className="lowercase"
          />
          <SubmitButton className="w-full">{t("submit")}</SubmitButton>
        </form>
      </div>
    </main>
  );
}
