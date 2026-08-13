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
import { readFileSync } from "node:fs";
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

const SYSTEM_HINT = [
  "Bạn đang trả lời qua Telegram cho đội ngũ nội bộ iFan.asia.",
  "Trả lời NGẮN GỌN bằng tiếng Việt, tối đa vài đoạn — người đọc đang dùng điện thoại.",
  "Không dùng bảng biểu markdown (Telegram không hiển thị được).",
  "Nếu câu hỏi cần sửa code, hãy nói rõ nên sửa gì ở đâu thay vì tự sửa.",
].join(" ");

/** Gọi Claude Code chế độ tự động. Trả về {ok, text}. */
function askClaude(question) {
  return new Promise((resolve) => {
    // Xoá 2 biến gây lỗi xác thực: có ANTHROPIC_API_KEY thì Claude Code dùng
    // khoá tính tiền theo lượt thay vì gói thuê bao; ANTHROPIC_AUTH_TOKEN trên
    // máy này đang mang giá trị rác nên phải bỏ luôn.
    const childEnv = { ...process.env };
    delete childEnv.ANTHROPIC_API_KEY;
    delete childEnv.ANTHROPIC_AUTH_TOKEN;

    const child = spawn(
      "claude",
      ["-p", question, "--append-system-prompt", SYSTEM_HINT],
      { cwd: PROJECT_DIR, env: childEnv, shell: true },
    );

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
        console.log(`[${new Date().toLocaleTimeString()}] hỏi: ${job.q_text.slice(0, 60)}`);
        const res = await askClaude(job.q_text);
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
