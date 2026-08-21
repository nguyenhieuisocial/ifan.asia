"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { coKhoaBiMat } from "@/lib/push/khoa";

/**
 * ĐĂNG KÝ / HUỶ ĐĂNG KÝ nhận thông báo đẩy trên một THIẾT BỊ.
 *
 * ⚠️ MỘT THIẾT BỊ MỘT DÒNG, và dòng đó luôn thuộc về NGƯỜI ĐANG ĐĂNG NHẬP.
 *   Đây không phải chi tiết nhỏ: quầy lễ tân là một máy dùng chung. Chị A bật
 *   thông báo rồi đăng xuất, chị B đăng nhập — nếu dòng đăng ký vẫn mang tên
 *   chị A thì chị B sẽ nhận thông báo RIÊNG của chị A trên đúng máy đó, gồm cả
 *   tin nhắn riêng. Nên `luuDangKyDay` GHI ĐÈ chủ sở hữu theo endpoint, và
 *   trang gọi nó ở mỗi lần mở để chủ sở hữu luôn khớp người đang dùng.
 */

const dangKySchema = z.object({
  endpoint: z.url().max(2000),
  p256dh: z.string().min(10).max(200),
  auth: z.string().min(10).max(200),
  ua: z.string().max(300).nullish(),
});

export async function luuDangKyDay(
  input: z.infer<typeof dangKySchema>,
): Promise<{ error: string | null }> {
  const parsed = dangKySchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "notAuthenticated" };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "notFound" };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: parsed.data.endpoint,
      tenant_id: tenant.id,
      user_id: user.id,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      ua: parsed.data.ua ?? null,
      // Đăng ký lại thì xoá sạch lịch sử gửi hỏng — máy vừa hoạt động trở lại.
      fail_count: 0,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { error: "saveFailed" };
  return { error: null };
}

export async function xoaDangKyDay(input: {
  endpoint: string;
}): Promise<{ error: string | null }> {
  const parsed = z.object({ endpoint: z.url().max(2000) }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "notAuthenticated" };

  /**
   * ⚠️ Đi qua hàm `push_go_dang_ky` (#317) chứ KHÔNG xoá thẳng.
   *
   * Chính sách RLS cho mỗi người chỉ đụng dòng CỦA MÌNH. Nhưng quầy lễ tân là
   * MÁY DÙNG CHUNG và một máy chỉ có MỘT địa chỉ đăng ký: nếu dòng còn mang
   * tên chị A (chị A bật rồi đăng xuất) thì chị B bấm "Tắt" sẽ xoá được 0
   * dòng, và màn hình báo "Đã tắt" trong khi dòng nằm nguyên.
   *
   * Cổng `soat-ghi-im-lang` bắt được đúng lỗ này. Hàm mới gỡ theo ĐỊA CHỈ
   * trong phạm vi tiệm — người bấm nút đang cầm chính cái máy đó.
   */
  const { data, error } = await supabase.rpc("push_go_dang_ky", {
    p_endpoint: parsed.data.endpoint,
  });
  if (error) return { error: "saveFailed" };
  // 0 dòng ở đây nghĩa là "vốn không có đăng ký nào" — bấm tắt hai lần không
  // phải lỗi. Khác hẳn 0 dòng vì bị RLS chặn, vốn là chuyện hàm trên đã bỏ.
  void (data as number | null);
  return { error: null };
}

/**
 * Máy chủ đã khai khoá bí mật chưa.
 *
 * ⚠️ Màn hình PHẢI hỏi câu này trước khi bày công tắc. Thiếu khoá thì đăng ký
 *   vẫn "thành công" ở phía trình duyệt nhưng KHÔNG BAO GIỜ có thông báo nào
 *   tới — một công tắc bật lên rồi không làm gì, và người dùng sẽ nghĩ là máy
 *   họ hỏng chứ không nghĩ là phần mềm chưa cấu hình.
 */
export async function mayChuSanSangDay(): Promise<{ sanSang: boolean }> {
  return { sanSang: coKhoaBiMat() };
}

