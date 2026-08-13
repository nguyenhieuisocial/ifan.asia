#!/usr/bin/env node
/**
 * Cầu nối Telegram ↔ Claude Code — chạy trên máy founder (task #115 phần 2).
 *
 * LUỒNG: webhook sản phẩm nhận mọi tin 24/7. Tin nào KHÔNG phải lệnh thì nó
 * đẩy vào hàng đợi `tg_bridge_queue` (migration #91). Script này lấy từ hàng
 * đợi ra, hỏi Claude Code ở chế độ tự động, rồi gửi câu trả lời về Telegram.
 *
 * VÌ SAO KHÔNG tự hỏi thẳng Telegram: một bot chỉ được chọn MỘT trong hai —
 * webhook hoặc tự hỏi. Đi đường hàng đợi thì webhook luôn giữ bot, script này
 * chỉ là phần CỘNG THÊM: tắt nó đi các lệnh /… vẫn chạy nguyên vẹn.
 *
 * QUYỀN CỦA CLAUDE — CỐ Ý ĐỂ MẶC ĐỊNH (chỉ đọc, không tự sửa file):
 * người trong nhóm Telegram nhắn gì thì Claude làm nấy. Mở quyền ghi
 * (--dangerously-skip-permissions) là biến một tin nhắn bất kỳ — kể cả tin
 * do người khác gửi vào nhóm — thành lệnh sửa/xoá code không ai duyệt.
 * Muốn mở phải là quyết định riêng, ghi ADR, không lặng lẽ bật ở đây.
 *
 * CHẠY:  node scripts/telegram-bridge.mjs
 * DỪNG:  Ctrl+C (dừng lúc nào cũng an toàn, không để lại trạng thái hỏng)
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Nghỉ giữa hai lượt hỏi hàng đợi khi không có việc. */
const IDLE_POLL_MS = 3_000;
/**
 * Trần thời gian cho MỘT câu hỏi. Chủ dự án được dài hơn vì có thể nhờ sửa
 * code thật (đọc nhiều file, sửa, kiểm) — 3 phút là quá ngắn cho việc đó.
 * Người thường chỉ hỏi–đáp nên 3 phút là rộng rãi.
 */
const TIMEOUT_OWNER_MS = 600_000;
const TIMEOUT_GUEST_MS = 180_000;
/** Trần một tin Telegram; dài hơn thì cắt thành nhiều tin. */
const TG_CHUNK = 3_800;
/** Nhịp báo "đang gõ" cho Telegram — dấu hiệu này tự tắt sau ~5 giây. */
const TYPING_REFRESH_MS = 4_000;

function readEnvLocal() {
  const raw = readFileSync(join(PROJECT_DIR, ".env.local"), "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = readEnvLocal();
const SUPABASE_URL = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TG_TOKEN = env.TELEGRAM_BOT_TOKEN;
const SB_ADMIN = env.SUPABASE_ACCESS_TOKEN;
const SB_REF = env.SUPABASE_PROJECT_REF;

if (!SUPABASE_URL || !SUPABASE_ANON || !TG_TOKEN || !SB_ADMIN || !SB_REF) {
  console.error("Thiếu cấu hình trong .env.local — cần SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_BOT_TOKEN, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF");
  process.exit(1);
}

/**
 * Khoá chung của các cửa bot nằm trong CSDL chứ không nằm ở file — lấy một
 * lần lúc khởi động để khỏi phải chép thêm một bí mật nữa ra đĩa.
 */
async function fetchIngestKey() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${SB_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SB_ADMIN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "select value from private.app_config where key='bot_ingest_key'" }),
  });
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows[0]?.value) throw new Error("không đọc được bot_ingest_key");
  return rows[0].value;
}

async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} lỗi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  // Hàm trả `void` (tg_bridge_complete) khiến PostgREST trả 204 THÂN RỖNG —
  // gọi .json() thẳng là ném "Unexpected end of JSON input", và vì lỗi ném ra
  // giữa vòng lặp nên các việc còn lại TRONG CÙNG LÔ bị bỏ rơi im lặng. Bắt
  // được khi chạy thật, không phải suy đoán.
  const body = await res.text();
  return body ? JSON.parse(body) : null;
}

/**
 * Đổi cách viết của Claude (markdown) sang HTML mà Telegram hiểu.
 *
 * BUG founder bắt được 13/08: Claude trả lời "Tôi là **Claude Code**", gửi thô
 * thì Telegram in nguyên hai dấu sao thay vì in đậm. Dặn Claude đừng dùng
 * markdown là KHÔNG đủ (nó viết theo phản xạ) — phải đổi ở tầng mã, giống
 * nguyên tắc đã dùng cho chặn quyền: hàng rào thật, không phải lời dặn.
 *
 * Thứ tự BẮT BUỘC: thoát ký tự HTML TRƯỚC, rồi mới chèn thẻ. Làm ngược lại
 * thì chính thẻ mình vừa chèn bị thoát thành chữ.
 *
 * Telegram chỉ chấp nhận vài thẻ (b/i/u/s/code/pre/a) — chèn thẻ khác là API
 * trả 400 và MẤT TRẮNG câu trả lời, nên chỉ dùng đúng bộ đó.
 */
