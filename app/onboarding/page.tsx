import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createWorkspace, enterSampleTenant } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { INDUSTRIES, SPOTLIGHT_INDUSTRIES } from "@/lib/industries";
import { WorkspaceFields } from "./workspace-fields";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Double-check auth sau proxy + chống tạo tenant kép.
  // Hỏi thẳng chốt hạn mức trong DB (`can_create_tenant`, migration #41) thay vì
  // tự suy từ bảng thành viên: tài khoản được founder nâng hạn mức (chuỗi nhiều
  // chi nhánh) vẫn vào được màn này, còn tài khoản thường vẫn về /app như cũ.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: canCreate } = await supabase.rpc("can_create_tenant");
  if (canCreate === false) redirect("/app");

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
    <AuthShell wide title={t("title")} subtitle={t("subtitle")}>
      {errorText && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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

      {/* Tham quan tiệm mẫu (15b) — đứng CẠNH form tạo tiệm, không thay thế. */}
      <div className="mt-6 border-t pt-5 text-center">
        <p className="text-[13px] text-muted-foreground">{t("sampleTour.intro")}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {SPOTLIGHT_INDUSTRIES.map((key) => (
            <form key={key} action={enterSampleTenant.bind(null, key)}>
              <button
                type="submit"
                className="h-8 rounded-lg border px-3.5 text-[13px] font-medium transition-colors hover:border-primary/40 hover:bg-primary-tint"
              >
                {t("sampleTour.buttonPrefix")} {tIndustries(`${key}.label`)}
              </button>
            </form>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}
