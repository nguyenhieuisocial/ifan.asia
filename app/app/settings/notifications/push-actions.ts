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
