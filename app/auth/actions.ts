"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { noiQuayLai } from "@/lib/auth/noi-quay-lai";
import { createServiceClient } from "@/lib/supabase/service";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { isRecoverySession } from "@/lib/auth/recovery-session";
import { DEMO_VIEWER_EMAIL, DEMO_VIEWER_PASSWORD, DEMO_TOUR_INDUSTRY } from "@/lib/demo";
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

/**
 * MỘT cửa đăng nhập cho mọi loại tài khoản (chỉ đạo founder 11/08).
 *
 * BỆNH CŨ (founder gọi đúng tên: BUG luồng): hai màn riêng, người dùng phải
 * TỰ CHỌN nhánh trước khi hệ thống nói cho họ biết mình thuộc nhánh nào, rồi
 * nhân viên còn phải gõ "Mã tiệm" — thứ hệ thống hoàn toàn tra được. Mật khẩu
 * mới là thứ chứng minh danh tính; mã tiệm chỉ là khoá tra cứu nội bộ bị đẩy
 * sang cho người dùng gánh.
 *
 * GIỜ: một ô "Email hoặc số điện thoại". Có "@" là email; còn lại là SĐT →
 * hỏi DB xem SĐT đó thuộc những tiệm nào (migration #68) rồi tự thử.
 */
const loginSchema = z.object({
  identifier: z.string().trim().min(1, "identifierRequired"),
  password: z.string().min(8, "passwordMin"),
  /** Chỉ có ở lần gửi thứ hai, khi người dùng vừa chọn tiệm ở bước phân giải. */
  tenantSlug: z.string().trim().toLowerCase().optional(),
});

export type LoginState = {
  error?: string;
  /** SĐT + mật khẩu đúng ở NHIỀU tiệm — hỏi vào tiệm nào (chỉ hiện SAU khi mật khẩu đã đúng). */
  pickShops?: { slug: string; name: string }[];
};

const VN_PHONE = /^0\d{9,10}$/;

/**
 * Chốt cuối: đăng nhập thật (ghi cookie phiên), ghi nhật ký, rồi đi tiếp.
 * Chỉ TRẢ VỀ khi hỏng — thành công thì redirect (ném NEXT_REDIRECT).
 */