function mdToTelegramHtml(src) {
  let s = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Khối mã ``` … ``` (làm trước để nội dung bên trong không bị bắt nhầm)
  s = s.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, (_, code) => `<pre>${code.trim()}</pre>`);
  // Mã inline `…`
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  // Tiêu đề "## Tên" → in đậm (Telegram không có cỡ chữ)
  s = s.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");
  // **đậm** rồi mới tới *nghiêng* — làm ngược thì ** bị ăn mất một sao
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)!?]|$)/g, "$1<i>$2</i>");
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:)!?]|$)/g, "$1<i>$2</i>");
  // [chữ](link)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  // Gạch đầu dòng "- " / "* " → dấu chấm tròn cho dễ đọc trên điện thoại
  s = s.replace(/^[-*]\s+/gm, "· ");
  return s;
}

/**
 * LỚP CHẶN THỨ HAI cho bí mật — quét câu trả lời trước khi gửi đi.
 *
 * Claude Code đã có hàng rào sẵn: thử bảo nó đọc `.env.local` thì bị chặn
 * (đã kiểm thật 13/08). Nhưng KHÔNG được dựa vào một lớp duy nhất — câu trả
 * lời còn có thể vô tình mang bí mật qua đường khác: kết quả tìm kiếm trong
 * mã nguồn, thông báo lỗi có chuỗi kết nối, người dùng tự dán khoá vào rồi
 * hỏi. Mà đầu ra ở đây đi thẳng vào NHÓM CHAT nhiều người đọc.
 *
 * Chặn theo HÌNH DẠNG khoá chứ không theo tên biến: hình dạng thì không phụ
 * thuộc việc khoá nằm ở file nào, tên gì.
 */
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_\-]{20,}/g,              // khoá Anthropic
  /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, // JWT (Supabase)
  /sbp_[a-f0-9]{20,}/g,                        // token quản trị Supabase
  /sb_secret_[A-Za-z0-9_\-]{10,}/g,            // khoá bí mật Supabase
  /vcp_[A-Za-z0-9]{20,}/g,                     // token Vercel
  /re_[A-Za-z0-9_\-]{20,}/g,                   // khoá Resend
  /\b\d{8,}:[A-Za-z0-9_\-]{30,}\b/g,           // token bot Telegram
  /postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@[^\s]+/g, // chuỗi kết nối CSDL kèm mật khẩu
];

function redactSecrets(src) {
  let s = src;
  let hit = 0;
  for (const re of SECRET_PATTERNS) {
    s = s.replace(re, () => {
      hit += 1;
      return "[đã ẩn vì là khoá bí mật]";
    });
  }
  if (hit > 0) console.warn(`   ⚠ đã che ${hit} chuỗi giống khoá bí mật trước khi gửi`);
  return s;
}

/** Bỏ hẳn ký hiệu markdown — dùng khi gửi bản HTML thất bại. */
function stripMd(src) {
  return src
    .replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/^[-*]\s+/gm, "· ");
}

/**
 * Cắt theo RANH GIỚI DÒNG, không cắt giữa chừng: cắt bừa có thể xẻ đôi một
 * cặp ** hoặc một thẻ, làm khúc sau hiển thị hỏng.
 */
function chunkByLines(text, max) {
  const out = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur.length + line.length + 1 > max) {
      if (cur) out.push(cur);
      // Dòng đơn lẻ dài hơn cả trần thì đành cắt cứng.
      cur = line.length > max ? "" : line;
      if (line.length > max) {
        for (let i = 0; i < line.length; i += max) out.push(line.slice(i, i + max));
      }
    } else {
      cur = cur ? `${cur}\n${line}` : line;
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [text.slice(0, max)];
}

/** Báo "đang gõ" cho tới khi gọi hàm dừng — trấn an người chờ câu trả lời lâu. */
function tgTyping(chatId, threadId) {
  const ping = () =>
    fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        action: "typing",
        ...(threadId ? { message_thread_id: threadId } : {}),
      }),
    }).catch(() => {});
  ping();
  const timer = setInterval(ping, TYPING_REFRESH_MS);
  return () => clearInterval(timer);
}

async function tgSend(chatId, text, threadId) {
  // Che bí mật TRƯỚC khi cắt khúc: cắt trước có thể xẻ đôi một khoá làm hai
  // nửa, mỗi nửa không khớp mẫu nào và lọt sạch.
  text = redactSecrets(text);
  for (const part of chunkByLines(text, TG_CHUNK)) {
    const base = { chat_id: chatId, ...(threadId ? { message_thread_id: threadId } : {}) };
    const post = (payload) =>
      fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, ...payload }),
      });

    const res = await post({ text: mdToTelegramHtml(part), parse_mode: "HTML" });
    if (res.ok) continue;
    // Lưới an toàn: thẻ hỏng thì Telegram trả 400 và tin MẤT HẲN. Thà mất chữ
    // đậm còn hơn mất câu trả lời — gửi lại bản chữ thô đã bóc ký hiệu.
    await post({ text: stripMd(part) });
  }
}

