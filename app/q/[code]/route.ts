import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL } from "@/lib/config";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Trang đích của mã QR: `/q/<code>` → đếm lượt quét rồi đưa khách tới nơi chủ
 * tiệm khai báo (Zalo OA / link chat / trang web).
 *
 * ĐÂY LÀ ĐIỂM CHẠM INTERNET — khách quét mã KHÔNG đăng nhập:
 *  - dùng client anon "trần" (không đọc/ghi cookie của khách), mọi việc do RPC
 *    `qr_resolve` (security definer) làm;
 *  - RPC trả về ĐÚNG một URL đích + một bit `trust` — không tên tiệm,
 *    không tenant_id, không số liệu;
 *  - chặn spam ngay trong RPC (20 lượt / phút / mã / thiết bị), khóa chặn là
 *    BĂM của IP nên không có IP nào được lưu lại.
 *
 * ═══════════════════════════════════════════════════════════════════
 * TRANG CẢNH BÁO CHUYỂN HƯỚNG (thẻ `trang-canh-bao-chuyen-huong`, việc #204)
 * ═══════════════════════════════════════════════════════════════════
 * Bài toán: chủ tiệm tự dán địa chỉ đích vào mã QR, và ai cũng dựng được một
 * mã. Nghĩa là `ifan.asia/q/<mã>` từng là MỘT CÁNH CỬA MỞ — người lạ trỏ mã
 * sang web lừa đảo, khách quét xong bị đẩy thẳng, và **tên miền iFan đứng ra
 * bảo lãnh cho cú nhảy ấy**. Khách thấy link iFan trong tin nhắn thì tin, vì
 * họ tin iFan.
 *
 * Ba ngã rẽ — và ngã hay gặp nhất là ngã KHÔNG hiện trang cảnh báo:
 *   1. Đích thuộc tiệm đã khai, hoặc chính iFan  → ĐI THẲNG như cũ.
 *      Đây là đường đi đúng của gần như mọi lượt quét. Bắt khách bấm thêm một
 *      nút ở đây là làm phiền hàng nghìn người thật để chặn một kẻ giả — mà kẻ
 *      giả thì vẫn bấm được nút đó.
 *   2. Địa chỉ lạ                                 → cảnh báo VÀNG, nút chính là
 *      "Quay lại". Không cấm: chủ tiệm có quyền trỏ mã đi đâu tuỳ ý. Đây là
 *      trang BÁO, không phải trang CHẶN.
 *   3. Địa chỉ GIẢ LÀM iFan                       → cảnh báo ĐỎ, đặt hai địa
 *      chỉ cạnh nhau, lối đi tiếp tụt xuống thành một dòng chữ gạch chân chứ
 *      không còn là nút.
 *
 * BỐN THỨ TRANG NÀY CỐ Ý KHÔNG LÀM:
 *   · Không nhắc tên tiệm — in tên tiệm lên đây là biến trang cảnh báo thành
 *     máy tra cứu tiệm, phá đúng chốt chống dò của `/q/`.
 *   · Không đếm ngược rồi tự nhảy — đếm ngược vẫn là đẩy thẳng, chỉ chậm hơn;
 *     người không kịp đọc vẫn bị đẩy đi.
 *   · Không cấm chủ tiệm trỏ ra ngoài.
 *   · Không cho máy tìm kiếm lưu lại (noindex).
 *
 * KHÔNG dùng JavaScript: trang này chạy sau lớp CSP có nonce (việc #204), mà
 * mã nội tuyến không nonce thì bị chặn. Mọi thứ ở đây là HTML + CSS thuần, nên
 * nó chạy được kể cả khi CSP siết chặt hơn nữa.
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

/** Chặn mọi ký tự có thể thoát ra khỏi HTML. Địa chỉ đích do NGƯỜI NGOÀI đặt. */
function thoat(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Host của chính iFan. Dùng để nhận ra hai thứ: đích trỏ về chính iFan (đi
 * thẳng), và đích GIẢ LÀM iFan (cảnh báo đỏ).
 */
function hostCuaMinh(): string {
  try {
    return new URL(SITE_URL).host.toLowerCase();
  } catch {
    return "";
  }
}

/** Đích trỏ về chính iFan (kể cả tên miền con) — ví dụ trang mặt tiền `/t/<slug>`. */
function laNhaMinh(host: string, cuaMinh: string): boolean {
  if (!cuaMinh) return false;
  return host === cuaMinh || host.endsWith("." + cuaMinh);
}

/**
 * Đích ĐỘI LỐT iFan.
 *
 * Luật: bỏ hết dấu chấm/gạch nối rồi hỏi có chứa "ifan" không. Bắt được
 * `ifan-asia.com`, `ifanasia.net`, `my-ifan.vn`, `ifan.asia.evil.com`.
 * Cộng thêm: tên miền mã hoá punycode (`xn--`) luôn bị coi là đáng ngờ — đó là
 * đường kinh điển để dựng tên miền nhìn y hệt bằng chữ cái nước khác.
 *
 * ⚠️ GIỚI HẠN ĐÃ BIẾT, ghi ra để không ai tưởng luật này kín: nó KHÔNG bắt
 * được chữ nhìn giống mà viết khác trong bảng chữ Latin — `1fan.asia`,
 * `lfan.asia`, `ifan.asìa`. Bắt cho kín cần một danh sách chữ-nhìn-giống, và
 * danh sách đó dễ báo oan tên miền thật. Ở đây chọn luật hẹp mà chắc: thà bỏ
 * lọt vài kiểu hiếm (chúng vẫn rơi vào cảnh báo VÀNG, không phải đi thẳng) còn
 * hơn dán nhãn "giả mạo" lên website thật của một tiệm.
 */
function doiLotIFan(host: string, cuaMinh: string): boolean {
  if (laNhaMinh(host, cuaMinh)) return false;
  if (host.startsWith("xn--") || host.includes(".xn--")) return true;
  return host.replace(/[.\-_]/g, "").includes("ifan");
}

/** Khung chung của hai trang cảnh báo. Tự chứa, không JS, sáng/tối, chạm 44px. */
function khungCanhBao(opts: {
  mau: "vang" | "do";
  tieuDe: string;
  moTa: string;
  than: string;
  nutChinh: { chu: string; href: string };
  loiDiTiep: { chu: string; href: string; kieuNut: boolean };
  chanTrang: string;
}): NextResponse {
  const { mau, tieuDe, moTa, than, nutChinh, loiDiTiep, chanTrang } = opts;
  const nhan = mau === "do" ? "#dc2626" : "#d97706";
  const nhanToi = mau === "do" ? "#f87171" : "#fbbf24";
  const nenNhan = mau === "do" ? "#fef2f2" : "#fffbeb";
  const nenNhanToi = mau === "do" ? "#450a0a" : "#451a03";
  const bieuTuong = mau === "do" ? "⛔" : "⚠️";

  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>${thoat(tieuDe)}</title>
<style>
:root{--nen:#fafafa;--the:#fff;--chu:#171717;--mo:#57534e;--vien:#e7e5e4;--nhan:${nhan};--nenNhan:${nenNhan}}
@media (prefers-color-scheme:dark){:root{--nen:#0c0a09;--the:#1c1917;--chu:#fafaf9;--mo:#a8a29e;--vien:#292524;--nhan:${nhanToi};--nenNhan:${nenNhanToi}}}
*{box-sizing:border-box}
body{margin:0;min-height:100svh;display:grid;place-items:center;padding:16px;
 font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--nen);color:var(--chu)}
.the{width:100%;max-width:26rem;background:var(--the);border:1px solid var(--vien);border-radius:16px;padding:24px}
.hieu{font-size:13px;color:var(--mo);text-align:center;margin:0 0 16px}
.hieu b{color:var(--chu)}
.bt{font-size:32px;line-height:1;text-align:center;margin:0 0 12px}
h1{margin:0 0 8px;font-size:19px;line-height:1.35;text-align:center}
.mo{margin:0 0 20px;font-size:14px;color:var(--mo);text-align:center}
.o{background:var(--nenNhan);border:1px solid var(--nhan);border-radius:12px;padding:14px;margin:0 0 8px}
.nhan{font-size:12px;color:var(--mo);margin:0 0 4px}
.to{font-size:19px;font-weight:700;word-break:break-all;line-height:1.35;margin:0}
.day{font-size:12px;color:var(--mo);word-break:break-all;margin:12px 0 20px;line-height:1.5}
a.nut{display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 16px;
 border-radius:12px;text-decoration:none;font-weight:600;font-size:15px}
a.chinh{background:var(--chu);color:var(--nen);margin:0 0 10px}
a.phu{border:1px solid var(--vien);color:var(--chu)}
a.chu{display:block;text-align:center;min-height:44px;line-height:44px;font-size:13px;
 color:var(--mo);text-decoration:underline}
.chan{margin:18px 0 0;font-size:12.5px;color:var(--mo);line-height:1.55;text-align:center}
.chan b{color:var(--chu)}
</style></head>
<body><main class="the">
<p class="hieu"><b>iFan</b>.asia</p>
<div class="bt">${bieuTuong}</div>
<h1>${thoat(tieuDe)}</h1>
<p class="mo">${moTa}</p>
${than}
<a class="nut chinh" href="${thoat(nutChinh.href)}">${thoat(nutChinh.chu)}</a>
${
  loiDiTiep.kieuNut
    ? `<a class="nut phu" rel="noreferrer noopener nofollow" href="${thoat(loiDiTiep.href)}">${thoat(loiDiTiep.chu)}</a>`
    : `<a class="chu" rel="noreferrer noopener nofollow" href="${thoat(loiDiTiep.href)}">${thoat(loiDiTiep.chu)}</a>`
}
<p class="chan">${chanTrang}</p>
</main></body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow" },
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

  const result = data as {
    ok: boolean;
    reason?: string;
    target_url?: string;
    trust?: "tenant" | "unknown";
  };

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

  const dich = target.toString();
  const host = target.host.toLowerCase();
  const cuaMinh = hostCuaMinh();

  // ── Ngã 1: nhà mình hoặc nơi tiệm đã khai → đi thẳng, không làm phiền ──
  if (laNhaMinh(host, cuaMinh) || result.trust === "tenant") {
    return NextResponse.redirect(dich, 302);
  }

  // ── Ngã 3: đội lốt iFan → cảnh báo ĐỎ, không còn nút "Tiếp tục" ──
  if (doiLotIFan(host, cuaMinh)) {
    return khungCanhBao({
      mau: "do",
      tieuDe: "Trang này giả làm iFan",
      moTa: "Địa chỉ sắp mở <b>nhìn gần giống iFan nhưng không phải của iFan</b>. Xem kỹ chỗ khác nhau:",
      than: `<div class="o"><p class="nhan">iFan thật là</p><p class="to">${thoat(cuaMinh || "ifan.asia")}</p></div>
<div class="o"><p class="nhan">Bạn sắp mở</p><p class="to">${thoat(host)}</p></div>
<p class="day">Địa chỉ đầy đủ<br>${thoat(dich)}</p>`,
      nutChinh: { chu: "Quay lại nơi an toàn", href: SITE_URL || "/" },
      loiDiTiep: { chu: "Tôi hiểu rủi ro, vẫn mở trang này", href: dich, kieuNut: false },
      chanTrang:
        "Trang giả thường xin mật khẩu hoặc tiền cọc. <b>iFan không bao giờ hỏi mật khẩu của bạn qua mã QR.</b>",
    });
  }

  // ── Ngã 2: địa chỉ lạ → cảnh báo VÀNG, "Quay lại" là nút chính ──
  return khungCanhBao({
    mau: "vang",
    tieuDe: "Bạn sắp rời khỏi iFan",
    moTa: "Trang sắp mở <b>không phải của iFan</b>. Đọc kỹ địa chỉ dưới đây trước khi đi tiếp.",
    than: `<div class="o"><p class="nhan">Bạn sắp mở</p><p class="to">${thoat(host)}</p></div>
<p class="day">${thoat(dich)}</p>`,
    nutChinh: { chu: "Quay lại", href: SITE_URL || "/" },
    loiDiTiep: { chu: "Vẫn tiếp tục", href: dich, kieuNut: true },
    chanTrang:
      "iFan không kiểm tra được nội dung trang này. <b>Đừng nhập mật khẩu, mã OTP hay số thẻ ngân hàng</b> ở trang lạ.",
  });
}
