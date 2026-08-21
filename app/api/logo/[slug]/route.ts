import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/config";

/**
 * PHỤC VỤ LOGO TIỆM cho các trang khách của tiệm nhìn thấy (#334).
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO ĐI VÒNG QUA ĐÂY THAY VÌ MỘT KHO CÔNG KHAI
 * ═══════════════════════════════════════════════════════════════════
 * Cách hiển nhiên là mở kho `tenant-files` thành công khai rồi trỏ thẳng vào
 * ảnh. TUYỆT ĐỐI KHÔNG. Kho đó đang chứa CHUNG:
 *   · ảnh chụp mặt nhân viên lúc chấm công,
 *   · tệp đính kèm trong chat nội bộ của mọi tiệm.
 * Mở công khai để lấy được cái logo là mở luôn hai thứ trên cho cả internet.
 *
 * ⇒ Đường này chỉ phục vụ ĐÚNG một tệp: tệp được ghi là logo của đúng tiệm ấy.
 *   Người gọi không đưa đường dẫn — họ đưa tên tiệm, máy chủ tự tra.
 *
 * ⚠️ Không nhận đường dẫn từ người gọi, dù dưới dạng nào. Nhận là biến đường
 *   này thành cửa đọc mọi tệp trong kho.
 */

export const dynamic = "force-dynamic";

/** Slug tiệm: chữ thường, số, gạch nối — khớp luật đặt slug lúc lập tiệm. */
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return new NextResponse(null, { status: 404 });

  const khoa = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!khoa) return new NextResponse(null, { status: 404 });

  // Đọc đường dẫn logo bằng khoá dịch vụ. Hàm công khai `thuong_hieu_cong_khai`
  // CỐ Ý không trả đường dẫn (nó lộ mã tiệm), nên ở đây đọc thẳng cột.
  const db = createClient(SUPABASE_URL, khoa, { auth: { persistSession: false } });
  const { data: tiem } = await db
    .from("tenants")
    .select("id, logo_url")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  const duong = (tiem?.logo_url ?? "").trim();
  if (!duong) return new NextResponse(null, { status: 404 });

  // ⚠️ Chốt lần hai: đường dẫn PHẢI nằm trong thư mục thương hiệu của CHÍNH
  //   tiệm này. Nếu một ngày nào đó có đường ghi khác đặt được `logo_url` tuỳ ý,
  //   chốt này giữ cho nó không trỏ sang ảnh chấm công hay tệp chat.
  if (!duong.startsWith(`${tiem?.id}/thuong-hieu/`)) {
    return new NextResponse(null, { status: 404 });
  }

  const { data: ky } = await db.storage.from("tenant-files").createSignedUrl(duong, 3600);
  if (!ky?.signedUrl) return new NextResponse(null, { status: 404 });

  // Chuyển hướng thay vì tải về rồi phát lại: đỡ một lượt truyền qua máy chủ
  // iFan, và trình duyệt vẫn nhớ ảnh như thường.
  return NextResponse.redirect(ky.signedUrl, {
    status: 302,
    // Nhớ 5 phút ở trình duyệt. Ngắn hơn hạn ký (1 giờ) nên không bao giờ nhớ
    // một đường dẫn đã hết hạn; đủ dài để một khách xem vài trang không phải
    // tải lại logo mỗi lần.
    headers: { "cache-control": "public, max-age=300" },
  });
}
