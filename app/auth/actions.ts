"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Message zod = key trong messages/<locale>.json namespace "auth.errors"
const credentialsSchema = z.object({
  email: z.email("emailInvalid"),
  password: z.string().min(8, "passwordMin"),
});

const signUpSchema = credentialsSchema.extend({
  displayName: z.string().trim().max(80, "displayNameTooLong").optional(),
});

const workspaceSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(120, "nameTooLong"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/, "slugInvalid"),
});

/** ?error= luôn mang KEY trong namespace "auth.errors" — page dịch qua whitelist, không bao giờ render chuỗi thô. */
function fail(path: string, errorKey: string): never {
  redirect(`${path}?error=${encodeURIComponent(errorKey)}`);
}

export async function signUp(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName") ?? undefined,
  });
  if (!parsed.success) fail("/signup", parsed.error.issues[0].message);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    // Không leak error.message của Supabase — map về key dịch được
    const key =
      error.code === "user_already_exists" ||
      /already registered/i.test(error.message)
        ? "emailTaken"
        : error.status === 429 || /rate limit/i.test(error.message)
          ? "tryLater"
          : "signUpFailed";
    fail("/signup", key);
  }

  // Email đã có tài khoản: Supabase trả "user giả" (identities rỗng, không session,
  // không error) để chống dò email — báo emailTaken thay vì giả vờ đã gửi mail
  if (!data.session && data.user && (data.user.identities?.length ?? 0) === 0) {
    fail("/signup", "emailTaken");
  }

  // Nếu project tắt email confirmation thì có session ngay → vào onboarding
  if (data.session) {
    // Tên hiển thị tùy chọn — trống thì bỏ qua, trigger DB đã đặt mặc định từ email
    const name = parsed.data.displayName;
    if (name && data.user) {
      await supabase
        .from("profiles")
        .upsert({ user_id: data.user.id, display_name: name });
    }
    redirect("/onboarding");
  }
  redirect("/signup?sent=1");
}

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) fail("/login", parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) fail("/login", "signInFailed");

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
  const parsed = workspaceSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) fail("/onboarding", parsed.error.issues[0].message);

  const supabase = await createClient();

  // Chống tạo tenant kép: đã là thành viên tenant nào thì về thẳng /app
  const { data: existing } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  if (existing) redirect("/app");

  const { error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });
  if (error) {
    const key = /slug_reserved/.test(error.message)
      ? "slugReserved"
      : /duplicate|unique/i.test(error.message)
        ? "slugTaken"
        : "workspaceFailed";
    fail("/onboarding", key);
  }

  // BẮT BUỘC: claim tenant_id chỉ có trong token MỚI (ADR-0001 #11)
  await supabase.auth.refreshSession();
  redirect("/app");
}
