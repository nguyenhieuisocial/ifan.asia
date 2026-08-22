/**
 * CỔNG + CÔNG CỤ: khoá LOẠI TỆP và CỠ TỆP của kho `tenant-files`.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG PHẢI MỘT MIGRATION SQL
 * ═══════════════════════════════════════════════════════════════════
 * Đã thử: `update storage.buckets ...` bị từ chối với `42501 must be owner of
 * table buckets`. Bảng đó thuộc về vai nội bộ của Supabase, không thuộc về
 * người dùng cơ sở dữ liệu của dự án. Đường ĐÚNG là API quản trị kho tệp bằng
 * khoá dịch vụ. Ghi lại đây để lần sau không ai mất một lượt đi thử lại SQL.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI KHOÁ Ở KHO, KHÔNG PHẢI Ở MÀN HÌNH
 * ═══════════════════════════════════════════════════════════════════
 * Hai đường gửi tệp của Chat (`o-chon-tep.tsx`, `nut-ghi-am.tsx`) chạy THẲNG
 * từ trình duyệt lên kho, KHÔNG đi qua máy chủ iFan. Mọi phép kiểm viết trong
 * hai file đó chỉ là gợi ý — mở công cụ lập trình của trình duyệt là bỏ qua
 * được. Thuộc tính `accept="image/*,application/pdf"` cũng vậy: nó lọc hộp
 * thoại chọn tệp, KHÔNG chặn lượt gửi.
 *
 * Đo 21/08: kho để `file_size_limit = null` và `allowed_mime_types = null` —
 * tức KHÔNG GIỚI HẠN GÌ. Gửi được một tệp `.html` hay `.svg` có mã kịch bản
 * rồi mở bằng đường dẫn ký hạn: trình duyệt chạy mã đó dưới tên miền của kho.
 *
 * ⚠️ KHÔNG nhận `image/svg+xml`. SVG là XML và CHẠY ĐƯỢC mã kịch bản: trông
 *   như ảnh, gửi như ảnh, mở ra hành xử như một trang web. Tiệm không có nhu
 *   cầu gửi SVG cho nhau — bỏ nó ra là bỏ một cửa mà không mất gì.
 *
 * Chạy:
 *   node scripts/soat-kho-tep.mjs        → KIỂM (đỏ nếu kho chưa khoá)
 *   node scripts/soat-kho-tep.mjs --ap   → ÁP cấu hình khoá lên kho
 */
import { readFileSync, existsSync } from "node:fs";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync(".env.local")) {
  // ⚠️ `\r?\n`, KHÔNG phải `\n`: tách theo `\n` thì dòng kiểu Windows còn sót `\r` ở
  //   đuôi, mà trong regex JavaScript `\r` LÀ ký tự xuống dòng — `.` không khớp nó và
  //   `$` (không cờ `m`) chỉ khớp cuối chuỗi, nên `(.*)$` TRƯỢT sạch mọi dòng CRLF.
  //   Đo 22/08 trên `.env.local` của máy này (37 dòng CRLF + 6 dòng LF): đọc được đúng
  //   1/22 biến rồi dừng ở "thiếu khoá" ⇒ script này CHƯA TỪNG CHẠY ĐƯỢC trên Windows.
  for (const d of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const URL_NEN = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KHOA = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_NEN || !KHOA) {
  console.error("❌ Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const KHO = "tenant-files";
/** Trần 8 MB — PHẢI khớp `MAX_CO_TEP` bên mã nguồn. */
const TRAN_BYTE = 8 * 1024 * 1024;
const LOAI_CHO_PHEP = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  // Lời nhắn thoại: mỗi trình duyệt ghi ra một kiểu khác nhau.
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
];
/** Loại TUYỆT ĐỐI không được có mặt, dù ai thêm sau này. */
const CAM = ["image/svg+xml", "text/html", "application/xhtml+xml", "text/xml", "*/*"];

const dau = { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" };

async function doc() {
  const r = await fetch(`${URL_NEN}/storage/v1/bucket/${KHO}`, { headers: dau });
  if (!r.ok) throw new Error(`đọc kho hỏng: ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

if (process.argv.includes("--ap")) {
  const r = await fetch(`${URL_NEN}/storage/v1/bucket/${KHO}`, {
    method: "PUT",
    headers: dau,
    body: JSON.stringify({
      public: false,
      file_size_limit: TRAN_BYTE,
      allowed_mime_types: LOAI_CHO_PHEP,
    }),
  });
  if (!r.ok) {
    console.error(`❌ Áp hỏng: ${r.status} ${(await r.text()).slice(0, 200)}`);
    process.exit(1);
  }
  console.log("✓ Đã khoá loại tệp và cỡ tệp cho kho", KHO);
}

const kho = await doc();
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  if (!ok) truot++;
};

kiem("kho KHÔNG công khai", kho.public === false, `public=${kho.public}`);
kiem("có trần cỡ tệp", typeof kho.file_size_limit === "number" && kho.file_size_limit > 0,
  `${kho.file_size_limit}`);
kiem("trần cỡ tệp khớp mã nguồn (8 MB)", kho.file_size_limit === TRAN_BYTE, `${kho.file_size_limit}`);
const ds = kho.allowed_mime_types ?? null;
kiem("có danh sách loại tệp cho phép", Array.isArray(ds) && ds.length > 0,
  ds ? `${ds.length} loại` : "chưa đặt — kho nhận MỌI loại tệp");
if (Array.isArray(ds)) {
  const lot = CAM.filter((x) => ds.includes(x));
  kiem("không có loại CHẠY ĐƯỢC mã kịch bản", lot.length === 0, lot.join(", ") || "sạch");
  const thieu = LOAI_CHO_PHEP.filter((x) => !ds.includes(x));
  kiem("đủ loại tiệm thật cần gửi", thieu.length === 0, thieu.join(", ") || "đủ");
}

console.log("");
if (truot) {
  console.error(`❌ ${truot} chỗ chưa đạt. Chạy: node scripts/soat-kho-tep.mjs --ap`);
  console.error("   ⚠️ Đây KHÔNG phải phép kiểm hình thức: hai đường gửi tệp của Chat đi thẳng");
  console.error("   từ trình duyệt lên kho, nên đây là lớp chặn DUY NHẤT của chúng.");
  process.exit(1);
}
console.log("✅ Kho tệp đã khoá đúng loại và đúng cỡ.");
