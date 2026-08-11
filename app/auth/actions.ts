"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRecoverySession } from "@/lib/auth/recovery-session";
import { staffSyntheticEmail } from "@/lib/auth/staff-accounts";
import { recordLoginEvent } from "@/lib/auth/login-events";
import { INDUSTRIES, type Industry } from "@/lib/industries";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import {
  consumePendingInvite,
  forgetPendingInvite,
  type PendingInviteOutcome,
} from "@/app/invite/pending";

/**
 * Chống brute-force/spam đăng nhập-đăng ký (bộ đếm trong DB, migration #25).
 *
 * HAI khóa, không phải một:
 * - theo IP (10/phút) — chặn một máy thử nhiều tài khoản
 * - theo EMAIL (10/5 phút) — chặn NHIỀU MÁY cùng dò MỘT tài khoản. Chỉ đếm
 *   theo IP thì kẻ dò rải qua nhiều IP là lọt hết, mà đó mới là cách dò thật.
 *   Email hạ chữ thường để "A@x.com" và "a@x.com" chung một bộ đếm.
 */
async function authRateLimited(
  scope: "signin" | "signup" | "reset" | "password",
  email?: string,
): Promise<boolean> {
  const ip = clientIpFrom(await headers());
  const byIp = await rateLimit(`${scope}:ip:${ip}`, 10, 60);
  if (!byIp.allowed) return true;
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  const byEmail = await rateLimit(`${scope}:email:${normalized}`, 10, 300);
  return !byEmail.allowed;
}

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
  industry: z.enum(INDUSTRIES, "industryRequired"),
});

/** ?error= luôn mang KEY trong namespace "auth.errors" — page dịch qua whitelist, không bao giờ render chuỗi thô. */
function fail(path: string, errorKey: string): never {
  redirect(`${path}?error=${encodeURIComponent(errorKey)}`);
}

/**
 * Nhớ email vừa gửi thư cho nút "Gửi lại thư" ở màn "đã gửi".
 *
 * VÌ SAO LÀ COOKIE: sau redirect sang ?sent=1 server không còn biết email nào —
 * mà đưa email lên URL là lộ dữ liệu cá nhân vào thanh địa chỉ + log truy cập
 * (cùng lý do cookie lời mời ở app/invite/pending.ts). Mỗi luồng một cookie
 * riêng để "gửi lại" không bắn nhầm loại thư sang email của luồng kia.
 */
const RESEND_COOKIE = {
  signup: "ifan_resend_signup",
  reset: "ifan_resend_reset",
} as const;

/** Đủ cho một phiên ngồi chờ thư; hết hạn thì nút "Gửi lại" đưa về form nhập lại. */
const RESEND_MAX_AGE_S = 60 * 60;

async function rememberResendEmail(
  kind: keyof typeof RESEND_COOKIE,
  email: string,
): Promise<void> {
  const proto = (await headers()).get("x-forwarded-proto");
  (await cookies()).set(RESEND_COOKIE[kind], email, {
    httpOnly: true,
    // Chạy sau proxy HTTPS (Vercel) thì cookie chỉ đi trên kết nối mã hoá.
    secure: proto === "https",
    sameSite: "lax",
    path: "/",
    maxAge: RESEND_MAX_AGE_S,
  });
}