async function finishSignIn(
  email: string,
  password: string,
  method: "email" | "staff_phone",
  quayLai: string = AFTER_AUTH_HOME,
): Promise<LoginState> {
  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { error: "signInFailed" };

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
      method,
      headers: await headers(),
    });
  }

  // ĐÃ có tiệm rồi thì KHÔNG tự nhận thêm lời mời sau lưng người ta — bỏ mã đã
  // nhớ, họ tự bấm lại đường link khi muốn (màn nhận lời mời nói rõ từng trường
  // hợp). Chưa có tiệm mới là người được mời thật sự đang cần vào tiệm.
  if (member) {
    await forgetPendingInvite();
    redirect(quayLai);
  }
  return afterInvite(supabase, await consumePendingInvite(supabase));
}

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
    tenantSlug: formData.get("tenantSlug") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { identifier, password, tenantSlug } = parsed.data;
  // Phiên hết hạn giữa chừng thì proxy đá về /login?next=<chỗ đang đứng>; ô ẩn
  // trong form mang nó xuống đây để đăng nhập xong quay lại đúng việc dở.
  const quayLai = noiQuayLai(formData.get("next"));

  // ---------- Nhánh email ----------
  if (identifier.includes("@")) {
    const email = identifier.toLowerCase();
    if (!z.email().safeParse(email).success) return { error: "identifierInvalid" };
    if (await authRateLimited("signin", email)) return { error: "tryLater" };
    return finishSignIn(email, password, "email", quayLai);
  }

  // ---------- Nhánh số điện thoại ----------
  const phone = identifier.replace(/\D/g, ""); // chấp khoảng trắng/gạch người dùng gõ thêm
  if (!VN_PHONE.test(phone)) return { error: "identifierInvalid" };
  if (await authRateLimited("signin", phone)) return { error: "tryLater" };

  // Tra "SĐT thuộc tiệm nào" là thao tác ĐẶC QUYỀN — hàm DB chỉ service_role
  // gọi được (migration #68), không bao giờ để trình duyệt hỏi thẳng.
  const service = createServiceClient();
  if (!service) return { error: "serviceUnavailable" };
  const { data: shopsRaw, error: shopsError } = await service.rpc("staff_login_shops", {
    p_phone: phone,
  });
  if (shopsError) return { error: "signInFailed" };
  const shops = (shopsRaw ?? []) as { tenant_slug: string; tenant_name: string }[];

  // Người dùng vừa chọn tiệm ở bước phân giải: chỉ chấp tiệm CÓ trong danh sách
  // vừa tra — không tin mã tiệm gửi lên từ trình duyệt.
  const candidates = tenantSlug
    ? shops.filter((s) => s.tenant_slug === tenantSlug)
    : shops;
  if (candidates.length === 0) return { error: "signInFailed" };
  if (candidates.length === 1) {
    return finishSignIn(
      staffSyntheticEmail(phone, candidates[0].tenant_slug),
      password,
      "staff_phone",
      quayLai,
    );
  }

  // Một SĐT làm ở nhiều tiệm: dò mật khẩu bằng client TẠM (persistSession:false
  // — không đụng cookie phiên) để biết đúng tiệm nào khớp, TRƯỚC KHI lộ bất kỳ
  // tên tiệm nào. Sai mật khẩu thì người hỏi không học được gì về chỗ làm của ai.
  const matched: typeof candidates = [];
  for (const shop of candidates) {
    const probe = createPlainClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: probeError } = await probe.auth.signInWithPassword({
      email: staffSyntheticEmail(phone, shop.tenant_slug),
      password,
    });
    if (!probeError) matched.push(shop);
  }
  if (matched.length === 0) return { error: "signInFailed" };
  if (matched.length === 1) {
    return finishSignIn(
      staffSyntheticEmail(phone, matched[0].tenant_slug),
      password,
      "staff_phone",
      quayLai,
    );
  }
  return {
    pickShops: matched.map((s) => ({ slug: s.tenant_slug, name: s.tenant_name })),
  };
}

/**
 * Nút "Xem demo nhanh" ở màn đăng nhập — khách ghé web tự vào xem tiệm mẫu.
 *
 * KHÔNG phải đường tắt bỏ qua xác thực: vẫn đăng nhập thật bằng tài khoản xem
 * thử công khai (xem `lib/demo.ts`), rồi gọi ĐÚNG cơ chế tham quan tiệm mẫu đã
 * có (`enter_sample_tenant`) — cơ chế đó gắn vai `viewer`, và vai này bị RLS
 * chặn ghi ở tầng CSDL. Người lạ xem được mọi màn nhưng không sửa/xoá được gì.
 *
 * KHÔNG rate-limit đường này: mật khẩu vốn công khai nên chẳng có gì để dò, mà
 * đếm theo email dùng chung sẽ khiến khách này chặn nhầm khách kia.
 * KHÔNG ghi nhật ký đăng nhập: tài khoản ai cũng vào được, dòng nhật ký không
 * nói lên điều gì ngoài việc làm rác sổ của tiệm mẫu.
 */
