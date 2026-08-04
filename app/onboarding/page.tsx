import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createWorkspace } from "@/app/auth/actions";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { INDUSTRIES } from "@/lib/industries";
import { WorkspaceFields } from "./workspace-fields";

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
  const tIndustries = await getTranslations("common.industries");
  // Whitelist: ?error= chỉ được là key trong "auth.errors" — không bao giờ render chuỗi thô
  const errorText = error
    ? tErrors.has(error)
      ? tErrors(error)
      : tErrors("generic")
    : null;
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-24">
      <LocaleSwitcher className="absolute top-4 right-4" />
      <div className="w-full max-w-md space-y-6">
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
          {/* Tên tiệm + địa chỉ rút gọn tự sinh — client component (cần state) */}
          <WorkspaceFields />
          {/* Tiệm mẫu theo ngành: BẮT BUỘC chọn (không preselect) — radio card theo luật thiết kế */}
          <fieldset className="space-y-2 text-left">
            <legend className="text-[13px] font-medium">
              {t("industryLabel")}
            </legend>
            <p className="text-xs text-muted-foreground">{t("industryHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {INDUSTRIES.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary-tint has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                >
                  <input
                    type="radio"
                    name="industry"
                    value={key}
                    required
                    className="sr-only"
                  />
                  <span className="text-[13px] font-medium">
                    {tIndustries(`${key}.label`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tIndustries(`${key}.description`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton className="w-full">{t("submit")}</SubmitButton>
        </form>
      </div>
    </main>
  );
}