/** Email đã nhớ cho nút gửi lại — null nếu cookie hết hạn hoặc bị sửa bậy. */
async function recallResendEmail(
  kind: keyof typeof RESEND_COOKIE,
): Promise<string | null> {
  const raw = (await cookies()).get(RESEND_COOKIE[kind])?.value;
  const parsed = z.email().max(320).safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Màn nhà sau khi xác thực xong — "Hôm nay", KHÔNG phải Tổng quan.
 *
 * Mở app buổi sáng thì việc đầu tiên là biết hôm nay gọi ai, ai đang chờ trả lời;
 * Tổng quan là màn ĐỌC LẠI cuối ngày (cùng lý do đã ghi ở MOBILE_NAV_KEYS trong
 * app/app/sidebar-nav.tsx). Khai MỘT chỗ để mọi cửa vào không lệch nhau khi thêm
 * cửa mới — trước đây mỗi cửa tự viết "/app" nên sửa một chỗ là sót chỗ khác.
 *
 * Ngoại lệ có chủ đích: tiệm VỪA TẠO vẫn về "/app" vì thẻ chọn ngành (dựng tiệm
 * mẫu) nằm ở đó.
 */
const AFTER_AUTH_HOME = "/app/today";

/**
 * Đi tiếp sau khi đã thử nhận lời mời ghi nhớ từ đường link mời:
 *   nhận được  → vào THẲNG tiệm đã mời (bỏ qua bước tạo tiệm mới);
 *   không nhận được → về màn tạo tiệm, kèm lý do bằng tiếng người.
 *
 * `refreshSession` lấy token mới mang claim tenant_id — cùng lý do như
 * `createWorkspace` (ADR-0001 #11).
 */
async function afterInvite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invite: PendingInviteOutcome,
): Promise<never> {
  if (invite.joined) {
    await supabase.auth.refreshSession();
    redirect(AFTER_AUTH_HOME);
  }
  if (invite.errorKey) fail("/onboarding", invite.errorKey);
  redirect("/onboarding");
}

export async function signUp(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName") ?? undefined,
  });
  if (!parsed.success) fail("/signup", parsed.error.issues[0].message);
  if (await authRateLimited("signup", parsed.data.email)) fail("/signup", "tryLater");

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
    // Đăng ký từ đường link mời: tài khoản vừa tạo chắc chắn chưa thuộc tiệm nào
    // nên nhận lời mời ngay tại đây là an toàn.
    await afterInvite(supabase, await consumePendingInvite(supabase));
  }
  // Còn chờ xác nhận email: mã lời mời vẫn nằm trong cookie, xác nhận xong đăng
  // nhập là nhận được — không phải bấm lại đường link. Nhớ email để màn "đã
  // gửi" còn bấm được "Gửi lại thư" mà không bắt gõ lại từ đầu.
  await rememberResendEmail("signup", parsed.data.email);
  redirect("/signup?sent=1");
}

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) fail("/login", parsed.error.issues[0].message);
  if (await authRateLimited("signin", parsed.data.email)) fail("/login", "tryLater");

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) fail("/login", "signInFailed");

  // Có tenant chưa? (claim chỉ có sau refresh — kiểm tra qua bảng)
  const { data: member } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();

  if (signInData.user) {
    await recordLoginEvent(supabase, {
      userId: signInData.user.id,
      tenantId: (member?.tenant_id as string | undefined) ?? null,
      method: "email",
      headers: await headers(),
    });
  }

  // ĐÃ có tiệm rồi thì KHÔNG tự nhận thêm lời mời sau lưng người ta — bỏ mã đã
  // nhớ, họ tự bấm lại đường link khi muốn (màn nhận lời mời nói rõ từng trường
  // hợp). Chưa có tiệm mới là người được mời thật sự đang cần vào tiệm.
  if (member) {
    await forgetPendingInvite();
    redirect(AFTER_AUTH_HOME);
  }
  await afterInvite(supabase, await consumePendingInvite(supabase));
}

const staffSignInSchema = z.object({
  phone: z.string().regex(/^0\d{9,10}$/, "phoneInvalid"),
  tenantSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/, "slugInvalid"),
  password: z.string().min(8, "passwordMin"),
});

/**
 * Đăng nhập nhân viên không cần email (31.29) — SĐT + mã tiệm + mật khẩu,
 * suy ra ĐÚNG email tổng hợp mà createStaffAccount đã dùng lúc tạo (một
 * nguồn sự thật ở lib/auth/staff-accounts.ts). Đã có tiệm thì luôn có sẵn
 * tenant_members nên không cần nhánh "nhận lời mời" như signIn thường.
 */