/**
 * GỬI THỬ một thông báo tới CHÍNH các thiết bị của người đang đăng nhập.
 *
 * ⚠️ Đây không phải nút cho vui. Đường đẩy thông báo có bốn khâu — trình duyệt
 *   đăng ký, máy chủ ký, dịch vụ của Google/Apple nhận, máy hiện ra — và ba
 *   khâu sau KHÔNG kiểm được từ máy người lập trình: hồ sơ trình duyệt tự động
 *   không đăng ký được với dịch vụ đẩy (đã thử 21/08, cả chạy ẩn lẫn chạy
 *   hiện, đều "permission denied"). Nút này là cách DUY NHẤT để biết cả đường
 *   có thông suốt hay không, và nó chạy trên đúng cái máy người dùng đang cầm.
 *
 * ⚠️ Chỉ gửi tới thiết bị CỦA CHÍNH MÌNH — RLS của `push_subscriptions` đã
 *   chốt việc đó. Không có đường nào để gửi thử tới máy người khác.
 */
export async function guiThuDay(): Promise<{
  error: string | null;
  daGui: number;
  soThietBi: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "notAuthenticated", daGui: 0, soThietBi: 0 };
  if (!coKhoaBiMat()) return { error: "serverNotReady", daGui: 0, soThietBi: 0 };

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (error) return { error: "loadFailed", daGui: 0, soThietBi: 0 };

  const ds = (data ?? []) as { endpoint: string; p256dh: string; auth: string }[];
  if (ds.length === 0) return { error: "noDevice", daGui: 0, soThietBi: 0 };

  const { guiMotDay } = await import("@/lib/push/gui");
  let daGui = 0;
  const chet: string[] = [];
  for (const d of ds) {
    const kq = await guiMotDay(d, {
      title: "iFan",
      body: "Thông báo thử — nếu bạn thấy dòng này thì đã bật thành công.",
      link: "/app/settings/notifications",
      nhom: "thu-thong-bao",
    });
    if (kq === "ok") daGui++;
    else if (kq === "bo") chet.push(d.endpoint);
  }

  // Thiết bị đã gỡ ứng dụng thì dọn luôn — giữ lại chỉ để gửi hỏng mỗi phút.
  if (chet.length > 0) {
    for (const e of chet) await supabase.rpc("push_go_dang_ky", { p_endpoint: e });
  }

  return { error: daGui === 0 ? "allFailed" : null, daGui, soThietBi: ds.length };
}

/**
 * BẬT / TẮT nhận thông báo qua EMAIL.
 *
 * Lưu vào `notification_prefs.pref.email.enabled` — cùng khối JSON mà bot
 * Telegram đang dùng. KHÔNG dựng bảng thứ hai: hai bảng tuỳ chọn thông báo là
 * hai chỗ để về sau lệch nhau, và không ai biết chỗ nào đang có hiệu lực.
 *
 * ⚠️ MẶC ĐỊNH TẮT. Ngược với thông báo đẩy — đẩy thì người dùng phải tự bật ở
 *   trình duyệt trước nên bật sẵn là hợp lý; email không có bước xin phép nào,
 *   bật sẵn nghĩa là tự tiện gửi thư cho người ta.
 */
export async function datEmailThongBao(input: {
  bat: boolean;
}): Promise<{ error: string | null }> {
  const parsed = z.object({ bat: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "notAuthenticated" };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "notFound" };

  // Đọc rồi GỘP, không ghi đè cả khối: khối này còn giữ tuỳ chọn của bot
  // Telegram (`enabled`, `kinds`, `digest_hour`) — ghi đè là xoá mất chúng.
  const { data: cu } = await supabase
    .from("notification_prefs")
    .select("pref")
    .eq("user_id", user.id)
    .maybeSingle();

  const pref = {
    ...((cu?.pref as Record<string, unknown>) ?? {}),
    email: { enabled: parsed.data.bat },
  };

  const { error } = await supabase
    .from("notification_prefs")
    .upsert(
      { tenant_id: tenant.id, user_id: user.id, pref, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,user_id" },
    );
  if (error) return { error: "saveFailed" };
  return { error: null };
}

/** Đang bật email hay chưa, và máy chủ đã cấu hình được đường gửi chưa. */
export async function docEmailThongBao(): Promise<{
  bat: boolean;
  mayChuSanSang: boolean;
  email: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { bat: false, mayChuSanSang: false, email: null };

  const { data } = await supabase
    .from("notification_prefs")
    .select("pref")
    .eq("user_id", user.id)
    .maybeSingle();

  const pref = (data?.pref ?? {}) as { email?: { enabled?: boolean } };
  return {
    bat: pref.email?.enabled === true,
    mayChuSanSang: Boolean(process.env.RESEND_API_KEY),
    email: user.email ?? null,
  };
}
