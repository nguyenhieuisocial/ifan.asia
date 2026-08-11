import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Trang đích của mã QR: `/q/<code>` → đếm lượt quét rồi đưa khách tới nơi chủ
 * tiệm khai báo (Zalo OA / link chat / trang web).
 *
 * ĐÂY LÀ ĐIỂM CHẠM INTERNET — khách quét mã KHÔNG đăng nhập:
 *  - dùng client anon "trần" (không đọc/ghi cookie của khách), mọi việc do RPC
 *    `qr_resolve` (security definer) làm;
 *  - RPC trả về ĐÚNG một URL đích hoặc "không tìm thấy" — không tên tiệm,
 *    không tenant_id, không số liệu;
 *  - chặn spam ngay trong RPC (20 lượt / phút / mã / thiết bị), khóa chặn là
 *    BĂM của IP nên không có IP nào được lưu lại.
 */

/** Trang trả lời tối giản cho khách — không nhắc tên tiệm nào. */
function plainPage(title: string, body: string, status: number, headers?: HeadersInit) {
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title></head>
<body style="margin:0;display:grid;place-items:center;min-height:100svh;font:16px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;background:#fafafa;color:#171717">
<main style="max-width:22rem;padding:2rem;text-align:center">
<h1 style="margin:0 0 .5rem;font-size:1.125rem">${title}</h1>
<p style="margin:0;color:#666">${body}</p>
</main></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  // Chốt chặn theo IP TRƯỚC khi tra mã. Bộ đếm trong `qr_resolve` chỉ tính khi
  // mã CÓ THẬT (khóa chặn = băm của qr_code_id + IP), nên mã sai thì trước đây
  // không có chốt nào: một con bot dò mã không giới hạn số lần, mỗi lần là một
  // lượt tra DB. Ngưỡng để rộng (300/phút/IP, bằng webhook Zalo) vì nhà mạng VN
  // cho rất nhiều thuê bao dùng chung một IP — chặn nhầm khách thật đắt hơn
  // nhiều so với để lọt vài trăm lượt dò. Chốt hẹp theo TỪNG MÃ (20 lượt/phút/
  // mã/thiết bị) vẫn nằm trong RPC qr_resolve. Fail-closed.
  const { allowed } = await rateLimit(`qr:ip:${clientIpFrom(request.headers)}`, 300, 60);
  if (!allowed) {
    return plainPage(
      "Bạn quét hơi nhanh",
      "Chờ khoảng một phút rồi quét lại giúp nhé.",
      429,
      { "retry-after": "60" },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("qr_resolve", {
    p_code: code,
    p_client_key: clientIpFrom(request.headers),
  });

  if (error) {
    return plainPage("Không mở được liên kết", "Bạn thử quét lại giúp nhé.", 500);
  }

  const result = data as { ok: boolean; reason?: string; target_url?: string };

  if (!result?.ok) {
    if (result?.reason === "rate_limited") {
      return plainPage(
        "Bạn quét hơi nhanh",
        "Chờ khoảng một phút rồi quét lại giúp nhé.",
        429,
        { "retry-after": "60" },
      );
    }
    return plainPage("Mã này không còn dùng nữa", "Bạn liên hệ trực tiếp cửa hàng giúp nhé.", 404);
  }

  // Chỉ đi tiếp với http/https (định dạng URL được kiểm ở tầng web khi tạo mã;
  // đây là chốt chặn cuối, không để mã lỗi biến thành lỗ chuyển hướng).
  let target: URL;
  try {
    target = new URL(result.target_url ?? "");
    if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("scheme");
  } catch {
    return plainPage("Mã này không còn dùng nữa", "Bạn liên hệ trực tiếp cửa hàng giúp nhé.", 404);
  }

  // Mang mã theo sang kênh đích ("channel live code") để bên nhận biết khách
  // đến từ mã nào. Đích là trang web có gắn hộp chat iFan thì widget đọc
  // ?ifan_qr này và gửi kèm tin đầu tiên → hồ sơ khách nhận đúng nguồn của mã
  // (migration #57 — B06); đích Zalo sẽ dùng được tham số khi kênh OA mở.
  // Không ghi đè nếu chủ tiệm đã tự đặt tham số này.
  if (!target.searchParams.has("ifan_qr")) target.searchParams.set("ifan_qr", code);

  return NextResponse.redirect(target.toString(), 302);
}