export async function signInStaffByPhone(formData: FormData) {
  const parsed = staffSignInSchema.safeParse({
    phone: formData.get("phone"),
    tenantSlug: formData.get("tenantSlug"),
    password: formData.get("password"),
  });
  if (!parsed.success) fail("/login/staff", parsed.error.issues[0].message);
  const rateLimitKey = `${parsed.data.phone}.${parsed.data.tenantSlug}`;
  if (await authRateLimited("signin", rateLimitKey)) fail("/login/staff", "tryLater");

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email: staffSyntheticEmail(parsed.data.phone, parsed.data.tenantSlug),
    password: parsed.data.password,
  });
  if (error) fail("/login/staff", "signInFailed");

  if (signInData.user) {
    const { data: member } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .limit(1)
      .maybeSingle();
    await recordLoginEvent(supabase, {
      userId: signInData.user.id,
      tenantId: (member?.tenant_id as string | undefined) ?? null,
      method: "staff_phone",
      headers: await headers(),
    });
  }

  redirect(AFTER_AUTH_HOME);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const emailOnlySchema = z.object({ email: z.email("emailInvalid") });

const newPasswordSchema = z
  .object({
    password: z.string().min(8, "passwordMin"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "passwordMismatch" });

const changePasswordSchema = z
  .object({
    current: z.string().min(1, "currentRequired"),
    password: z.string().min(8, "passwordMin"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "passwordMismatch" });

/**
 * Gửi thư đặt lại mật khẩu.
 *
 * LUÔN báo "đã gửi" kể cả khi email không có tài khoản. Báo "email không tồn
 * tại" là biến màn này thành máy dò danh sách khách hàng của iFan: gõ 1000 email
 * là biết tiệm nào đang dùng. Người quên mật khẩu thật vẫn nhận được thư.
 *
 * Link trong thư về /auth/confirm, cửa này nhận CẢ HAI kiểu mã (xem chú thích ở
 * đó) vì Supabase gói miễn phí chưa cho thay mẫu thư.
 */
export async function requestPasswordReset(formData: FormData) {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) fail("/forgot-password", parsed.error.issues[0].message);
  if (await authRateLimited("reset", parsed.data.email))
    fail("/forgot-password", "tryLater");

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: await passwordResetRedirectTo(),
  });
  // Nhớ email để màn "đã gửi" còn bấm được "Gửi lại thư"
  await rememberResendEmail("reset", parsed.data.email);
  redirect("/forgot-password?sent=1");
}

