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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Nghỉ giữa hai lượt hỏi hàng đợi khi không có việc. */
const IDLE_POLL_MS = 3_000;
/** Trần thời gian cho MỘT câu hỏi — treo lâu hơn thì bỏ, không chặn hàng đợi. */
const CLAUDE_TIMEOUT_MS = 180_000;
/** Trần một tin Telegram; dài hơn thì cắt thành nhiều tin. */
const TG_CHUNK = 3_800;

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
  return res.json();
}

async function tgSend(chatId, text, threadId) {
  // Telegram chặn tin quá dài — cắt khúc thay vì để API trả lỗi rồi mất câu trả lời.
  for (let i = 0; i < text.length; i += TG_CHUNK) {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(i, i + TG_CHUNK),
        ...(threadId ? { message_thread_id: threadId } : {}),
      }),
    });
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
function resolveClaudeBin() {
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN)) {
    return process.env.CLAUDE_BIN;
  }
  const base = join(process.env.APPDATA ?? "", "Claude", "claude-code");
  if (existsSync(base)) {
    const versions = readdirSync(base)
      .filter((d) => existsSync(join(base, d, "claude.exe")))
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      );
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
  "Không dùng bảng biểu markdown (Telegram không hiển thị được).",
];

const HINT_OWNER = [
  ...HINT_COMMON,
  "Người hỏi là CHỦ DỰ ÁN — được phép yêu cầu bạn sửa file trong dự án.",
  "Sửa xong thì báo rõ đã đụng file nào. Không tự đẩy code lên nếu không được bảo.",
].join(" ");

const HINT_GUEST = [
  ...HINT_COMMON,
  "Người hỏi là THÀNH VIÊN THƯỜNG — chỉ trả lời câu hỏi, TUYỆT ĐỐI không sửa file,",
  "không chạy lệnh, không đổi cấu hình. Ai nhờ sửa thì trả lời: việc sửa đổi cần",
  "chủ dự án nhắn trực tiếp cho bot.",
].join(" ");

/**
 * Công cụ CẤM với người thường. Đây là hàng rào THẬT ở tầng công cụ, không
 * phải lời dặn trong câu lệnh — lời dặn thì nói khéo là lách được, còn chặn
 * ở đây thì Claude không có cách nào ghi/chạy gì.
 */
const GUEST_BLOCKED_TOOLS = "Write,Edit,NotebookEdit,Bash,WebFetch";

/** Gọi Claude Code chế độ tự động. Trả về {ok, text}. */
function askClaude(question, isOwner) {
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

    const args = [
      "-p",
      question,
      "--append-system-prompt",
      isOwner ? HINT_OWNER : HINT_GUEST,
    ];
    if (isOwner) {
      // Chủ dự án: cho sửa file thẳng (headless không hỏi duyệt được, không
      // bật cờ này thì mọi yêu cầu sửa đều treo rồi hết giờ).
      args.push("--permission-mode", "acceptEdits");
    } else {
      args.push("--disallowedTools", GUEST_BLOCKED_TOOLS);
    }
    // shell: false (mặc định) — xem ghi chú ở resolveClaudeBin().
    const child = spawn(CLAUDE_BIN, args, { cwd: PROJECT_DIR, env: childEnv });

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, text: "Câu hỏi xử lý quá lâu (quá 3 phút), đã dừng." });
    }, CLAUDE_TIMEOUT_MS);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, text: `Không chạy được Claude Code: ${e.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = out.trim();
      if (code === 0 && text) return resolve({ ok: true, text });
      const detail = (err || out).trim().slice(0, 300);
      resolve({
        ok: false,
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

async function main() {
  // Dừng ngay với lời nhắn rõ ràng, thay vì chạy rồi mọi câu hỏi đều lỗi.
  if (!CLAUDE_BIN) {
    console.error(
      "Không tìm thấy Claude Code trên máy.\n" +
        "Nếu cài ở chỗ khác, đặt biến CLAUDE_BIN trỏ tới file claude.exe rồi chạy lại.",
    );
    process.exit(1);
  }
  console.log(`Dùng Claude Code: ${CLAUDE_BIN}`);
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
        const isOwner = OWNER_IDS.has(String(job.q_user));
        console.log(
          `[${new Date().toLocaleTimeString()}] ${isOwner ? "CHỦ DỰ ÁN" : "thành viên"} (${job.q_user}) hỏi: ${job.q_text.slice(0, 50)}`,
        );
        const res = await askClaude(job.q_text, isOwner);
        await tgSend(job.q_chat, res.text, job.q_thread);
        await rpc("tg_bridge_complete", {
          p_key: key,
          p_id: job.q_id,
          p_answer: res.ok ? res.text : null,
          p_error: res.ok ? null : res.text.slice(0, 300),
        });
        console.log(`   → ${res.ok ? "đã trả lời" : "lỗi: " + res.text.slice(0, 80)}`);
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
