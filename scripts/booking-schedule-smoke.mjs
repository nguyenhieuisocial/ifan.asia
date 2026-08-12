#!/usr/bin/env node
/**
 * Kiểm hàm tính giờ trống/bận cho màn Lịch (`lib/booking/schedule.ts`).
 *
 * VÌ SAO — nợ ADR-0009 mục 8: dự án đã dính đúng một lỗi kiểu này (mặt tiền
 * hẹn khách quay lại NGÀY HÔM QUA vì trộn giờ địa phương với `toISOString()`).
 * Vì hàm ở đây THUẦN, chạy lại trên 4 múi giờ để bắt lỗi chỉ hiện khi múi giờ
 * MÁY CHẠY CODE lệch UTC — chạy mỗi UTC (CI mặc định) sẽ xanh giả.
 *
 * Giá trị đối chiếu KHÔNG lấy từ chính hàm đang kiểm — tính độc lập bằng
 * Python stdlib `datetime` (runtime khác hẳn Node/Intl mà code dùng), input
 * cố định `2026-08-13T18:30:00Z`:
 *   Asia/Ho_Chi_Minh -> 2026-08-14 01:30, dateKey 2026-08-14, phút 90,  weekday 5 (T6)
 *   UTC              -> 2026-08-13 18:30, dateKey 2026-08-13, phút 1110, weekday 4 (T5)
 *   America/Los_Angeles -> 2026-08-13 11:30, dateKey 2026-08-13, phút 690, weekday 4 (T5)
 *   Pacific/Kiritimati  -> 2026-08-14 08:30, dateKey 2026-08-14, phút 510, weekday 5 (T6)
 */
import { execFileSync } from "node:child_process";
import {
  addDaysToDateKey,
  candidateSlotStarts,
  computeFreeBlocks,
  computeOpenRanges,
  dateKeyInTimeZone,
  formatMinuteLabel,
  minutesOfDayInTimeZone,
  startOfWeekKey,
  weekdayInTimeZone,
  weekdayOfDateKey,
} from "../lib/booking/schedule.ts";

const TIMEZONES = ["Asia/Ho_Chi_Minh", "UTC", "America/Los_Angeles", "Pacific/Kiritimati"];
const FIXED_TS = "2026-08-13T18:30:00Z";
const ORACLE = {
  "Asia/Ho_Chi_Minh": { dateKey: "2026-08-14", minutes: 90, weekday: 5 },
  UTC: { dateKey: "2026-08-13", minutes: 1110, weekday: 4 },
  "America/Los_Angeles": { dateKey: "2026-08-13", minutes: 690, weekday: 4 },
  "Pacific/Kiritimati": { dateKey: "2026-08-14", minutes: 510, weekday: 5 },
};

if (!process.env.IFAN_TZ_CHILD) {
  let failed = 0;
  for (const tz of TIMEZONES) {
    process.stdout.write(`\n[booking-schedule] === TZ=${tz} ===\n`);
    try {
      execFileSync(
        process.execPath,
        ["--experimental-strip-types", new URL(import.meta.url).pathname.slice(1)],
        { env: { ...process.env, TZ: tz, IFAN_TZ_CHILD: "1" }, stdio: "inherit" },
      );
    } catch {
      failed++;
    }
  }
  if (failed) {
    console.error(`\n[booking-schedule] FAIL ở ${failed}/${TIMEZONES.length} múi giờ`);
    process.exit(1);
  }
  console.log(`\n[booking-schedule] TẤT CẢ PASS trên ${TIMEZONES.length} múi giờ`);
  process.exit(0);
}

