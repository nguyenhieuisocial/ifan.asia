/**
 * NGƯỜI CANH BẢN SAO LƯU — hỏi thẳng Supabase, hỏng thì nhắn Telegram.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY — ĐO ĐƯỢC 22/08
 * ═══════════════════════════════════════════════════════════════════
 * Hỏi Supabase về hai dự án trong CÙNG một tài khoản:
 *
 *     hieu.asia      (tổ chức "nguyenhieuisocial's Org", gói PRO)  → 8 bản sao lưu
 *     iFan.asia SG   (tổ chức "iFan.asia",              gói FREE) → 0 bản sao lưu
 *
 * Nghĩa là founder ĐANG TRẢ TIỀN gói Pro, và bản sao lưu tự động đang chạy
 * hằng ngày — nhưng cho DỰ ÁN PHỤ. Còn iFan, nơi giữ dữ liệu thật của các tiệm
 * đang dùng, thì KHÔNG CÓ BẢN NÀO. Xoá nhầm một bảng hoặc dự án gặp sự cố là
 * mất trắng.
 *
 * ⚠️ VIỆC NÀY KHÔNG SỬA ĐƯỢC BẰNG MÃ NGUỒN. Nó là một quyết định về tiền và về
 *   hạ tầng — chuyển dự án iFan sang tổ chức đang có gói Pro, hoặc nâng gói cho
 *   tổ chức iFan. Cả hai đều đổi hoá đơn, nên phải là founder quyết.
 *
 * ⇒ Việc của file này là KHÔNG ĐỂ AI QUÊN. Nó chạy mỗi ngày và nhắn thẳng vào
 *   Telegram chừng nào chưa có bản sao lưu nào. Nó im ngay ngày đầu tiên có.
 *
 * ⚠️ MỖI NGÀY MỘT LẦN, KHÔNG PHẢI MỖI 10 PHÚT. Một báo động đúng nhưng lặp quá
 *   dày cũng bị người ta tắt đi — và lúc đó nó không còn canh được gì.
 *
 * ⚠️ Thiếu `SUPABASE_ACCESS_TOKEN` thì ĐỎ, không im lặng cho qua. Không hỏi
 *   được nghĩa là KHÔNG BIẾT, mà không biết thì không được coi là ổn.
 *
 * Chạy: node scripts/canh-sao-luu.mjs
 */

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const TG = process.env.TELEGRAM_BOT_TOKEN;
const NHOM = process.env.TELEGRAM_GROUP_ID;

/** Dự án THẬT của iFan. Khai cứng: dò theo tên là có ngày nhận nhầm dự án khác. */
const DU_AN = process.env.SUPABASE_PROJECT_REF ?? "gcvadkowtqyobgfzhklq";

/** Bản sao lưu cũ hơn ngần này là coi như KHÔNG CÓ — sao lưu tuần trước không cứu được hôm nay. */
const HAN_GIO = 48;

/**
 * ⚠️ ĐO ĐƯỢC 22/08: kho GitHub CHỈ có 4 chìa khoá (`SUPABASE_URL`,
 *   `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`).
 *   KHÔNG có `TELEGRAM_BOT_TOKEN`, KHÔNG có `TELEGRAM_GROUP_ID`.
 *
 *   Nghĩa là NGƯỜI CANH WEB (`canh-song.yml`, chạy mỗi 10 phút) đã được viết để
 *   nhắn Telegram lúc web sập — nhưng CHƯA BAO GIỜ nhắn được cho ai. Lúc web
 *   sập thật, dấu hiệu duy nhất là một ô đỏ trong tab Actions mà không ai ngồi
 *   nhìn. Người canh không hét được thì gần như không phải người canh.
 *
 *   Đây là việc founder tự làm (một lệnh cho mỗi chìa) — chìa khoá không phải
 *   thứ nên đi qua tay ai khác.
 */
