import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createSSRClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/config";

/**
 * NHẬN LƯỢT MỞ MÀN — để biết tiệm nào dùng gì.
 *
 * ⚠️ TÊN TIỆM VÀ NGƯỜI DÙNG LẤY TỪ PHIÊN ĐĂNG NHẬP, KHÔNG NHẬN TỪ TRÌNH DUYỆT.
 *   Nhận từ trình duyệt nghĩa là ai cũng ghi số liệu giả cho tiệm khác — và số
 *   liệu bịa được thì mọi quyết định dựa trên nó đều vô nghĩa. Trình duyệt chỉ
 *   được nói MỘT thứ: đang mở màn nào.
 *
 * ⚠️ LUÔN trả 204, kể cả khi bỏ qua. Đây là đường đếm, không phải đường làm
 *   việc: trả lỗi cho nó là mời trình duyệt thử lại và làm ồn nhật ký vì một
 *   việc không ai cần biết kết quả.
 *
 * ⚠️ Chưa đăng nhập thì BỎ QUA, không đếm. Số liệu này để trả lời "tiệm dùng
 *   gì", nên trộn lượt của khách lạ ghé trang giới thiệu vào là làm hỏng chính
 *   con số mình đang đo.
 */

export const dynamic = "force-dynamic";

/** Khoá màn hợp lệ — danh sách ĐÓNG. */
const MAN_HOP_LE = new Set([
  "today", "overview", "calendar", "contacts", "companies", "items", "orders",
  "contracts", "vouchers", "cashbook", "ketsat", "stock", "inbox", "csat",
  "events", "tasks", "approvals", "chat", "reports", "settings", "team",
  "recruitment", "hr", "payroll", "commissions", "projects", "search", "khac",
]);

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 300) return new NextResponse(null, { status: 204 });
    const { man, muiGio } = JSON.parse(raw) as { man?: unknown; muiGio?: unknown };
    // Danh sách ĐÓNG chứ không lọc ký tự: mở thì bảng đầy khoá rác do người ta
    // gửi bừa, và lúc đó không đọc ra được gì.
    if (typeof man !== "string" || !MAN_HOP_LE.has(man)) {
      return new NextResponse(null, { status: 204 });
    }

    const supabase = await createSSRClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new NextResponse(null, { status: 204 });

    // Tiệm đang làm việc — đọc bằng khoá CỦA NGƯỜI DÙNG, để RLS tự chốt.
    const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
    if (!tenant?.id) return new NextResponse(null, { status: 204 });

    const khoa = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!khoa) return new NextResponse(null, { status: 204 });
    const db = createClient(SUPABASE_URL, khoa, { auth: { persistSession: false } });
    await db.rpc("ghi_luot_dung", {
      p_tenant_id: tenant.id,
      p_user_id: user.id,
      p_man: man,
      p_mui_gio: typeof muiGio === "string" ? muiGio.slice(0, 40) : "",
    });
  } catch {
    // Đường đếm không được làm hỏng gì của người dùng — nuốt mọi lỗi.
  }
  return new NextResponse(null, { status: 204 });
}
