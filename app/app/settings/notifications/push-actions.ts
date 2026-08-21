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

  // ⚠️ `.select()` BẮT BUỘC ở lệnh xoá: không có nó thì Supabase báo thành công
  //   kể cả khi RLS chặn sạch, và giao diện sẽ tắt công tắc trong khi dòng vẫn
  //   nằm nguyên — người dùng tưởng đã tắt mà vẫn nhận thông báo.
  const { error, data } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint)
    .select("endpoint");
  if (error) return { error: "saveFailed" };
  // Không có dòng nào để xoá thì coi như đã tắt — bấm hai lần không phải lỗi.
  void data;
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