export async function signInDemo() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_VIEWER_EMAIL,
    password: DEMO_VIEWER_PASSWORD,
  });
  if (error) fail("/login", "signInFailed");

  const { error: tourError } = await supabase.rpc("enter_sample_tenant", {
    p_industry: DEMO_TOUR_INDUSTRY,
  });
  if (tourError) fail("/login", "signInFailed");

  // BẮT BUỘC: claim tenant_id chỉ có trong token MỚI (ADR-0001 #11).
  await supabase.auth.refreshSession();
  redirect(AFTER_AUTH_HOME);
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  /**
   * ⚠️ HỎNG THÌ NÉM LỖI, TUYỆT ĐỐI KHÔNG CHUYỂN TRANG — sửa 22/08.
   *
   * Bản cũ bỏ qua `error` rồi vẫn `redirect("/login")`. Người dùng thấy trang
   * đăng nhập nên tin là đã thoát, trong khi **phiên vẫn còn sống** — đây là
   * *giả vờ đã đăng xuất*, thứ nguy hiểm nhất ở một nút đăng xuất, vì người ta
   * rời khỏi máy dựa trên niềm tin đó. Máy chung, máy mượn là ca thật.
   *
   * Bên gọi bắt lỗi này và **ở nguyên tại chỗ** kèm câu báo. Một đường code duy
   * nhất cho cả `/app` lẫn `/admin` (bất biến 3) — không đẻ hàm đăng xuất riêng.
   */
  if (error) throw new Error("dang_xuat_hong");
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
  // Tài khoản xem thử dùng chung: không phát thư đặt lại cho nó. Bịt nốt đường
  // thứ hai có thể đổi mật khẩu nút demo, và khỏi đốt quota thư vì email này
  // không có người đọc. Vẫn trả về màn "đã gửi" như mọi email khác — không tiết
  // lộ email nào có tài khoản, email nào không.
  if (parsed.data.email !== DEMO_VIEWER_EMAIL) {
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: await passwordResetRedirectTo(),
    });
  }
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

  // Cờ "phải đổi mật khẩu" KHÔNG được bỏ qua lỗi. Mật khẩu đã đổi xong mà cờ còn
  // bật thì `app/app/layout.tsx` đá thẳng về /force-password-change, và màn đó
  // giữ người dùng lại — vòng lặp kín, không một dòng báo, không vào được app.
  //
  // ⚠️ PHẢI ĐẾM SỐ DÒNG, không chỉ xét `error`. Policy `profiles_update` lọc ở
  // `using`, mà policy lọc dòng thì kết quả là **0 dòng và error = null** —
  // không phân biệt được với thành công. Ở đây người dùng sửa hồ sơ của CHÍNH
  // MÌNH nên đường "sai người" không xảy ra; đường còn lại là **hàng hồ sơ
  // không tồn tại** (trigger tạo hồ sơ lúc đăng ký chưa chạy xong, hoặc hồ sơ
  // bị xoá). Khi đó vẫn ra 0 dòng, vẫn im lặng, và hậu quả đúng như chú thích
  // trên: người dùng bị kẹt vĩnh viễn ở màn đổi mật khẩu.
  // Đo 20/08 (việc #193). Cùng khuôn `luuTruGoi` trong app/app/contracts/actions.ts.
  const { data: hoSo, error: loiCo } = await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("user_id", user.id)
    .select("user_id");
  if (loiCo) {
    console.error("[auth] không hạ được cờ must_change_password:", loiCo.message);
    fail("/force-password-change", "resetFailed");
  }
  if (!hoSo || hoSo.length === 0) {
    console.error("[auth] hạ cờ must_change_password ra 0 dòng — user_id:", user.id);
    fail("/force-password-change", "resetFailed");
  }
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
  // Tài khoản xem thử là CỦA CHUNG mọi khách ghé web. Cho đổi mật khẩu thì
  // người đầu tiên bấm vào đây khoá luôn nút "Xem demo nhanh" của tất cả
  // những người sau — chặn ở đây vì đây là đường duy nhất đổi mật khẩu.
  if (user.email === DEMO_VIEWER_EMAIL)
    fail("/app/settings/account", "demoReadOnly");
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

  // Ngữ cảnh đăng ký cho chuông "tiệm mới đăng ký" (ADR-0007 mục 12b, migration
  // #123) — CHỈ Next.js đọc được header HTTP, trigger CSDL thì không. Dùng lại
  // đúng header đã dùng ở nhật ký đăng nhập (lib/auth/login-events.ts), không
  // gọi dịch vụ định vị trả phí nào (luật hạ tầng 0đ/tháng).
  const h = await headers();
  const { error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_ip: clientIpFrom(h),
    p_city: h.get("x-vercel-ip-city")
      ? decodeURIComponent(h.get("x-vercel-ip-city") as string)
      : null,
    p_region: h.get("x-vercel-ip-country-region"),
    p_country: h.get("x-vercel-ip-country"),
    p_user_agent: h.get("user-agent"),
    p_referrer: h.get("referer"),
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
 * Tham quan tiệm mẫu (15b, migration #64; mở rộng #66 theo ADR-0005) — đứng
 * CẠNH form tạo tiệm ở onboarding, VÀ gọi được từ menu người dùng khi đã có
 * tiệm thật (RPC không còn chặn "already_has_tenant" — founder chọn phương án
 * cho chuyển qua lại nhiều tiệm, 11/08). `returnPath` là nơi quay lại khi RPC
 * lỗi — khác nhau giữa onboarding (chưa có tiệm) và trong app (đã có tiệm).
 * BẮT BUỘC refreshSession(): claim tenant_id chỉ có trong token MỚI (ADR-0001 #11).
 */
export async function enterSampleTenant(industry: Industry, returnPath: string) {
  if (!INDUSTRIES.includes(industry)) fail(returnPath, "workspaceFailed");
  const supabase = await createClient();
  const { error } = await supabase.rpc("enter_sample_tenant", { p_industry: industry });
  if (error) fail(returnPath, "workspaceFailed");
  await supabase.auth.refreshSession();
  redirect(AFTER_AUTH_HOME);
}

/**
 * Thoát tiệm mẫu. Từ #66: người vào tour có thể ĐÃ có tiệm thật (không còn
 * chỉ dành cho khách mới) — về /app nếu còn tiệm thật khác, về /onboarding
 * nếu chưa có gì (khách mới thăm dò, đúng hành vi cũ). Đọc qua my_tenants()
 * chứ không tự query tenant_members: RLS bảng đó chỉ cho thấy ĐÚNG tiệm đang
 * mở (current_tenant_id()), không liệt kê được hết các tiệm của chính mình.
 */
export async function exitSampleTenant() {
  const supabase = await createClient();
  // Thoát hỏng mà vẫn chuyển màn là bẫy NẶNG: người dùng tưởng đã ra khỏi tiệm
  // mẫu và bắt đầu nhập khách/đơn THẬT vào tiệm demo. `switchTenant` ngay bên
  // dưới vốn đã trả lỗi đúng cách — chỗ này bị sót.
  const { error } = await supabase.rpc("exit_sample_tenant");
  if (error) {
    // Hàm này là `action` của form (không nhận giá trị trả về) nên báo lỗi bằng
    // cách quay lại đúng chỗ cũ kèm mã lỗi — khuôn `fail()` dùng khắp file này.
    console.error("[tour] không thoát được tiệm mẫu:", error.message);
    fail("/app", "exitSampleFailed");
  }
  await supabase.auth.refreshSession();
  const { data: mine } = await supabase.rpc("my_tenants");
  const hasReal = (mine ?? []).some((t: { is_sample: boolean }) => !t.is_sample);
  redirect(hasReal ? "/app" : "/onboarding");
}

/**
 * Chuyển tiệm đang chọn (ADR-0005). RPC switch_tenant tự kiểm còn là thành
 * viên active của tiệm đích không, chặn nếu không phải. BẮT BUỘC
 * refreshSession(): claim tenant_id chỉ đổi khi có token mới.
 */
export async function switchTenant(tenantId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("switch_tenant", { p_tenant_id: tenantId });
  if (error) return { error: "switchFailed" as const };
  await supabase.auth.refreshSession();
  redirect(AFTER_AUTH_HOME);
}
