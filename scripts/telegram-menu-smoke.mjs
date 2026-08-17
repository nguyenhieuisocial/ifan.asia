#!/usr/bin/env node
/**
 * Menu lệnh bot Telegram: bảng trong CODE phải khớp bảng Telegram ĐANG DÙNG.
 *
 * VÌ SAO CẦN — khoảng trống tìm ra khi soát bot ngày 17/08:
 * `scripts/quyen-lenh-smoke.mjs` (ADR-0017) kiểm rất kỹ, nhưng nó so **code với
 * code**: bảng chặn quyền ↔ bảng `/help`. Không phép kiểm nào so code với
 * **Telegram thật**. Nghĩa là thêm một lệnh vào code mà quên chạy
 * `telegram-set-commands.mjs` thì menu ngoài đời thiếu lệnh đó — và **không gì
 * báo**. Người dùng gõ "/" không thấy lệnh ⇒ lệnh coi như không tồn tại
 * (chính lý do `telegram-set-commands.mjs` được viết ra).
 *
 * Đúng họ bệnh đã trả giá bốn lần trong một tuần: **cổng kiểm nội bộ xanh mà
 * thực tế bên ngoài lệch** (`check-ds.mjs` không tồn tại · ADR-0003 trỏ script
 * chưa từng có · việc #117 khai "đã bật khoá AI" trong khi máy chủ không có ·
 * bất biến 5 trỏ công cụ chưa từng viết). Lần này bảng menu ĐANG khớp — nên đây
 * là phép kiểm dựng lúc còn xanh, để lần lệch đầu tiên có người biết.
 *
 * NGUỒN Ý ĐỊNH DUY NHẤT là `scripts/telegram-set-commands.mjs` (luật D1) —
 * file này ĐỌC hai danh sách từ đó, không chép lại tên lệnh.
 *
 * Thiếu `TELEGRAM_BOT_TOKEN` ⇒ bỏ qua CÓ BÁO, không làm đỏ CI: token là bí mật
 * chỉ có ở máy founder và trên máy chủ.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const GOC = path.resolve(import.meta.dirname, "..");

function napEnv() {
  if (process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* CI không có .env.local */
  }
}
napEnv();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP = process.env.TELEGRAM_GROUP_ID;
if (!TOKEN) {
  console.log(
    "[telegram-menu] BỎ QUA — không có TELEGRAM_BOT_TOKEN. " +
      "Phép kiểm này cần token thật để hỏi Telegram; chạy nó trên máy có .env.local.",
  );
  process.exit(0);
}

/**
 * Đọc hai danh sách lệnh từ chính file đăng ký. Bám vào tên hằng số
 * (`PUBLIC_COMMANDS` / `ADMIN_COMMANDS`) chứ không bám thứ tự dòng, để đổi cách
 * trình bày ở đó không làm phép kiểm này gãy oan.
 */
