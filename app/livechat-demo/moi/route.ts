import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /livechat-demo/moi — phát một lượt thử hộp chat, rồi đưa thẳng sang trang
 * thử với KHÓA THỬ vừa phát.
 *
 * ĐÂY LÀ CHỨNG CỨ QUYỀN SỞ HỮU của trang thử (migration #209). Trước đây trang
 * thử chạy bằng chính KHÓA NHÚNG — khóa công khai nằm nguyên văn trong mã HTML
 * website của tiệm — nên ai xem nguồn trang cũng chép được rồi mở
 * `/livechat-demo?key=<khóa>` và chat thẳng vào hộp thư tiệm TỪ BẤT KỲ MẠNG NÀO.
 * Hàng rào tên miền không chặn được gì vì trang thử chạy trên chính tên miền
 * iFan, và tầng API đổi origin đó thành sentinel 'ifan:demo' được RPC nhận.
 *
 * Nay cửa đó chỉ mở cho khóa thử 30 phút, mà khóa thử chỉ phát ở ĐÂY — sau khi
 * đọc phiên đăng nhập thật. Vai owner/admin do chính RPC kiểm (không tin tầng
 * web), đúng mức quyền của `livechat_setup`.
 *
 * VÌ SAO LÀ MỘT ROUTE GET CHỨ KHÔNG PHẢI server action:
 *  - Mở tab mới sau một lời gọi bất đồng bộ hay bị trình duyệt chặn như popup;
 *    một thẻ <a target="_blank"> trỏ tới route này thì không.
 *  - Route phải được gọi bằng thẻ <a> THƯỜNG, KHÔNG dùng <Link>: Next tự nạp
 *    trước (prefetch) các <Link>, tức chỉ rê chuột qua nút là đã phát khóa.
 *  - Ghi mà dùng GET là cố ý và vô hại ở đây: mỗi lượt chỉ GHI ĐÈ khóa thử của
 *    CHÍNH tiệm người đang đăng nhập, không có tác dụng phụ nào khác.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("livechat_demo_start");

  if (error) {
    // Chưa đăng nhập / không đủ vai / chưa có kênh Live Chat nào đang bật —
    // đưa về đúng màn Cài đặt để chủ tiệm làm nốt bước còn thiếu, thay vì ném
    // một trang lỗi trần không nói được gì.
    redirect("/app/settings/channels/livechat");
  }

  const demoKey = (data as { demo_key?: string } | null)?.demo_key;
  if (!demoKey) redirect("/app/settings/channels/livechat");

  redirect(`/livechat-demo?key=${demoKey}`);
}
