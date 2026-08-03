"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Message zod = key trong messages/<locale>.json namespace "auth.errors"
const credentialsSchema = z.object({
  email: z.email("emailInvalid"),
  password: z.string().min(8, "passwordMin"),
});

const workspaceSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(120, "nameTooLong"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/, "slugInvalid"),
});

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function signUp(formData: FormData) {
  const t = await getTranslations("auth.errors");
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) fail("/signup", t(parsed.error.issues[0].message));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) fail("/signup", error.message);

  // Nếu project tắt email confirmation thì có session ngay → vào onboarding
  if (data.session) redirect("/onboarding");
  redirect("/signup?sent=1");
}

export async function signIn(formData: FormData) {
  const t = await getTranslations("auth.errors");
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) fail("/login", t(parsed.error.issues[0].message));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) fail("/login", t("signInFailed"));

  // Có tenant chưa? (claim chỉ có sau refresh — kiểm tra qua bảng)
  const { data: member } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  redirect(member ? "/app" : "/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createWorkspace(formData: FormData) {
  const t = await getTranslations("auth.errors");
  const parsed = workspaceSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) fail("/onboarding", t(parsed.error.issues[0].message));

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });
  if (error) {
    const msg = /slug_reserved/.test(error.message)
      ? t("slugReserved")
      : /duplicate|unique/i.test(error.message)
        ? t("slugTaken")
        : t("workspaceFailed");
    fail("/onboarding", msg);
  }

  // BẮT BUỘC: claim tenant_id chỉ có trong token MỚI (ADR-0001 #11)
  await supabase.auth.refreshSession();
  redirect("/app");
}