/** Link trong thư đặt lại về /auth/confirm — dùng chung cho gửi lần đầu và gửi lại. */
async function passwordResetRedirectTo(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/auth/confirm`;
}

/**
 * Gửi LẠI thư — lõi chung cho hai màn "đã gửi" (xác nhận đăng ký + đặt lại mật
 * khẩu). Email lấy từ cookie đã nhớ lúc gửi lần đầu, KHÔNG nhận từ form: màn
 * "đã gửi" mà nhận email tự do là thành máy bắn thư nặc danh.
 *
 * Giữ NGUYÊN hàng rào của lần gửi đầu: cùng bộ đếm authRateLimited (không nới),
 * và lỗi kiểu "email không có tài khoản / đã xác nhận rồi" bị nuốt — báo khác
 * đi là màn này thành máy dò email nào có tài khoản iFan. Riêng đụng trần gửi
 * thư của Supabase (2 thư/giờ) thì nói tiếng người qua khóa `emailRateLimited`,
 * không lộ chi tiết kỹ thuật.
 *
 * KHÔNG dùng fail(): phải giữ ?sent=1 trên URL, rớt nó là màn quay về form
 * nhập liệu như chưa từng gửi thư nào.
 */
async function resendAuthEmail(
  kind: keyof typeof RESEND_COOKIE,
  formPath: "/signup" | "/forgot-password",
  send: (
    supabase: Awaited<ReturnType<typeof createClient>>,
    email: string,
  ) => Promise<{ error: { status?: number; message: string } | null }>,
): Promise<never> {
  const email = await recallResendEmail(kind);
  // Cookie hết hạn → không còn biết gửi cho ai, về form gõ lại email
  if (!email) redirect(formPath);
  if (await authRateLimited(kind, email))
    redirect(`${formPath}?sent=1&error=tryLater`);

  const supabase = await createClient();
  const { error } = await send(supabase, email);
  if (error && (error.status === 429 || /rate limit/i.test(error.message)))
    redirect(`${formPath}?sent=1&error=emailRateLimited`);
  redirect(`${formPath}?sent=1`);
}

/** Gửi lại thư xác nhận đăng ký (nút trên màn "đã gửi" của /signup). */
export async function resendSignUpEmail() {
  await resendAuthEmail("signup", "/signup", (supabase, email) =>
    supabase.auth.resend({ type: "signup", email }),
  );
}

/** Gửi lại thư đặt lại mật khẩu (nút trên màn "đã gửi" của /forgot-password). */
export async function resendPasswordReset() {
  await resendAuthEmail("reset", "/forgot-password", async (supabase, email) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: await passwordResetRedirectTo(),
    }),
  );
}

/**
 * Đặt mật khẩu mới sau khi bấm link trong thư. Phiên tạm đã được /auth/confirm
 * tạo trước đó — không có phiên nghĩa là link hỏng/hết hạn.
 */
export async function resetPassword(formData: FormData) {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) fail("/reset-password", parsed.error.issues[0].message);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("/forgot-password", "linkInvalid");
  // Chốt chặn THẬT nằm ở đây, không phải ở màn: chặn ở màn thôi thì gọi thẳng
  // action là qua mặt được. Xem lib/auth/recovery-session.ts.
  if (!(await isRecoverySession(supabase))) redirect("/app/settings/account");

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) fail("/reset-password", "resetFailed");

  // Đá mọi thiết bị KHÁC ra: người đặt lại mật khẩu thường vì nghi bị lộ, để
  // phiên cũ sống tiếp là vô hiệu hóa chính lý do họ đặt lại.
  await supabase.auth.signOut({ scope: "others" });
  redirect(AFTER_AUTH_HOME);
}

/**
 * Buộc đặt mật khẩu riêng lần đầu (31.29) — chặn ở khung /app/layout.tsx
 * (must_change_password), không phải chỉ ẩn nút. Không đòi mật khẩu tạm hiện
 * tại như updatePassword: phiên vừa mở bằng chính mật khẩu tạm giây trước,
 * bắt gõ lại là làm phiền vô ích (khác resetPassword qua link thư ở chỗ
 * không cần isRecoverySession — đây là phiên đăng nhập thường, đã xác thực).
 */
export async function changeForcedPassword(formData: FormData) {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) fail("/force-password-change", parsed.error.issues[0].message);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) fail("/force-password-change", "resetFailed");

  await supabase.from("profiles").update({ must_change_password: false }).eq("user_id", user.id);
  redirect(AFTER_AUTH_HOME);
}

/**
 * Đổi mật khẩu khi đang đăng nhập. BẮT BUỘC nhập mật khẩu hiện tại — nếu không,
 * ai mượn được máy đang mở iFan là chiếm luôn tài khoản.
 */
export async function updatePassword(formData: FormData) {
  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success)
    fail("/app/settings/account", parsed.error.issues[0].message);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  if (await authRateLimited("password", user.email))
    fail("/app/settings/account", "tryLater");

  // Xác minh lại bằng chính mật khẩu hiện tại (cùng tài khoản nên phiên không đổi chủ)
  const { error: reauth } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  });
  if (reauth) fail("/app/settings/account", "currentWrong");

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) fail("/app/settings/account", "resetFailed");

  await supabase.auth.signOut({ scope: "others" });
  redirect("/app/settings/account?done=1");
}

/**
 * Địa chỉ rút gọn còn trống không? Trả lời NGAY lúc gõ, thay vì để chủ tiệm
 * bấm gửi rồi mới bị đá về kèm lỗi.
 *
 * Đọc qua RPC `slug_available` (security definer, migration #32) vì bảng
 * `tenants` bị RLS chặn: người mới đăng ký chưa thuộc tenant nào nên không đọc
 * được hàng nào để tự so. Hàm chỉ trả 4 nhãn cố định, không lộ tên tiệm nào.
 */
export async function checkWorkspaceSlug(
  slug: string,
): Promise<{ status: "ok" | "taken" | "reserved" | "invalid" }> {
  const parsed = z.string().trim().toLowerCase().max(60).safeParse(slug);
  if (!parsed.success) return { status: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "invalid" };

  // Gõ phím nào cũng gọi → nới hơn các thao tác ghi, vẫn chặn dò hàng loạt
  const { allowed } = await rateLimit(`slug-check:user:${user.id}`, 60, 60);
  if (!allowed) return { status: "invalid" };

  const { data, error } = await supabase.rpc("slug_available", {
    p_slug: parsed.data,
  });
  if (error) return { status: "invalid" };
  return { status: data === "ok" || data === "taken" || data === "reserved" ? data : "invalid" };
}

export async function createWorkspace(formData: FormData) {
  const parsed = workspaceSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    industry: formData.get("industry"),
  });
  if (!parsed.success) fail("/onboarding", parsed.error.issues[0].message);

  const supabase = await createClient();

  // Chống tạo tenant kép. Chốt THẬT nằm ở `create_tenant` trong DB (migration
  // #41) — hỏi lại đúng chốt đó qua `can_create_tenant()` thay vì chép luật lần
  // hai ở web, nếu không thì tài khoản được founder nâng hạn mức sẽ bị chính
  // dòng này chặn trước khi kịp gọi RPC.
  const { data: canCreate } = await supabase.rpc("can_create_tenant");
  if (canCreate === false) redirect("/app");

  const { error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });
  if (error) {
    const key = /slug_reserved/.test(error.message)
      ? "slugReserved"
      : /duplicate|unique/i.test(error.message)
        ? "slugTaken"
        : /tenant_limit_reached/.test(error.message)
          ? "tenantLimitReached"
          : "workspaceFailed";
    fail("/onboarding", key);
  }

  // BẮT BUỘC: claim tenant_id chỉ có trong token MỚI (ADR-0001 #11)
  await supabase.auth.refreshSession();

  // Industry Pack Engine (migration #60/#61): áp pack + seed tag/quick-reply
  // mẫu theo ngành đã chọn. Gọi SAU refreshSession vì hàm DB đọc tenant từ
  // claim JWT. Lỗi áp pack KHÔNG chặn onboarding: industry còn null →
  // dashboard hiện card "Chọn ngành" cho owner/admin bấm lại (đường retry tự
  // nhiên, không kẹt).
  await supabase.rpc("apply_industry_pack", {
    p_pack_key: parsed.data.industry,
  });
  redirect("/app");
}

/**
 * Tham quan tiệm mẫu (15b, migration #64) — đứng CẠNH form tạo tiệm ở
 * onboarding, không thay thế. RPC enter_sample_tenant tự kiểm "chưa có
 * tiệm thật" (phạm vi V1a — xem ghi chú đầu migration #64), gán vai viewer.
 * BẮT BUỘC refreshSession() như createWorkspace: claim tenant_id chỉ có
 * trong token MỚI (ADR-0001 #11) — thiếu bước này thì layout /app đọc
 * tenant cũ (rỗng) và đá ngược lại /onboarding, vào không được.
 */
export async function enterSampleTenant(industry: Industry) {
  if (!INDUSTRIES.includes(industry)) fail("/onboarding", "workspaceFailed");
  const supabase = await createClient();
  const { error } = await supabase.rpc("enter_sample_tenant", { p_industry: industry });
  if (error) {
    const key = error.message === "already_has_tenant" ? "tenantLimitReached" : "workspaceFailed";
    fail("/onboarding", key);
  }
  await supabase.auth.refreshSession();
  redirect(AFTER_AUTH_HOME);
}

/** Thoát tiệm mẫu — về đúng onboarding để tiếp tục tạo tiệm thật (điểm 3, mục 15b). */
export async function exitSampleTenant() {
  const supabase = await createClient();
  await supabase.rpc("exit_sample_tenant");
  await supabase.auth.refreshSession();
  redirect("/onboarding");
}
