/**
 * NGƯỜI CANH — gọi đường kiểm sống, hỏng thì nhắn vào Telegram.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CANH TỪ NGOÀI, KHÔNG CANH TỪ TRONG
 * ═══════════════════════════════════════════════════════════════════
 * Kho có sẵn cơ chế báo động chạy bằng việc nền TRONG cơ sở dữ liệu
 * (`system_alerts`, `cron_watchdog`). Nó bắt được việc nền hỏng, nhưng KHÔNG
 * bao giờ bắt được chuyện quan trọng nhất: chính cơ sở dữ liệu sập. Lúc đó việc
 * nền cũng chết theo, và cái đáng lẽ phải kêu thì im lặng nhất.
 *
 * Người canh phải đứng NGOÀI hệ thống được canh. File này chạy trên máy của
 * GitHub, gọi vào web như một người dùng thật.
 *
 * ⚠️ HAI LƯỢT GỌI CÁCH NHAU, rồi mới kêu. Một lượt hỏng có thể chỉ là mạng chớp
 *   hoặc máy chủ đang khởi động nguội — kêu ngay là dạy người ta bỏ qua báo
 *   động, và lúc sập thật thì không ai buồn nhìn.
 *
 * ⚠️ KHÔNG có token Telegram thì VẪN đỏ, chỉ là không nhắn được. Bỏ qua trong
 *   im lặng khi thiếu cấu hình là biến người canh thành người luôn nói "ổn".
 *
 * Chạy: node scripts/canh-song.mjs [địa-chỉ]
 */

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "https://ifan-web.vercel.app";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const NHOM = process.env.TELEGRAM_GROUP_ID;

/** Một lượt gọi, có hạn chờ riêng — treo lâu cũng là hỏng. */
async function goiThu() {
  const dung = AbortSignal.timeout(15000);
  const t0 = Date.now();
  try {
    const r = await fetch(`${NEN}/api/health`, { cache: "no-store", signal: dung });
    const than = await r.json().catch(() => ({}));
    return { ok: r.status === 200 && than.ok === true, ma: r.status, than, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ma: 0, than: { loi: String(e?.name ?? e) }, ms: Date.now() - t0 };
  }
}

const lan1 = await goiThu();
let lan2 = null;
if (!lan1.ok) {
  // Chờ rồi thử lại — phân biệt "mạng chớp" với "sập thật".
  await new Promise((r) => setTimeout(r, 20000));
  lan2 = await goiThu();
}

const sap = !lan1.ok && lan2 !== null && !lan2.ok;
const mo = (x) => (x ? `${x.ma} · ${x.ms}ms · ${JSON.stringify(x.than).slice(0, 90)}` : "—");

console.log(`Lượt 1: ${mo(lan1)}`);
if (lan2) console.log(`Lượt 2: ${mo(lan2)}`);

if (!sap) {
  console.log(lan1.ok ? "✅ Web còn sống." : "✅ Lượt đầu hỏng nhưng lượt sau đã ổn — mạng chớp, không kêu.");
  process.exit(0);
}

const tin =
  `🔴 iFan KHÔNG truy cập được\n\n` +
  `Đã thử 2 lần cách nhau 20 giây, cả hai đều hỏng.\n` +
  `Địa chỉ: ${NEN}\n` +
  `Lượt 1: ${mo(lan1)}\n` +
  `Lượt 2: ${mo(lan2)}\n\n` +
  `Nếu phần "db" là false thì web còn chạy nhưng KHO DỮ LIỆU không tới được — ` +
  `lúc đó trang giới thiệu vẫn hiện bình thường trong khi mọi tiệm không làm được gì.`;

console.error(tin);

if (!TOKEN || !NHOM) {
  console.error("\n⚠️ Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_GROUP_ID — KHÔNG nhắn được cho ai.");
  process.exit(1);
}
try {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: NHOM, text: tin, disable_web_page_preview: true }),
  });
  console.error(r.ok ? "Đã nhắn vào Telegram." : `Nhắn hỏng: ${r.status} ${(await r.text()).slice(0, 120)}`);
} catch (e) {
  console.error("Nhắn hỏng:", String(e).slice(0, 120));
}
process.exit(1);
