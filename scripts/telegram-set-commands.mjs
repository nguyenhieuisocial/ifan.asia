#!/usr/bin/env node
/**
 * Đăng ký menu lệnh cho bot iFan — gõ "/" trong Telegram là hiện sẵn danh sách.
 *
 * VÌ SAO CẦN: lệnh không có trong menu thì coi như không tồn tại. Người dùng
 * phải nhớ chính xác tên lệnh mới gõ được, mà không ai nhớ — kể cả người viết
 * ra nó. Đây là lý do `/nhatky` và `/chude` sẽ chết yểu nếu chỉ nằm trong /help.
 *
 * HAI PHẠM VI KHÁC NHAU, có chủ đích:
 *   · Mặc định (mọi người): chỉ những lệnh ai dùng cũng được.
 *   · Quản trị viên nhóm: thêm lệnh của chủ dự án.
 * Telegram lọc menu theo phạm vi, nên người thường KHÔNG THẤY lệnh riêng —
 * thấy rồi gõ thử rồi bị từ chối là vừa khó chịu vừa mời người ta dò.
 *
 * CHẠY LẠI ĐƯỢC bao nhiêu lần cũng được (ghi đè), nên cứ chạy sau mỗi lần
 * thêm/bớt lệnh:  node scripts/telegram-set-commands.mjs
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
if (!TOKEN) {
  console.error("Thiếu TELEGRAM_BOT_TOKEN trong .env.local");
  process.exit(1);
}

/** Lệnh ai dùng cũng được. Mô tả ≤ 256 ký tự, viết cho người không rành máy. */
const PUBLIC_COMMANDS = [
  { command: "trangthai", description: "Số liệu thật: tiệm, khách, việc đang chờ" },
  { command: "chude", description: "Chủ đề này hỏi được gì, và có những chủ đề nào" },
  { command: "lienket", description: "Nối Telegram này với tài khoản iFan" },
  { command: "moi", description: "Quên mạch chuyện cũ, hỏi lại từ đầu" },
  { command: "help", description: "Bảng lệnh" },
];

/** Thêm cho chủ dự án / quản trị viên nhóm. */
const ADMIN_COMMANDS = [
  ...PUBLIC_COMMANDS,
  { command: "nhatky", description: "Ai đang dùng bot, có ai lạ nhắn tới không" },
  { command: "phamvi", description: "Đặt phạm vi cho chủ đề đang mở" },
];

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

async function main() {
  // Xoá trước rồi đặt lại: bỏ một lệnh khỏi danh sách mà không xoá thì bản cũ
  // vẫn nằm trong menu, chỉ đường tới một lệnh đã chết.
  await api("deleteMyCommands", { scope: { type: "default" } });
  await api("setMyCommands", {
    commands: PUBLIC_COMMANDS,
    scope: { type: "default" },
  });
  console.log(`Đã đặt ${PUBLIC_COMMANDS.length} lệnh cho mọi người.`);

  if (GROUP) {
    await api("deleteMyCommands", {
      scope: { type: "chat_administrators", chat_id: GROUP },
    });
    await api("setMyCommands", {
      commands: ADMIN_COMMANDS,
      scope: { type: "chat_administrators", chat_id: GROUP },
    });
    console.log(`Đã đặt ${ADMIN_COMMANDS.length} lệnh cho quản trị viên nhóm.`);
  } else {
    console.warn("Không có TELEGRAM_GROUP_ID — bỏ qua menu riêng của quản trị viên.");
  }

  // Đọc lại từ Telegram để xác nhận, thay vì tin là đã đặt xong.
  const back = await api("getMyCommands", { scope: { type: "default" } });
  console.log("Telegram xác nhận:", back.map((c) => "/" + c.command).join(" "));
}

main().catch((e) => {
  console.error("Hỏng:", e.message);
  process.exit(1);
});
