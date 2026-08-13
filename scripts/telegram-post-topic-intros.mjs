#!/usr/bin/env node
/**
 * Đăng bản giới thiệu vào TỪNG chủ đề của nhóm iFan, rồi ghim lại.
 *
 * Founder 13/08: *"Hoạch định và giới thiệu rõ các chủ đề sẽ có những chức
 * năng gì (/), tự động gửi những gì, và được trả lời những gì."*
 *
 * VÌ SAO ĐĂNG VÀO TỪNG CHỦ ĐỀ chứ không viết một tài liệu: nội quy nằm ngoài
 * chỗ người ta đang đứng thì không ai đọc. Người mở chủ đề "Lỗi" cần biết
 * NGAY TẠI ĐÓ là chỗ này để báo hỏng, hỏi giá thì sang chỗ khác.
 *
 * NGUỒN SỐ LIỆU: phạm vi và luồng tin tự động đọc THẲNG từ cơ sở dữ liệu
 * (bảng tg_topics) — cùng một nguồn bot dùng để chặn câu lạc đề. Nếu chép tay
 * vào đây thì sớm muộn bản ghim nói một đằng, bot xử một nẻo (luật D1).
 *
 * Ghim KHÔNG báo động (disable_notification) — đây là việc dọn nhà, không phải
 * tin cần đánh thức ai.
 *
 * CHẠY LẠI ĐƯỢC: mỗi lần chạy đăng bản mới và ghim đè. Chạy sau mỗi lần đổi
 * phạm vi bằng /phamvi.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

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
const TOKEN = env.TELEGRAM_BOT_TOKEN;
const GROUP = env.TELEGRAM_GROUP_ID;
const SB_URL = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const SB_ANON = env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SB_ADMIN = env.SUPABASE_ACCESS_TOKEN;
const SB_REF = env.SUPABASE_PROJECT_REF;

if (!TOKEN || !GROUP || !SB_URL || !SB_ANON || !SB_ADMIN || !SB_REF) {
  console.error("Thiếu cấu hình trong .env.local");
  process.exit(1);
}

/** Nhãn tiếng Việt cho luồng tin tự động — khớp FEED_LABELS ở webhook. */
const FEED_LABELS = {
  help_request: 'yêu cầu "Cần giúp?" từ chủ tiệm',
  tenant_signup: "tiệm mới đăng ký",
  system_alert: "việc chạy nền hỏng (máy tự khai)",
  user_failure: "việc hỏng ảnh hưởng người dùng: tin khách xử lý hỏng, thông báo không gửi được",
  release: "bản mới đã lên",
  daily_pulse: "bản tin cuối ngày (chỉ gửi khi hôm đó có chuyện)",
  feature_change: "mảng nào vừa đổi trạng thái (sắp tới → đang xây → dùng được)",
  billing: "mốc gói cước của tiệm: sắp hết dùng thử, quá hạn, tạm ngưng, đã thanh toán",
  churn: "tiệm ngừng dùng",
  channel_down: "kênh kết nối của tiệm hỏng — tin khách không về nữa",
  weekly_pulse: "bản tin sáng thứ Hai, có so với tuần trước",
};

/**
 * Vì sao chủ đề này KHÔNG nhận tin máy — nói rõ thay vì để "Không có" cụt lủn.
 * "Không có" đọc như thiếu sót; đây là quyết định có lý do.
 */
const NO_FEED_REASON = {
  1: "Không có, và cố ý — General là chỗ hỏi khi chưa biết vào đâu. Nhét tin máy vào đây là chặn đúng người mới.",
  6: "Không có, và cố ý — ý tưởng đến từ người, không từ máy. Tin máy chen vào là chìm mất ý đang bàn.",
  7: "Không có, và cố ý — đây là chỗ người hỏi người. Số liệu thì gõ /trangthai.",
};

/** Lệnh ai cũng dùng được, mô tả ngắn cho người không rành máy. */
const CMD_CHUNG = [
  "/chude — chủ đề này hỏi được gì",
  "/trangthai — số liệu thật của iFan",
  "/lienket — nối Telegram với tài khoản iFan",
  "/moi — quên mạch chuyện cũ",
  "/help — bảng lệnh",
];
const CMD_CHU = ["/nhatky — ai đang dùng bot", "/phamvi <mô tả> — đặt phạm vi cho chủ đề này"];

async function api(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description ?? "lỗi lạ"}`);
  return json.result;
}

/** Gọi Telegram nhưng KHÔNG chết nếu hỏng — dùng cho việc phụ (xoá, ghim). */
async function apiSoft(method, body) {
  try {
    return await api(method, body);
  } catch (e) {
    console.warn(`   ⚠ ${method} bỏ qua: ${e.message}`);
    return null;
  }
}

let INGEST_KEY = null;

async function ingestKey() {
  if (INGEST_KEY) return INGEST_KEY;
  const kr = await fetch(`https://api.supabase.com/v1/projects/${SB_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SB_ADMIN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "select value from private.app_config where key='bot_ingest_key'" }),
  });
  INGEST_KEY = (await kr.json())[0].value;
  return INGEST_KEY;
}

