#!/usr/bin/env node
/**
 * Kiểm trạng thái mở/đóng của mặt tiền công khai (lib/storefront/hours.ts).
 *
 * VÌ SAO CÓ FILE NÀY — một lỗi thật đã lọt qua cả tsc lẫn eslint (12/08/2026):
 * trang mặt tiền báo "mở lại 08:00 sáng 11/8" trong khi hôm đó là 12/8, tức
 * hẹn khách quay lại vào NGÀY HÔM QUA. Nguyên nhân: hàm cộng ngày đọc chuỗi
 * ngày theo giờ ĐỊA PHƯƠNG rồi xuất ra theo giờ QUỐC TẾ — ở VN (UTC+7) phép
 * "cộng 0 ngày" cũng lùi mất một ngày. Chú thích trong file khi đó còn khẳng
 * định là "an toàn với mọi múi giờ" — khẳng định suông, không có gì kiểm.
 *
 * Vì đây là hàm THUẦN (chỉ nhận dữ liệu vào, trả kết quả ra, không đọc đồng hồ
 * máy), nó kiểm được rẻ và chắc. Chạy lại trên 4 múi giờ vì đúng loại lỗi này
 * chỉ hiện ở múi giờ lệch UTC — chạy mỗi UTC là xanh giả.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeStorefrontStatus } from "../lib/storefront/hours.ts";

const TIMEZONES = ["Asia/Ho_Chi_Minh", "UTC", "America/Los_Angeles", "Pacific/Kiritimati"];

// Chạy lại chính mình dưới từng múi giờ (tiến trình con), rồi tổng kết.
if (!process.env.IFAN_TZ_CHILD) {
  let failed = 0;
  for (const tz of TIMEZONES) {
    process.stdout.write(`\n[storefront-hours] === TZ=${tz} ===\n`);
    try {
      // BUG THẬT bắt được 14/08 qua CI Linux (không hiện trên Windows): URL
      // POSIX không có ổ đĩa, nên `.pathname.slice(1)` cắt mất dấu `/` đầu và
      // biến đường dẫn TUYỆT ĐỐI thành TƯƠNG ĐỐI — Node ghép thêm cwd vào,
      // ra đường dẫn nhân đôi, lỗi MODULE_NOT_FOUND. fileURLToPath là hàm
      // chuẩn xử lý đúng cả Windows lẫn Linux (đã chạy thật, xanh, trên CI ở
      // rate-limit-smoke.mjs cùng ngày) — dùng lại, không tự chế nữa.
      execFileSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], {
        env: { ...process.env, TZ: tz, IFAN_TZ_CHILD: "1" },
        stdio: "inherit",
      });
    } catch {
      failed++;
    }
  }
  if (failed) {
    console.error(`\n[storefront-hours] FAIL ở ${failed}/${TIMEZONES.length} múi giờ`);
    process.exit(1);
  }
  console.log(`\n[storefront-hours] TẤT CẢ PASS trên ${TIMEZONES.length} múi giờ`);
  process.exit(0);
}

let failed = 0;
let n = 0;
const check = (name, got, want) => {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"} ${n} ${name}`);
  if (!ok) {
    console.log(`       nhận: ${JSON.stringify(got)}`);
    console.log(`       cần : ${JSON.stringify(want)}`);
    failed++;
  }
};

// 12/08/2026 là thứ TƯ → dow = 3 (0=CN theo extract(dow) của Postgres).
const WED = "2026-08-12";
const dow = 3;
/** Giờ mở cửa: T2–T7 8:00–12:00 và 13:00–21:00, CN nghỉ. */
const HOURS = [
  { weekday: 0, is_closed: true, open_time: null, close_time: null },
  ...[1, 2, 3, 4, 5, 6].flatMap((w) => [
    { weekday: w, is_closed: false, open_time: "08:00", close_time: "12:00" },
    { weekday: w, is_closed: false, open_time: "13:00", close_time: "21:00" },
  ]),
];

// --- Đang mở ---
check(
  "trong khung sáng → đang mở, đóng lúc 12:00",
  computeStorefrontStatus({ now: `${WED}T09:30:00`, todayWeekday: dow, hours: HOURS, closures: [] }),
  { kind: "open", closesAtLabel: "12:00" },
);
check(
  "trong khung chiều → đang mở, đóng lúc 21:00",
  computeStorefrontStatus({ now: `${WED}T15:00:00`, todayWeekday: dow, hours: HOURS, closures: [] }),
  { kind: "open", closesAtLabel: "21:00" },
);

// --- Nghỉ trưa: đóng nhưng mở lại NGAY HÔM NAY (lý do bảng cho nhiều khung/ngày) ---
check(
  "giờ nghỉ trưa → đã đóng, mở lại 13:00 chiều NAY",
  computeStorefrontStatus({ now: `${WED}T12:30:00`, todayWeekday: dow, hours: HOURS, closures: [] }),
  { kind: "closed", reopensLabel: "13:00 chiều nay" },
);

