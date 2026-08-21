import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

/**
 * ĐƯỜNG KIỂM SỐNG — để một dịch vụ canh ngoài biết web còn chạy hay đã sập.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CẦN MỘT ĐƯỜNG RIÊNG, KHÔNG CANH TRANG CHỦ
 * ═══════════════════════════════════════════════════════════════════
 * Canh trang chủ chỉ biết "máy chủ web còn trả trang". Nhưng kiểu sập hay gặp
 * nhất của iFan KHÔNG phải web sập — mà là CƠ SỞ DỮ LIỆU không tới được: lúc đó
 * trang chủ vẫn hiện đẹp (nó là trang giới thiệu, không đọc dữ liệu), trong khi
 * mọi tiệm đang đăng nhập đều không làm được gì. Một phép canh báo "vẫn ổn"
 * trong lúc khách hàng không dùng được là phép canh tệ hơn không có.
 *
 * ⚠️ KHÔNG đặt giới hạn tần suất ở đây. Dịch vụ canh gọi mỗi phút; chặn nó là
 *   tự làm hỏng đúng thứ mình vừa dựng. Bù lại: chỉ đọc MỘT dòng nhỏ, không
 *   nhận tham số nào, và không trả về gì ngoài "được / không được".
 *
 * ⚠️ KHÔNG trả phiên bản, tên bảng, lời lỗi của cơ sở dữ liệu. Đây là cửa
 *   công khai — mọi chi tiết trả ra là chi tiết cho người dò tìm. "not ok" là
 *   đủ cho một dịch vụ canh; muốn biết vì sao thì xem sổ ghi lỗi.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const batDau = Date.now();
  let khoDuLieu = false;
  try {
    // Dùng khoá CÔNG KHAI, không dùng khoá dịch vụ: đường này công khai nên
    // không được cầm khoá mạnh. Đọc một bảng cấu hình có RLS — trả 0 dòng cũng
    // KHÔNG sao, thứ ta cần biết là "có nối tới nơi và trả lời được không".
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    /**
     * ⚠️ PHẢI CÓ HẠN CHỜ RIÊNG. Đo 22/08: khi kho dữ liệu không tới được, phép
     *   đọc treo gần 16 GIÂY rồi mới chịu hỏng. Dịch vụ canh thường bỏ cuộc sau
     *   10 giây, nên nó ghi nhận "hết giờ" thay vì "kho dữ liệu hỏng" — hai
     *   nguyên nhân khác hẳn nhau, và cái sau mới là cái cần báo. Lượt kiểm sống
     *   treo lâu còn giữ chỗ một tiến trình máy chủ mỗi phút.
     */
    const HAN_MS = 5000;
    khoDuLieu = await Promise.race([
      db
        .from("tenants")
        .select("id", { head: true, count: "exact" })
        .limit(1)
        .then(({ error }) => !error),
      new Promise<boolean>((giai) => setTimeout(() => giai(false), HAN_MS)),
    ]);
  } catch {
    khoDuLieu = false;
  }

  const than = { ok: khoDuLieu, db: khoDuLieu, ms: Date.now() - batDau };
  return NextResponse.json(than, {
    // 503 khi hỏng: dịch vụ canh nào cũng hiểu mã này, không cần cấu hình thêm.
    status: khoDuLieu ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