// ---- Chạy dưới một múi giờ máy cụ thể (process.env.TZ) ----
const machineTz = process.env.TZ;
let pass = 0;
let fail = 0;
function ca(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} — ${detail ?? ""}`);
  }
}

// --- Nhóm 1: đổi múi giờ (phần dễ sai nhất — timeZone THAM SỐ, không phải TZ máy) ---
for (const tz of TIMEZONES) {
  const exp = ORACLE[tz];
  ca(
    `dateKeyInTimeZone(${tz}) [máy chạy dưới TZ=${machineTz}]`,
    dateKeyInTimeZone(FIXED_TS, tz) === exp.dateKey,
    `được ${dateKeyInTimeZone(FIXED_TS, tz)}, cần ${exp.dateKey}`,
  );
  ca(
    `minutesOfDayInTimeZone(${tz})`,
    minutesOfDayInTimeZone(FIXED_TS, tz) === exp.minutes,
    `được ${minutesOfDayInTimeZone(FIXED_TS, tz)}, cần ${exp.minutes}`,
  );
  ca(
    `weekdayInTimeZone(${tz})`,
    weekdayInTimeZone(FIXED_TS, tz) === exp.weekday,
    `được ${weekdayInTimeZone(FIXED_TS, tz)}, cần ${exp.weekday}`,
  );
}

// --- Nhóm 2: computeOpenRanges (thuần, không đụng timezone — chỉ chạy 1 lần cũng đủ, nhưng chạy lại 4 lần vô hại) ---
{
  const oneRange = computeOpenRanges([{ is_closed: false, open_time: "08:00", close_time: "20:00" }], null);
  ca("giờ thường 1 dải", oneRange.length === 1 && oneRange[0].startMin === 480 && oneRange[0].endMin === 1200);

  const lunch = computeOpenRanges(
    [
      { is_closed: false, open_time: "08:00", close_time: "12:00" },
      { is_closed: false, open_time: "13:30", close_time: "20:00" },
    ],
    null,
  );
  ca("hai dải (nghỉ trưa)", lunch.length === 2 && lunch[0].endMin === 720 && lunch[1].startMin === 810);

  const closedDay = computeOpenRanges([{ is_closed: true, open_time: null, close_time: null }], null);
  ca("is_closed -> 0 dải", closedDay.length === 0);

  const fullDayOff = computeOpenRanges(
    [{ is_closed: false, open_time: "08:00", close_time: "20:00" }],
    { is_full_day: true, open_time: null, close_time: null },
  );
  ca("ngày nghỉ cả ngày ĐÈ giờ thường -> 0 dải", fullDayOff.length === 0);

  const partialOff = computeOpenRanges(
    [{ is_closed: false, open_time: "08:00", close_time: "20:00" }],
    { is_full_day: false, open_time: "09:00", close_time: "12:00" },
  );
  ca(
    "ngày nghỉ có giờ riêng ĐÈ đúng dải đó (không cộng thêm giờ thường)",
    partialOff.length === 1 && partialOff[0].startMin === 540 && partialOff[0].endMin === 720,
  );
}

// --- Nhóm 3: computeFreeBlocks ---
{
  const open = [{ startMin: 480, endMin: 1200 }]; // 8:00-20:00
  const noBusy = computeFreeBlocks(open, []);
  ca("không lịch nào -> trống nguyên giờ mở cửa", noBusy.length === 1 && noBusy[0].startMin === 480 && noBusy[0].endMin === 1200);

  const middleBusy = computeFreeBlocks(open, [{ startMin: 600, endMin: 660 }]); // 10:00-11:00 bận
  ca(
    "1 lịch giữa ngày -> 2 khoảng trống",
    middleBusy.length === 2 && middleBusy[0].endMin === 600 && middleBusy[1].startMin === 660,
  );

  const fullyBooked = computeFreeBlocks(open, [{ startMin: 480, endMin: 1200 }]);
  ca("bận kín cả ngày -> 0 khoảng trống", fullyBooked.length === 0);

  const overlapping = computeFreeBlocks(open, [
    { startMin: 600, endMin: 700 }, // 10:00-11:40, hai thợ trùng giờ
    { startMin: 650, endMin: 750 }, // -> phải MERGE thành 600-750, không phải cộng dồn
  ]);
  ca(
    "hai lịch chồng giờ (khác thợ) -> merge đúng, không sinh khoảng trống ảo ở giữa",
    overlapping.length === 2 && overlapping[0].endMin === 600 && overlapping[1].startMin === 750,
  );

  const edgeTouch = computeFreeBlocks(open, [{ startMin: 480, endMin: 540 }]); // sát mép mở cửa
  ca(
    "lịch sát mép mở cửa -> không sinh khoảng trống rỗng ở đầu",
    edgeTouch.length === 1 && edgeTouch[0].startMin === 540 && edgeTouch[0].endMin === 1200,
  );

  const outsideOpen = computeFreeBlocks(open, [{ startMin: 0, endMin: 480 }]); // lịch hoàn toàn ngoài giờ mở cửa (dữ liệu bẩn)
  ca("lịch nằm ngoài giờ mở cửa không phá khoảng trống", outsideOpen.length === 1 && outsideOpen[0].startMin === 480);
}

// --- Nhóm 4: addDaysToDateKey / weekdayOfDateKey / startOfWeekKey (ngày thuần, neo UTC) ---
// Oracle: Python stdlib `datetime.date` độc lập — 2026-08-13 = T5(4), 2026-08-16 = CN(0), 2026-08-17 = T2(1).
{
  ca("addDaysToDateKey qua tháng", addDaysToDateKey("2026-08-13", -13) === "2026-07-31");
  ca("addDaysToDateKey +1", addDaysToDateKey("2026-08-13", 1) === "2026-08-14");
  ca("weekdayOfDateKey(2026-08-13) = 4 (T5)", weekdayOfDateKey("2026-08-13") === 4);
  ca("weekdayOfDateKey(2026-08-16) = 0 (CN)", weekdayOfDateKey("2026-08-16") === 0);
  ca("weekdayOfDateKey(2026-08-17) = 1 (T2)", weekdayOfDateKey("2026-08-17") === 1);
  ca("startOfWeekKey(T5 giữa tuần) -> T2 cùng tuần", startOfWeekKey("2026-08-13") === "2026-08-10");
  ca("startOfWeekKey(CN) -> T2 TUẦN TRƯỚC (không phải tuần sau)", startOfWeekKey("2026-08-16") === "2026-08-10");
  ca("startOfWeekKey(T2) -> chính nó", startOfWeekKey("2026-08-17") === "2026-08-17");
}

// --- Nhóm 5: formatMinuteLabel ---
ca("formatMinuteLabel(480) = '8:00'", formatMinuteLabel(480) === "8:00");
ca("formatMinuteLabel(810) = '13:30'", formatMinuteLabel(810) === "13:30");
ca("formatMinuteLabel(0) = '0:00'", formatMinuteLabel(0) === "0:00");

// --- Nhóm 6: candidateSlotStarts (đặt lịch từ chat, ADR-0009 mục 7 việc 5) ---
{
  // 1 dải 8:00-12:00 (480-720), dịch vụ 60', bước 30' -> 8:00,8:30,9:00...11:00 (11:30 sát mép vẫn đủ 60', 11:30+60=750>720 nên KHÔNG có)
  const oneBlock = candidateSlotStarts([{ startMin: 480, endMin: 720 }], 60, 30);
  ca(
    "1 dải 4 tiếng, dịch vụ 60' bước 30' -> 7 mốc, mốc cuối 11:00 (không lấn quá giờ đóng)",
    oneBlock.length === 7 && oneBlock[0] === 480 && oneBlock.at(-1) === 660,
    JSON.stringify(oneBlock),
  );

  // Dải hẹp hơn dịch vụ -> không mốc nào (dịch vụ 90' nhưng dải chỉ 60')
  const tooShort = candidateSlotStarts([{ startMin: 480, endMin: 540 }], 90, 30);
  ca("dải trống ngắn hơn dịch vụ -> không mốc nào (không được lấn giờ đóng)", tooShort.length === 0, JSON.stringify(tooShort));

  // Dải KHÔNG bắt đầu đúng bước (lịch vừa xong lúc 8:50) -> mốc đầu phải LÀM TRÒN LÊN bước kế (9:00), không phải 8:50
  const notAligned = candidateSlotStarts([{ startMin: 530, endMin: 720 }], 30, 30);
  ca(
    "dải bắt đầu lệch bước (8:50) -> mốc đầu làm tròn LÊN bước kế (9:00), không bịa mốc 8:50",
    notAligned[0] === 540,
    JSON.stringify(notAligned),
  );

  // Hai dải rời nhau (nghỉ trưa) -> mốc sinh riêng từng dải, không nhảy qua khoảng bận ở giữa
  const twoBlocks = candidateSlotStarts(
    [
      { startMin: 480, endMin: 720 }, // 8:00-12:00
      { startMin: 810, endMin: 1200 }, // 13:30-20:00
    ],
    60,
    30,
  );
  ca(
    "hai dải rời (nghỉ trưa) -> không có mốc nào rơi vào khoảng bận ở giữa",
    twoBlocks.every((m) => m < 720 || m >= 810),
    JSON.stringify(twoBlocks),
  );

  ca("không dải nào trống -> không mốc nào", candidateSlotStarts([], 30, 30).length === 0);
}

console.log(`\n[booking-schedule][TZ=${machineTz}] ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