// --- ĐÂY LÀ CA BẮT ĐƯỢC LỖI THẬT: sau giờ đóng → phải là NGÀY MAI (13/8), không phải hôm qua ---
check(
  "sau 21:00 → mở lại 08:00 sáng MAI (không được lùi về hôm qua)",
  computeStorefrontStatus({ now: `${WED}T22:26:00`, todayWeekday: dow, hours: HOURS, closures: [] }),
  { kind: "closed", reopensLabel: "08:00 sáng mai" },
);
check(
  "trước giờ mở (6 giờ sáng) → mở lại 08:00 sáng NAY",
  computeStorefrontStatus({ now: `${WED}T06:00:00`, todayWeekday: dow, hours: HOURS, closures: [] }),
  { kind: "closed", reopensLabel: "08:00 sáng nay" },
);

// --- Thứ Bảy tối → hôm sau là CN (nghỉ) → phải nhảy sang thứ Hai ---
check(
  "T7 tối → bỏ qua CN nghỉ, mở lại sáng T2 (17/8)",
  computeStorefrontStatus({ now: `2026-08-15T22:00:00`, todayWeekday: 6, hours: HOURS, closures: [] }),
  { kind: "closed", reopensLabel: "08:00 sáng 17/8" },
);

// --- Bug thật #94 (13/08): bản tiếng Anh từng ghép thẳng chữ Việt "sáng nay"
// vào giữa câu Anh ("reopens 08:00 sáng nay") — 4 ca trên lặp lại với
// locale: "en", câu chữ phải THUẦN TIẾNG ANH không lẫn tiếng Việt. ---
check(
  "[en] giờ nghỉ trưa → đã đóng, mở lại chiều NAY",
  computeStorefrontStatus({ now: `${WED}T12:30:00`, todayWeekday: dow, hours: HOURS, closures: [], locale: "en" }),
  { kind: "closed", reopensLabel: "this afternoon at 13:00" },
);
check(
  "[en] sau 21:00 → mở lại sáng MAI (không lẫn chữ Việt)",
  computeStorefrontStatus({ now: `${WED}T22:26:00`, todayWeekday: dow, hours: HOURS, closures: [], locale: "en" }),
  { kind: "closed", reopensLabel: "tomorrow morning at 08:00" },
);
check(
  "[en] trước giờ mở (6 giờ sáng) → mở lại sáng NAY",
  computeStorefrontStatus({ now: `${WED}T06:00:00`, todayWeekday: dow, hours: HOURS, closures: [], locale: "en" }),
  { kind: "closed", reopensLabel: "this morning at 08:00" },
);
check(
  "[en] T7 tối → bỏ qua CN nghỉ, mở lại đúng ngày 17/8 (không phải chữ 'T2')",
  computeStorefrontStatus({ now: `2026-08-15T22:00:00`, todayWeekday: 6, hours: HOURS, closures: [], locale: "en" }),
  { kind: "closed", reopensLabel: "17/8 at 08:00" },
);

// --- Ngày nghỉ đè lên giờ thường ---
check(
  "đang trong đợt nghỉ Tết → hiện LÝ DO + ngày mở lại",
  computeStorefrontStatus({
    now: `${WED}T09:00:00`,
    todayWeekday: dow,
    hours: HOURS,
    closures: [
      { date_from: "2026-08-10", date_to: "2026-08-14", reason: "Nghỉ Tết", is_full_day: true, open_time: null, close_time: null },
    ],
  }),
  { kind: "closure", reason: "Nghỉ Tết", reopensLabel: "15/8" },
);
check(
  "ngày nghỉ đổi giờ (chỉ mở 8–12) và đang trong khung đó → vẫn mở",
  computeStorefrontStatus({
    now: `${WED}T09:00:00`,
    todayWeekday: dow,
    hours: HOURS,
    closures: [
      { date_from: WED, date_to: WED, reason: "Cúp điện", is_full_day: false, open_time: "08:00", close_time: "12:00" },
    ],
  }),
  { kind: "open", closesAtLabel: "12:00" },
);

// --- Chưa đặt giờ nào → ẩn hẳn khối giờ, KHÔNG suy diễn "đã đóng cửa" ---
check(
  "chưa đặt giờ nào → no_hours (không được nói 'đã đóng cửa')",
  computeStorefrontStatus({ now: `${WED}T09:00:00`, todayWeekday: dow, hours: [], closures: [] }),
  { kind: "no_hours" },
);

// --- Cả tuần đều nghỉ → đóng, và KHÔNG bịa ra ngày mở lại ---
check(
  "cả tuần đều nghỉ → đóng, không có ngày mở lại",
  computeStorefrontStatus({
    now: `${WED}T09:00:00`,
    todayWeekday: dow,
    hours: [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, is_closed: true, open_time: null, close_time: null })),
    closures: [],
  }),
  { kind: "closed", reopensLabel: null },
);

if (failed) {
  console.error(`  → ${failed}/${n} FAIL`);
  process.exit(1);
}
console.log(`  → ${n}/${n} PASS`);