async function nhanTelegram(tin) {
  if (!TG || !NHOM) {
    console.error(
      "\n⚠️ KHÔNG NHẮN ĐƯỢC CHO AI — kho GitHub thiếu TELEGRAM_BOT_TOKEN / TELEGRAM_GROUP_ID.\n" +
        "   Người canh web (mỗi 10 phút) cũng dùng đúng hai chìa này, nên nó cũng đang câm.\n" +
        "   Thêm bằng: gh secret set TELEGRAM_BOT_TOKEN   (rồi dán giá trị)\n" +
        "              gh secret set TELEGRAM_GROUP_ID\n",
    );
    return;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: NHOM, text: tin, disable_web_page_preview: true }),
    });
    console.error(r.ok ? "Đã nhắn vào Telegram." : `Nhắn hỏng: ${r.status}`);
  } catch (e) {
    console.error("Nhắn hỏng:", String(e).slice(0, 120));
  }
}

if (!TOKEN) {
  const tin =
    "🔴 iFan — KHÔNG KIỂM ĐƯỢC BẢN SAO LƯU\n\n" +
    "Thiếu chìa khoá hỏi Supabase, nên không biết dữ liệu có được sao lưu hay không.\n" +
    "Không biết KHÔNG phải là ổn.";
  console.error(tin);
  await nhanTelegram(tin);
  process.exit(1);
}

const H = { Authorization: `Bearer ${TOKEN}` };

let banSaoLuu = [];
let pitr = false;
try {
  const r = await fetch(`https://api.supabase.com/v1/projects/${DU_AN}/database/backups`, { headers: H });
  if (!r.ok) throw new Error(`${r.status}`);
  const j = await r.json();
  banSaoLuu = Array.isArray(j.backups) ? j.backups : [];
  pitr = j.pitr_enabled === true;
} catch (e) {
  const tin =
    "🔴 iFan — KHÔNG HỎI ĐƯỢC SUPABASE VỀ BẢN SAO LƯU\n\n" +
    `Lỗi: ${String(e).slice(0, 120)}\n` +
    "Không biết KHÔNG phải là ổn.";
  console.error(tin);
  await nhanTelegram(tin);
  process.exit(1);
}

const gioTruoc = (t) => (Date.now() - new Date(t).getTime()) / 3_600_000;
const conMoi = banSaoLuu.filter((b) => b.status === "COMPLETED" && gioTruoc(b.inserted_at) <= HAN_GIO);

if (pitr || conMoi.length > 0) {
  console.log(
    `✅ iFan có bản sao lưu: ${banSaoLuu.length} bản (mới nhất trong ${HAN_GIO} giờ: ${conMoi.length})` +
      `${pitr ? " · PITR đang bật" : ""}`,
  );
  process.exit(0);
}

const tin =
  "🔴 iFan CHƯA CÓ BẢN SAO LƯU NÀO\n\n" +
  `Hỏi Supabase hôm nay: dự án iFan có ${banSaoLuu.length} bản sao lưu, ` +
  `không bản nào trong ${HAN_GIO} giờ qua, PITR tắt.\n\n` +
  "Nghĩa là nếu xoá nhầm một bảng, hoặc dự án gặp sự cố, thì dữ liệu của MỌI tiệm " +
  "đang dùng sẽ mất trắng — không có đường lùi.\n\n" +
  "Đáng nói: tài khoản này ĐANG TRẢ TIỀN gói Pro, và bản sao lưu tự động đang chạy " +
  "hằng ngày cho dự án hieu.asia. Chỉ là iFan không nằm trong tổ chức đó.\n\n" +
  "Việc cần làm (một lần, ở trang Supabase): chuyển dự án iFan sang tổ chức đang có " +
  "gói Pro, hoặc nâng gói cho tổ chức iFan. Cả hai đều đổi hoá đơn nên phải anh quyết.\n\n" +
  "Tin này lặp lại mỗi ngày cho tới khi có bản sao lưu đầu tiên.";

console.error(tin);
await nhanTelegram(tin);
process.exit(1);