async function rpc(fn, args) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const body = await res.text();
  return body ? JSON.parse(body) : null;
}

async function fetchTopics() {
  return rpc("tg_topics_list", { p_key: await ingestKey(), p_chat: GROUP });
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const link = (threadId) => `https://t.me/c/${String(GROUP).replace(/^-100/, "")}/${threadId}`;

function buildIntro(topic, all) {
  const lines = [`<b>📌 ${esc(topic.name)} — chủ đề này dùng để làm gì</b>`, ""];

  lines.push(topic.scope ? esc(topic.scope) : "Chưa đặt phạm vi — hỏi gì cũng được.");

  const feeds = topic.feeds ?? [];
  lines.push("", "<b>Tin tự động về đây</b>");
  lines.push(
    feeds.length
      ? feeds.map((f) => "· " + esc(FEED_LABELS[f] ?? f)).join("\n")
      : "· " +
        esc(
          NO_FEED_REASON[topic.thread_id] ??
            "Không có — chủ đề này chỉ để người trao đổi.",
        ),
  );

  lines.push("", "<b>Bot trả lời gì ở đây</b>");
  lines.push(
    topic.scope
      ? "· Đúng phạm vi trên → trả lời bình thường.\n" +
          "· Lạc phạm vi → bot chỉ sang chủ đề đúng, kèm đường bấm thẳng qua đó."
      : "· Hỏi gì cũng trả lời, và gợi ý chủ đề đúng hơn nếu có.",
  );
  lines.push(
    "· Người ngoài đội chỉ nhận được thông tin công khai (tính năng, gói miễn phí).",
  );

  lines.push("", "<b>Lệnh dùng được</b>");
  lines.push(CMD_CHUNG.map((c) => "· " + esc(c)).join("\n"));
  lines.push("<i>Chủ dự án thêm: " + esc(CMD_CHU.join(" · ")) + "</i>");

  const others = all.filter((t) => t.thread_id !== topic.thread_id);
  if (others.length) {
    lines.push("", "<b>Các chủ đề khác</b>");
    lines.push(
      others.map((t) => `· <a href="${link(t.thread_id)}">${esc(t.name)}</a>`).join("\n"),
    );
  }
  return lines.join("\n");
}

async function main() {
  const topics = await fetchTopics();
  if (!topics.length) {
    console.error("Không đọc được chủ đề nào — dừng, không đăng gì.");
    process.exit(1);
  }

  const key = await ingestKey();

  for (const t of topics) {
    // Xoá bản giới thiệu cũ TRƯỚC — nếu không, mỗi lần chạy lại đẻ thêm một
    // bản ghim và chủ đề đầy tin trùng. Xoá hỏng (quá 48 giờ, đã bị xoá tay)
    // thì bỏ qua, không được vì thế mà không đăng bản mới.
    if (t.intro_message_id) {
      await apiSoft("deleteMessage", { chat_id: GROUP, message_id: t.intro_message_id });
    }

    /**
     * General (chủ đề mặc định) KHÔNG nhận `message_thread_id` — nó không phải
     * chủ đề do ai tạo. Gửi kèm mã là Telegram trả lỗi "message thread not
     * found" và bản giới thiệu ở đúng chỗ dễ lạc nhất lại thiếu.
     */
    const sent = await api("sendMessage", {
      chat_id: GROUP,
      ...(t.thread_id > 1 ? { message_thread_id: t.thread_id } : {}),
      text: buildIntro(t, topics),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: true,
    });

    // Ghim để người mới mở chủ đề là thấy ngay, không phải cuộn lên tìm.
    // Thiếu quyền ghim thì vẫn coi như xong phần đăng — không bỏ dở cả lượt.
    const pinned = await apiSoft("pinChatMessage", {
      chat_id: GROUP,
      message_id: sent.message_id,
      disable_notification: true,
    });

    // Nhớ lại để lần sau xoá đúng bản này.
    await rpc("tg_topic_set_intro", {
      p_key: key,
      p_chat: GROUP,
      p_thread: t.thread_id,
      p_message_id: sent.message_id,
    });

    console.log(
      `✓ ${t.name} (thread ${t.thread_id}) — đã đăng${pinned ? " và ghim" : " (CHƯA ghim được)"}`,
    );
  }
}

main().catch((e) => {
  console.error("Hỏng:", e.message);
  process.exit(1);
});