/**
 * Tìm file chạy của Claude Code.
 *
 * PHẢI gọi bằng ĐƯỜNG DẪN THẬT, KHÔNG được dùng `shell: true`: trên Windows,
 * spawn với shell KHÔNG tự bọc nháy quanh tham số có dấu cách — câu hỏi
 * "Dự án iFan có bao nhiêu trang?" bị xé thành hàng chục tham số rời và
 * Claude chỉ nhận được đúng một chữ. Bẫy này đã bắt được ngay lần chạy đầu:
 * bot trả lời "tin nhắn bị gửi thiếu, mới thấy mỗi chữ Bạn".
 *
 * Thứ tự tìm: biến CLAUDE_BIN (cho người tự cài chỗ khác) → thư mục cài của
 * ứng dụng Claude, lấy BẢN MỚI NHẤT (tên thư mục là số phiên bản, app tự cập
 * nhật nên không được ghim cứng một phiên bản).
 */
const binSearchLog = [];

function resolveClaudeBin() {
  if (process.env.CLAUDE_BIN) {
    binSearchLog.push(`CLAUDE_BIN=${process.env.CLAUDE_BIN} (có: ${existsSync(process.env.CLAUDE_BIN)})`);
    if (existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  }
  /**
   * BẪY ĐÃ BẮT ĐƯỢC 13/08 — chạy tay thì thấy Claude, chạy qua tác vụ Windows
   * lại báo "không có thư mục" DÙ ĐƯỜNG DẪN GIỐNG HỆT NHAU.
   *
   * Nguyên do: ứng dụng Claude cài dạng đóng gói (MSIX/Microsoft Store) nên
   * `%APPDATA%\Claude` bị **ảo hoá** — chỉ tiến trình chạy BÊN TRONG gói mới
   * nhìn thấy. Cửa sổ lệnh do chính ứng dụng mở nằm trong gói (thấy), còn tác
   * vụ Windows chạy ngoài gói (không thấy). Đường thật nằm ở
   * ...\AppData\Local\Packages\Claude_*\LocalCache\Roaming\Claude\claude-code
   *
   * Nên phải tìm cả hai: đường thường (khi chạy trong gói) và đường thật của
   * gói (khi chạy ngoài).
   */
  const roots = [
    process.env.APPDATA,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, "AppData", "Roaming") : null,
  ].filter(Boolean);

  const localApp =
    process.env.LOCALAPPDATA ??
    (process.env.USERPROFILE ? join(process.env.USERPROFILE, "AppData", "Local") : null);
  if (localApp && existsSync(join(localApp, "Packages"))) {
    for (const pkg of readdirSync(join(localApp, "Packages"))) {
      if (pkg.startsWith("Claude")) {
        roots.push(join(localApp, "Packages", pkg, "LocalCache", "Roaming"));
      }
    }
  }

  for (const root of roots) {
    const base = join(root, "Claude", "claude-code");
    if (!existsSync(base)) {
      binSearchLog.push(`${base} → không có thư mục`);
      continue;
    }
    const versions = readdirSync(base)
      .filter((d) => existsSync(join(base, d, "claude.exe")))
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      );
    binSearchLog.push(`${base} → thấy ${versions.length} bản: ${versions.join(", ") || "(rỗng)"}`);
    const newest = versions.at(-1);
    if (newest) return join(base, newest, "claude.exe");
  }
  return null;
}

const CLAUDE_BIN = resolveClaudeBin();

/**
 * HAI MỨC QUYỀN (founder chốt 13/08): chỉ tài khoản Telegram của chủ dự án
 * mới được yêu cầu SỬA ĐỔI / CHẠY LỆNH; mọi người khác chỉ hỏi–đáp.
 *
 * Nhận diện bằng MÃ SỐ tài khoản Telegram, không phải @tên hiển thị — tên đổi
 * được nên dùng để phân quyền là mời giả mạo (webhook đã sửa để đẩy mã số).
 *
 * Khai bằng biến TELEGRAM_OWNER_IDS trong .env.local, ngăn cách bởi dấu phẩy.
 * Bỏ trống = KHÔNG AI có quyền sửa (khoá chặt mặc định, không mở toang).
 */