function docYDinh() {
  const src = readFileSync(path.join(GOC, "scripts", "telegram-set-commands.mjs"), "utf8");
  const layKhoi = (ten) => {
    const i = src.indexOf(`const ${ten}`);
    if (i < 0) throw new Error(`Không tìm thấy ${ten} trong telegram-set-commands.mjs`);
    const j = src.indexOf("];", i);
    return src.slice(i, j);
  };
  const nhat = (khoi) => [...khoi.matchAll(/command:\s*["'`]([a-z_]+)["'`]/g)].map((m) => m[1]);
  const congKhai = nhat(layKhoi("PUBLIC_COMMANDS"));
  const khoiAdmin = layKhoi("ADMIN_COMMANDS");
  // ADMIN_COMMANDS mở đầu bằng `...PUBLIC_COMMANDS` nên hợp cả hai.
  const admin = [...new Set([...(khoiAdmin.includes("...PUBLIC_COMMANDS") ? congKhai : []), ...nhat(khoiAdmin)])];
  if (congKhai.length === 0 || admin.length === 0) {
    throw new Error("Đọc được 0 lệnh — cách viết trong telegram-set-commands.mjs đã đổi, sửa phép kiểm này.");
  }
  return { congKhai, admin };
}

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return r.json();
}

let hong = 0;
let n = 0;
const check = (ten, dat, chiTiet = "") => {
  n += 1;
  if (!dat) hong += 1;
  console.log(`  ${dat ? "PASS" : "FAIL"} ${n}: ${ten}${dat ? "" : ` — ${chiTiet}`}`);
};

const yDinh = docYDinh();
console.log(
  `[telegram-menu] Ý định trong code: ${yDinh.congKhai.length} lệnh công khai, ` +
    `${yDinh.admin.length} lệnh cho quản trị viên.`,
);

// ① Bot còn sống và token còn dùng được.
const me = await tg("getMe");
check("token còn dùng được, bot còn sống", me.ok === true, JSON.stringify(me).slice(0, 120));
if (me.ok) console.log(`         bot: @${me.result.username}`);

// ② Menu công khai khớp ý định.
const mkCongKhai = await tg("getMyCommands");
const dsCongKhai = mkCongKhai.ok ? mkCongKhai.result.map((c) => c.command) : [];
const thieuCongKhai = yDinh.congKhai.filter((c) => !dsCongKhai.includes(c));
const laCongKhai = dsCongKhai.filter((c) => !yDinh.congKhai.includes(c));
check(
  "menu công khai KHÔNG thiếu lệnh nào so với code",
  thieuCongKhai.length === 0,
  `thiếu: ${thieuCongKhai.map((x) => "/" + x).join(" ")} → chạy: node scripts/telegram-set-commands.mjs`,
);
check(
  "menu công khai KHÔNG có lệnh lạ (đã gỡ khỏi code mà còn trên Telegram)",
  laCongKhai.length === 0,
  `lạ: ${laCongKhai.map((x) => "/" + x).join(" ")}`,
);

// ③ Menu quản trị viên — chỉ kiểm được khi biết mã nhóm.
if (!GROUP) {
  console.log("  BỎ QUA menu quản trị viên: thiếu TELEGRAM_GROUP_ID.");
} else {
  const mkAdmin = await tg("getMyCommands", {
    scope: { type: "chat_administrators", chat_id: GROUP },
  });
  const dsAdmin = mkAdmin.ok ? mkAdmin.result.map((c) => c.command) : [];
  const thieuAdmin = yDinh.admin.filter((c) => !dsAdmin.includes(c));
  check(
    "menu quản trị viên có ĐỦ lệnh riêng của chủ dự án",
    thieuAdmin.length === 0,
    `thiếu: ${thieuAdmin.map((x) => "/" + x).join(" ")} → chạy: node scripts/telegram-set-commands.mjs`,
  );
  // Lệnh riêng KHÔNG được lọt xuống menu của mọi người: thấy rồi gõ rồi bị từ
  // chối là vừa khó chịu vừa mời người ta dò (ý định ghi ở telegram-set-commands).
  const rieng = yDinh.admin.filter((c) => !yDinh.congKhai.includes(c));
  const loLot = rieng.filter((c) => dsCongKhai.includes(c));
  check(
    "lệnh riêng của chủ dự án KHÔNG lọt vào menu công khai",
    loLot.length === 0,
    `lọt: ${loLot.map((x) => "/" + x).join(" ")}`,
  );
}

// ④ Webhook còn trỏ đúng và không tồn tin — bot không nghe được thì menu đúng
//    cũng vô nghĩa. Đây là phép kiểm rẻ nhất mà chưa ai làm tự động.
const wh = await tg("getWebhookInfo");
if (wh.ok) {
  check("webhook đã đặt (bot nghe được tin)", Boolean(wh.result.url), "url trống");
  check(
    "không có tin nào tồn đọng chưa xử lý",
    (wh.result.pending_update_count ?? 0) < 20,
    `đang tồn ${wh.result.pending_update_count} tin — webhook có thể đang lỗi`,
  );
  check(
    "Telegram không báo lỗi gửi tới webhook",
    !wh.result.last_error_message,
    `${wh.result.last_error_message} (${
      wh.result.last_error_date ? new Date(wh.result.last_error_date * 1000).toISOString() : "?"
    })`,
  );
} else {
  check("đọc được thông tin webhook", false, JSON.stringify(wh).slice(0, 120));
}

console.log(
  hong === 0
    ? `[telegram-menu] TẤT CẢ PASS (${n} ca).`
    : `[telegram-menu] ${hong}/${n} ca FAIL.`,
);
process.exit(hong === 0 ? 0 : 1);