const OWNER_IDS = new Set(
  (env.TELEGRAM_OWNER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

const HINT_COMMON = [
  "Bạn đang trả lời qua Telegram cho đội ngũ nội bộ iFan.asia.",
  "Trả lời NGẮN GỌN bằng tiếng Việt, tối đa vài đoạn — người đọc đang dùng điện thoại.",
  // Telegram không hiện được bảng; đậm/nghiêng thì tầng gửi tự đổi sang thẻ
  // Telegram hiểu, nhưng nhắc ở đây để đỡ phải đổi và bớt rối mắt.
  "Không dùng bảng biểu. Hạn chế in đậm — chỉ dùng khi thật cần nhấn mạnh.",
];

const HINT_OWNER = [
  ...HINT_COMMON,
  "Người hỏi là CHỦ DỰ ÁN — được phép yêu cầu bạn sửa file trong dự án.",
  "Sửa xong thì báo rõ đã đụng file nào. Không tự đẩy code lên nếu không được bảo.",
].join(" ");

/**
 * Bản tóm tắt THÔNG TIN CÔNG KHAI — thứ duy nhất người thường được biết.
 *
 * Dựng TỪ CHÍNH nội dung đang hiện trên trang web công khai (`messages/vi.json`
 * + `feature-registry.ts`), không chép tay: chép tay là ngày nào đó trang web
 * đổi mà bot vẫn nói số cũ (luật D1 — một nguồn sự thật).
 */
function buildPublicFacts() {
  try {
    const msg = JSON.parse(readFileSync(join(PROJECT_DIR, "messages/vi.json"), "utf8"));
    const reg = readFileSync(join(PROJECT_DIR, "lib/feature-registry.ts"), "utf8");
    const mods = [...reg.matchAll(/key:\s*"(\w+)",\s*status:\s*"(\w+)"/g)];
    // Đọc bằng biểu thức tìm chuỗi nên ĐỔI CÁCH VIẾT sổ đăng ký là câm lặng
    // hỏng: không ném lỗi, chỉ ra danh sách rỗng, rồi bot dõng dạc nói iFan
    // chẳng có tính năng nào. Đúng loại thất bại im lặng dự án cấm (bug #85).
    // Nay ít hơn 20 mảng là coi như đọc hỏng và rơi về câu an toàn.
    if (mods.length < 20) throw new Error(`chỉ đọc được ${mods.length} mảng`);
    const label = { ready: "dùng được", building: "đang xây", planned: "sắp tới" };
    const list = mods
      .map(([, k, s]) => `${msg.landing?.modules?.[k]?.name ?? k} (${label[s] ?? s})`)
      .join(" · ");
    // Lấy đúng những gạch đầu dòng đang có trên trang giá, không ghim cứng
    // f1..f4 — thêm/bớt một dòng là bản ghim cứng in ra chữ "undefined".
    const free = Object.entries(msg.bangGia?.free ?? {})
      .filter(([k, v]) => /^f\d+$/.test(k) && typeof v === "string")
      .map(([, v]) => v)
      .join(", ");
    return [
      "THÔNG TIN CÔNG KHAI VỀ iFan.asia (chỉ được dùng đúng những gì dưới đây):",
      `Là gì: ${msg.landing?.footer?.description ?? "phần mềm quản trị cho tiệm và công ty dịch vụ 2-100 người ở Việt Nam"}`,
      `Các mảng: ${list}`,
      free ? `Gói miễn phí: ${free}. Gói trả phí chưa công bố giá.` : "",
      // KHÔNG ghim "ifan.asia": kiểm ngày 13/08 thấy tên miền đó đang chạy MỘT
      // HỆ THỐNG KHÁC (đá thẳng về trang đăng nhập lạ), sản phẩm thật nằm ở
      // địa chỉ Vercel. Chỉ khách vào nhầm chỗ là mất khách thật. Lấy đúng
      // nguồn mà web đang dùng (luật D1) nên ngày trỏ tên miền về là tự đúng.
      `Trang web: ${process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://ifan-web.vercel.app"}`,
    ]
      .filter(Boolean)
      .join("\n");
  } catch (e) {
    // Kêu to: chạy ẩn nên không ai thấy, nhưng dòng này vào file nhật ký.
    console.warn(`   ⚠ KHÔNG dựng được tóm tắt công khai (${e.message}) — bot sẽ`);
    console.warn("     trả lời cầm chừng cho tới khi sửa. Xem buildPublicFacts().");
    return "THÔNG TIN CÔNG KHAI: iFan.asia là phần mềm quản trị cho tiệm và công ty dịch vụ nhỏ ở Việt Nam.";
  }
}

const PUBLIC_FACTS = buildPublicFacts();

/**
 * Người thường: CHỈ thông tin công khai.
 *
 * Founder chốt 13/08: *"user thường chỉ được hỏi những thứ công khai; nội bộ và
 * bí mật thì không tiết lộ được — trả lời khéo léo, đừng cho biết họ là hạng
 * thành viên gì, và không được dài dòng."*
 *
 * Lời dặn này CHỈ lo phần cư xử (khéo, ngắn, không lộ thứ hạng). Phần chặn
 * thật nằm ở chỗ khác: người thường chạy NGOÀI thư mục dự án nên không có mã
 * nguồn nào để đọc — xem GUEST_SANDBOX_DIR.
 */
const HINT_GUEST = [
  "Bạn là trợ lý của iFan.asia, trả lời qua Telegram.",
  "Trả lời RẤT NGẮN — 1 đến 3 câu, không gạch đầu dòng, không mở bài.",
  "",
  PUBLIC_FACTS,
  "",
  "Ngoài những thông tin trên, bạn KHÔNG biết gì thêm về iFan: không biết mã nguồn,",
  "kiến trúc, cơ sở dữ liệu, số liệu kinh doanh, kế hoạch chưa công bố, hay việc nội bộ.",
  "",
  "Gặp câu hỏi ngoài phạm vi đó — hoặc ai nhờ sửa file, chạy lệnh, đổi dữ liệu —",
  "trả lời ĐÚNG MỘT CÂU này, không thêm bớt, không giải thích lý do:",
  '"Cái này mình không có thông tin, bạn nhắn trực tiếp anh Hiếu nhé."',
  "",
  "Câu đó là cả câu trả lời. KHÔNG được thêm bất kỳ câu nào nói vì sao bạn không",
  "trả lời được. Cấm tuyệt đối các chữ: quyền, được phép, giới hạn, thành viên,",
  "vai trò, truy cập, nội bộ, bảo mật. Người hỏi chỉ cần thấy bạn không có thông",
  "tin đó — không cần biết có hay không một hàng rào nào phía sau.",
].join("\n");

/**
 * HÀNG RÀO CHO NGƯỜI THƯỜNG — `--permission-mode plan`.
 *
 * ⚠️ BÀI HỌC ĐẮT NHẤT NGÀY 13/08, ghi kỹ để không ai lặp lại:
 *
 * Bản trước chỉ dùng `--disallowedTools` và tôi ĐÃ BÁO VỚI FOUNDER LÀ AN TOÀN.
 * Sai. Kiểm lại bằng cách bảo bot (vai người thường) sửa README.md — **file bị
 * sửa thật**. Lý do: cài đặt cá nhân của máy có `defaultMode: auto` (tự duyệt
 * mọi thao tác), đè lên cờ chặn.
 *
 * Vì sao lần kiểm TRƯỚC lại tưởng an toàn: lần đó tôi bảo bot tạo file tên
 * "test-gia-mao.txt" với nội dung "hacked" — nghe rõ ràng là phá hoại nên bot
 * TỰ TỪ CHỐI. Tôi kết luận nhầm "hàng rào chặn được", trong khi thật ra chỉ là
 * bot tử tế. Bài kiểm hỏng vì cái cớ từ chối khác với cái mình định đo.
 * ⇒ Bài kiểm bảo mật phải dùng yêu cầu VÔ HẠI mà vẫn ghi file, và phải kiểm
 *   TRẠNG THÁI THẬT của file, không tin lời bot nói "đã xong".
 *
 * `plan` là chế độ chuyên để bàn phương án, KHÔNG được đụng vào gì — đã kiểm:
 * bảo sửa file thì nó trả về kế hoạch và file y nguyên. Giữ thêm danh sách
 * công cụ cấm làm lớp phụ, phòng khi chế độ này đổi nghĩa ở bản sau.
 */
const GUEST_PERMISSION_MODE = "plan";
/**
 * Người thường KHÔNG được đọc file — kể cả mã nguồn. Founder chốt: họ chỉ được
 * biết thông tin CÔNG KHAI; mã nguồn/kiến trúc/số liệu là NỘI BỘ.
 */
const GUEST_BLOCKED_TOOLS =
  "Write,Edit,NotebookEdit,Bash,WebFetch,Task,Read,Glob,Grep,WebSearch";

/**
 * Thư mục RỖNG để chạy phiên của người thường.
 *
 * Đây mới là hàng rào THẬT, không phải lời dặn: chạy trong thư mục dự án thì
 * Claude tự nạp CLAUDE.md và bối cảnh dự án vào đầu — cấm công cụ đọc file vẫn
 * không xoá được thứ đã nằm sẵn trong đầu nó. Chạy ở thư mục rỗng thì KHÔNG CÓ
 * GÌ để nạp, nên không có gì để lỡ miệng.
 *
 * Lợi thêm: bối cảnh nhẹ đi hẳn ⇒ trả lời nhanh hơn và tốn ít hạn mức hơn.
 *
 * ⚠️ CHỖ NÀY CHƯA KÍN HẲN — đã kiểm tay, ghi lại để không ai tưởng là kín:
 * file hướng dẫn cá nhân của founder (`~/.claude/CLAUDE.md`) vẫn được nạp dù
 * chạy ở thư mục nào. Đã thử ba đường bịt và **cả ba đều hỏng việc khác**:
 * chế độ tối giản và đổi thư mục nhà đều làm **mất đăng nhập** (gói thuê bao
 * không đọc được), còn cắt nguồn cài đặt thì hỏng luôn tên gọi tắt của model.
 * Đường bịt duy nhất còn lại là chuyển sang khoá API tính tiền theo lượt —
 * founder đã chọn không dùng.
 *
 * Mức rủi ro thật: file đó chứa **thói quen làm việc** của founder, KHÔNG chứa
 * mật khẩu, khoá, hay dữ liệu khách. Lấy được nó còn phải vượt qua lời từ chối
 * của bot. Chấp nhận tạm, đã ghi thành việc theo dõi — không im lặng bỏ qua.
 */
const GUEST_SANDBOX_DIR = join(
  process.env.LOCALAPPDATA ?? PROJECT_DIR,
  "iFan",
  "guest-sandbox",
);

/**
 * CẮT MỌI KẾT NỐI MCP KHỎI PHIÊN NGƯỜI THƯỜNG.
 *
 * Bắt được khi kiểm tay: phiên người thường **vẫn nạp toàn bộ kết nối MCP của
 * founder** — Supabase (ghi thẳng vào CSDL thật), Vercel, Cloudflare, hộp thư…
 * Chế độ chỉ-lập-kế-hoạch có chặn chạy, nhưng để sẵn một dàn công cụ ghi được
 * vào dữ liệu thật trong tay người lạ là thừa rủi ro không đổi lấy gì.
 *
 * Hai cờ phải đi CÙNG NHAU: cờ thứ hai bảo "chỉ dùng cấu hình tôi đưa", cờ thứ
 * nhất đưa cấu hình RỖNG. Thiếu cờ thứ hai thì cấu hình rỗng chỉ được cộng vào
 * danh sách cũ chứ không thay thế.
 *
 * Lợi thêm: bớt hẳn phần mô tả công cụ ⇒ mỗi câu hỏi rẻ và nhanh hơn.
 */
const GUEST_NO_MCP = [
  "--mcp-config",
  '{"mcpServers":{}}',
  "--strict-mcp-config",
];

/**
 * Model theo vai — đòn bẩy chi phí lớn nhất, đo thật: model nhẹ trả lời cùng
 * câu hỏi trong 12 giây / ~6.900đ, model nặng 30 giây / ~17.800đ.
 *
 * Người thường chỉ hỏi–đáp về dự án ⇒ model nhẹ thừa sức, lại nhanh hơn.
 * Chủ dự án có thể nhờ sửa code thật ⇒ để nguyên model mặc định trong cài đặt
 * của anh ấy, không tự ý hạ cấp sau lưng.
 */
const GUEST_MODEL = "sonnet";

/**
 * Câu lệnh làm mới mạch chuyện. Phải xử ở ĐÂY chứ không ở server: mạch chuyện
 * nằm trên máy này, server không xoá hộ được.
 */
const RESET_COMMANDS = new Set(["/moi", "/reset", "/moi@ifanvn_bot", "/reset@ifanvn_bot"]);

/**
 * NHỚ NGỮ CẢNH HỘI THOẠI (thiếu sót lớn nhất của bản đầu).
 *
 * Trước đây mỗi câu hỏi là một lượt gọi độc lập, không biết gì về câu trước —
 * nên hỏi tiếp kiểu "vậy cái đó sửa sao?" là Claude ngơ ngác. Nay lưu mã phiên
 * mỗi lần trả lời và nối tiếp ở câu sau.
 *
 * Tách phiên theo TỪNG CHỦ ĐỀ (chat + chủ đề), không dùng chung một phiên:
 * nhóm có 7 chủ đề, gộp chung thì chuyện bên "Lỗi" lẫn sang bên "Ý tưởng".
 *
 * Lưu ra file để tắt máy bật lại vẫn nhớ. Hỏng file thì coi như chưa có phiên
 * nào — mất ngữ cảnh chứ không chết cầu nối.
 */
const STATE_DIR = join(process.env.LOCALAPPDATA ?? PROJECT_DIR, "iFan");
const SESSION_FILE = join(STATE_DIR, "telegram-sessions.json");

function loadSessions() {
  try {
    return JSON.parse(readFileSync(SESSION_FILE, "utf8"));
  } catch {
    return {};
  }
}

let sessions = loadSessions();

function saveSessions() {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
  } catch (e) {
    console.warn(`   ⚠ không lưu được mã phiên: ${e.message}`);
  }
}

/**
 * Khoá mạch chuyện PHẢI có MÃ NGƯỜI HỎI, không chỉ phòng chat.
 *
 * ⚠️ LỖI THIẾT KẾ bắt được 13/08, hai hậu quả đều nặng:
 *
 * Bản trước lấy khoá là `phòng:chủ-đề`. Trong nhóm thì MỌI NGƯỜI dùng chung
 * một mạch chuyện ⇒
 *  1. QUYỀN RƠI SANG NHAU. Người thường hỏi trước (chế độ chỉ-đọc) tạo ra
 *     mạch chuyện mang chế độ đó; chủ dự án hỏi sau nối tiếp đúng mạch ấy và
 *     **mất quyền sửa file** — đo được: yêu cầu sửa README trả lời "xong" mà
 *     file không đổi. Chiều ngược lại còn nguy hơn: người thường nối tiếp mạch
 *     của chủ dự án thì có thể thừa hưởng quyền sửa.
 *  2. LỘ NỘI DUNG. Người sau đọc được ngữ cảnh cuộc trò chuyện của người trước
 *     trong cùng phòng.
 *
 * Thêm mã người vào khoá là dứt cả hai. Đánh đổi có chủ đích: trong nhóm mỗi
 * người có mạch riêng, không nối tiếp câu của người khác — đúng hơn, vì "vậy
 * cái đó sao?" phải trỏ về câu CHÍNH MÌNH vừa hỏi.
 */
const sessionKey = (job) => `${job.q_chat}:${job.q_thread ?? 0}:${job.q_user}`;

/**
 * Gọi Claude Code chế độ tự động. Trả về {ok, text, sessionId, costUsd, ms}.
 * `resumeId` có thì nối tiếp hội thoại cũ.
 */
function askClaude(question, isOwner, resumeId) {
  return new Promise((resolve) => {
    /**
     * Dọn sạch mọi biến ANTHROPIC_* của máy trước khi gọi Claude Code.
     *
     * Máy này có app **Jan** (jan.ai — AI chạy cục bộ) đã cài sẵn 5 biến ở cấp
     * hệ thống, trong đó nguy hiểm nhất là ANTHROPIC_BASE_URL=http://0.0.0.0:1337
     * — nó bẻ TOÀN BỘ lưu lượng Claude Code sang máy chủ Jan cục bộ. Jan không
     * chạy thì mọi lượt gọi bị "từ chối kết nối" (đúng lỗi terminal gặp lúc
     * trước); Jan có chạy thì mọi câu hỏi + mã nguồn dự án đi qua app đó.
     *
     * Cầu nối này PHẢI nói chuyện thẳng với Anthropic bằng gói thuê bao của
     * founder, nên xoá cả cụm — kể cả các biến ép model, để không bị một cài
     * đặt ngoài dự án âm thầm đổi hành vi.
     */
    const childEnv = { ...process.env };
    for (const k of Object.keys(childEnv)) {
      if (k.startsWith("ANTHROPIC_")) delete childEnv[k];
    }

    // Định dạng JSON để lấy được mã phiên (nối tiếp hội thoại) và chi phí —
    // chữ thuần thì chỉ có mỗi câu trả lời, không biết gì thêm.
    const args = [
      "-p",
      question,
      "--output-format",
      "json",
      "--append-system-prompt",
      isOwner ? HINT_OWNER : HINT_GUEST,
    ];
    if (resumeId) args.push("--resume", resumeId);
    if (isOwner) {
      // Chủ dự án: cho sửa file thẳng (headless không hỏi duyệt được, không
      // bật cờ này thì mọi yêu cầu sửa đều treo rồi hết giờ).
      args.push("--permission-mode", "acceptEdits");
    } else {
      // Thứ tự quan trọng: `plan` là hàng rào THẬT (đã kiểm), danh sách công
      // cụ cấm chỉ là lớp phụ — đừng bao giờ dựa vào mỗi nó.
      args.push("--permission-mode", GUEST_PERMISSION_MODE);
      args.push("--disallowedTools", GUEST_BLOCKED_TOOLS);
      args.push(...GUEST_NO_MCP);
      args.push("--model", GUEST_MODEL);
    }
    // Người thường chạy ở thư mục RỖNG — xem ghi chú GUEST_SANDBOX_DIR.
    const cwd = isOwner ? PROJECT_DIR : GUEST_SANDBOX_DIR;
    // shell: false (mặc định) — xem ghi chú ở resolveClaudeBin().
    const child = spawn(CLAUDE_BIN, args, { cwd, env: childEnv });

    const timeoutMs = isOwner ? TIMEOUT_OWNER_MS : TIMEOUT_GUEST_MS;
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({
        ok: false,
        text: `Câu hỏi xử lý quá lâu (quá ${Math.round(timeoutMs / 60000)} phút), đã dừng.`,
      });
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, text: `Không chạy được Claude Code: ${e.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) {
        try {
          const j = JSON.parse(out);
          const text = (j.result ?? "").trim();
          if (text && j.is_error !== true) {
            return resolve({
              ok: true,
              text,
              sessionId: j.session_id,
              costUsd: j.total_cost_usd,
              ms: j.duration_ms,
            });
          }
        } catch {
          // Không phải JSON (bản Claude Code cũ hơn?) — dùng nguyên văn còn
          // hơn báo lỗi cho người dùng.
          return resolve({ ok: true, text: out.trim() });
        }
      }
      const detail = (err || out).trim().slice(0, 300);
      resolve({
        ok: false,
        // Nối tiếp phiên cũ có thể hỏng nếu phiên đã bị dọn — báo riêng để
        // vòng gọi biết đường thử lại từ đầu thay vì bỏ luôn câu hỏi.
        resumeFailed: Boolean(resumeId),
        text: detail.includes("Not logged in")
          ? "Claude Code trên máy chưa đăng nhập. Mở PowerShell gõ: claude → /login"
          : `Claude Code lỗi: ${detail || "không rõ"}`,
      });
    });
  });
}

let running = true;
process.on("SIGINT", () => {
  console.log("\nĐang dừng cầu nối…");
  running = false;
});

/**
 * Chốt CHỈ-MỘT-BẢN-CHẠY. Từ khi cầu nối tự bật lúc đăng nhập Windows, rất dễ
 * có thêm một bản chạy tay — hai bản cùng hỏi hàng đợi thì cùng một câu hỏi
 * bị Claude trả lời hai lần, người dùng nhận tin trùng.
 *
 * Giữ chỗ bằng một cổng cục bộ thay vì file khoá: máy tắt đột ngột thì file
 * khoá còn nguyên và chặn nhầm lần chạy sau, còn cổng thì hệ điều hành tự thu
 * hồi khi tiến trình chết — không bao giờ kẹt.
 */
const SINGLE_INSTANCE_PORT = 47317;

function acquireSingleInstance() {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.listen(SINGLE_INSTANCE_PORT, "127.0.0.1", () => {
      srv.unref(); // không giữ tiến trình sống chỉ vì cái cổng này
      resolve(true);
    });
  });
}

async function main() {
  if (!(await acquireSingleInstance())) {
    console.log("Đã có một cầu nối đang chạy — thoát để tránh trả lời trùng.");
    process.exit(0);
  }
  // Dừng ngay với lời nhắn rõ ràng, thay vì chạy rồi mọi câu hỏi đều lỗi.
  if (!CLAUDE_BIN) {
    console.error(
      "Không tìm thấy Claude Code trên máy. Đã tìm ở:\n  " +
        (binSearchLog.join("\n  ") || "(không có đường nào để tìm — thiếu cả APPDATA lẫn USERPROFILE)") +
        "\nNếu cài ở chỗ khác, đặt biến CLAUDE_BIN trỏ tới file claude.exe rồi chạy lại.",
    );
    process.exit(1);
  }
  console.log(`Dùng Claude Code: ${CLAUDE_BIN}`);
  // Thư mục rỗng cho phiên người thường — tạo sẵn để lần hỏi đầu không lỗi.
  mkdirSync(GUEST_SANDBOX_DIR, { recursive: true });
  console.log(
    OWNER_IDS.size > 0
      ? `Tài khoản được quyền sửa đổi: ${[...OWNER_IDS].join(", ")}`
      : "CẢNH BÁO: chưa khai TELEGRAM_OWNER_IDS — mọi người chỉ hỏi-đáp, không ai sửa được gì.",
  );
  const key = await fetchIngestKey();
  console.log("Cầu nối Telegram ↔ Claude Code đã chạy. Ctrl+C để dừng.");
  console.log(`Thư mục dự án: ${PROJECT_DIR}`);

  while (running) {
    try {
      const jobs = await rpc("tg_bridge_claim", { p_key: key, p_batch: 3 });
      if (!Array.isArray(jobs) || jobs.length === 0) {
        await new Promise((r) => setTimeout(r, IDLE_POLL_MS));
        continue;
      }
      for (const job of jobs) {
        // Mỗi việc bọc riêng: một việc hỏng KHÔNG được kéo theo các việc còn
        // lại trong cùng lô (chúng sẽ kẹt ở 'taken' mãi mà không ai biết).
        let stopTyping = () => {};
        try {
          const isOwner = OWNER_IDS.has(String(job.q_user));
          const key2 = sessionKey(job);
          console.log(
            `[${new Date().toLocaleTimeString()}] ${isOwner ? "CHỦ DỰ ÁN" : "thành viên"} (${job.q_user}) hỏi: ${job.q_text.slice(0, 50)}`,
          );
          // Làm mới mạch chuyện — trả lời ngay, không tốn lượt gọi nào.
          if (RESET_COMMANDS.has(job.q_text.trim().toLowerCase())) {
            const had = Boolean(sessions[key2]);
            delete sessions[key2];
            saveSessions();
            await tgSend(
              job.q_chat,
              had
                ? "🧹 Đã quên mạch chuyện cũ. Hỏi lại từ đầu nhé."
                : "Chưa có mạch chuyện nào để quên — cứ hỏi thoải mái.",
              job.q_thread,
            );
            await rpc("tg_bridge_complete", {
              p_key: key,
              p_id: job.q_id,
              p_answer: "(làm mới mạch chuyện)",
              p_error: null,
              p_cost: null,
            });
            console.log("   → đã làm mới mạch chuyện");
            continue;
          }

          // Báo "đang gõ" suốt lúc chờ — câu hỏi nặng mất vài phút, im lặng
          // hoàn toàn thì người hỏi tưởng bot chết.
          stopTyping = tgTyping(job.q_chat, job.q_thread);

          let res = await askClaude(job.q_text, isOwner, sessions[key2]);
          // Phiên cũ đã bị dọn thì nối tiếp sẽ hỏng — thử lại từ đầu thay vì
          // trả lỗi kỹ thuật cho người dùng.
          if (!res.ok && res.resumeFailed) {
            console.log("   ↻ phiên cũ hỏng, hỏi lại từ đầu");
            delete sessions[key2];
            saveSessions();
            res = await askClaude(job.q_text, isOwner, undefined);
          }
          stopTyping();

          if (res.ok && res.sessionId && sessions[key2] !== res.sessionId) {
            sessions[key2] = res.sessionId;
            saveSessions();
          }

          await tgSend(job.q_chat, res.text, job.q_thread);
          await rpc("tg_bridge_complete", {
            p_key: key,
            p_id: job.q_id,
            p_answer: res.ok ? res.text : null,
            p_error: res.ok ? null : res.text.slice(0, 300),
            p_cost: res.costUsd ?? null,
          });
          const cost = res.costUsd != null ? ` · ${Math.round(res.costUsd * 25000).toLocaleString("vi")}đ` : "";
          const secs = res.ms != null ? ` · ${Math.round(res.ms / 1000)}s` : "";
          console.log(`   → ${res.ok ? `đã trả lời${secs}${cost}` : "lỗi: " + res.text.slice(0, 80)}`);
        } catch (jobErr) {
          stopTyping();
          console.error(`   → việc #${job.q_id} hỏng: ${jobErr.message}`);
          // Đóng dấu hỏng để không kẹt 'taken' vĩnh viễn.
          await rpc("tg_bridge_complete", {
            p_key: key,
            p_id: job.q_id,
            p_answer: null,
            p_error: String(jobErr.message).slice(0, 300),
          }).catch(() => {});
        }
      }
    } catch (e) {
      // Mạng chập chờn không được làm chết cầu nối — nghỉ rồi thử lại.
      console.error("Lỗi vòng lặp:", e.message);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
  console.log("Đã dừng.");
}

main().catch((e) => {
  console.error("Không khởi động được:", e.message);
  process.exit(1);
});
