/**
 * Tính khung giờ trống/bận cho màn Lịch (ADR-0009 mục 7 việc 4, mục 8 — bộ
 * kiểm thuần trên ≥4 múi giờ, nợ ghi ở `AGENTS.md` mục "SONNET ĐỌC ĐÂY").
 *
 * ⚠️ MỌI hàm ở đây THUẦN: không `Date.now()`, không đọc đồng hồ máy. Input là
 * timestamp UTC (từ cột `timestamptz`) + `timeZone` của tiệm (`tenants.timezone`,
 * mặc định "Asia/Ho_Chi_Minh"); output không phụ thuộc múi giờ MÁY CHẠY CODE.
 *
 * Khác `lib/storefront/hours.ts` (neo UTC thủ công cho phép cộng/trừ NGÀY):
 * ở đây cần đổi một *thời điểm* (timestamptz) sang *giờ:phút theo múi giờ tiệm*
 * — việc `setUTCDate` không làm được. Dùng `Intl.DateTimeFormat` với `timeZone`
 * truyền thẳng — API này tính theo múi giờ CHỈ ĐỊNH, không lệ thuộc `TZ` của
 * process, nên chạy đúng bất kể máy chủ đặt ở đâu. Bài học 12/08 (mặt tiền hẹn
 * khách quay lại "hôm qua") là do TRỘN giờ địa phương với `toISOString()` —
 * ở đây tránh bằng cách không bao giờ dùng `getHours()`/`getUTCHours()` trần,
 * luôn đi qua `partsInTimeZone()`.
 */

const WEEKDAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function partsInTimeZone(
  isoUtc: string,
  timeZone: string,
): { dateKey: string; minutesOfDay: number; weekday: number } {
  const d = new Date(isoUtc);
  // Cố định locale 'en-US' — không lệ thuộc ngôn ngữ hệ điều hành, để mảng
  // WEEKDAY_ORDER map đúng bất kể máy chạy locale gì.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = WEEKDAY_ORDER.indexOf(get("weekday") as (typeof WEEKDAY_ORDER)[number]);
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutesOfDay: Number(get("hour")) * 60 + Number(get("minute")),
    weekday,
  };
}

/** "YYYY-MM-DD" theo múi giờ tiệm — dùng để nhóm lịch hẹn vào đúng ngày trên màn. */
export function dateKeyInTimeZone(isoUtc: string, timeZone: string): string {
  return partsInTimeZone(isoUtc, timeZone).dateKey;
}

/** 0=CN…6=T7 theo múi giờ tiệm — khớp `extract(dow)` Postgres dùng cho `business_hours.weekday`. */
export function weekdayInTimeZone(isoUtc: string, timeZone: string): number {
  return partsInTimeZone(isoUtc, timeZone).weekday;
}

/** Số phút kể từ 00:00 theo múi giờ tiệm (0–1439). */
export function minutesOfDayInTimeZone(isoUtc: string, timeZone: string): number {
  return partsInTimeZone(isoUtc, timeZone).minutesOfDay;
}

/**
 * Cộng/trừ NGÀY thuần (không giờ) — neo UTC cả hai đầu, cùng khuôn
 * `lib/storefront/hours.ts` (đã kiểm chứng đúng, bài học lỗi 12/08). Đây là
 * phép tính khác hẳn nhóm hàm ở trên: không có giờ:phút nên không cần
 * `Intl(timeZone)`, chỉ cần KHÔNG bao giờ đi qua giờ địa phương của máy.
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0=CN…6=T7 cho một NGÀY thuần (không cần biết giờ, nên không cần timeZone). */
export function weekdayOfDateKey(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

/** Thứ Hai của tuần chứa `dateKey` (tuần làm việc VN bắt đầu Thứ 2). */
export function startOfWeekKey(dateKey: string): string {
  const wd = weekdayOfDateKey(dateKey);
  const back = wd === 0 ? 6 : wd - 1; // CN(0) lùi 6 ngày; T2(1) lùi 0; T3(2) lùi 1…
  return addDaysToDateKey(dateKey, -back);
}

export type DayHourRow = { is_closed: boolean; open_time: string | null; close_time: string | null };
export type DayClosureOverride = { is_full_day: boolean; open_time: string | null; close_time: string | null } | null;

export type MinuteRange = { startMin: number; endMin: number };

/**
 * "+HH:MM" / "-HH:MM" của `timeZone` TẠI ĐÚNG ngày+giờ đã cho — không đoán
 * offset cố định (một tiệm DÙNG MÚI GIỜ CÓ DST thì offset đổi theo mùa; bài
 * học 12/08 là hậu quả của việc cộng/trừ giờ "cố định" mà không hỏi lại
 * đồng hồ thật). Cách làm: coi (dateKey, time) là mốc UTC TẠM để có một
 * `Date` hợp lệ, hỏi Intl xem `timeZone` đọc mốc đó ra giờ:phút nào, rồi so
 * lệch — chênh lệch chính là offset cần tìm (dưới sai số làm tròn phút, vô
 * hại vì offset múi giờ luôn tròn phút).
 */
export function offsetLabelForTimeZone(dateKey: string, time: string, timeZone: string): string {
  const guessUtc = new Date(`${dateKey}T${time}:00Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(guessUtc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const readAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const diffMin = Math.round((readAsUtc - guessUtc.getTime()) / 60_000);
  const sign = diffMin >= 0 ? "+" : "-";
  const abs = Math.abs(diffMin);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** ISO có offset THẬT của `timeZone` — dùng khi người dùng nhập "9:00 sáng 13/8" và cần một `timestamptz` đúng. */
export function buildZonedIso(dateKey: string, time: string, timeZone: string): string {
  return `${dateKey}T${time}:00${offsetLabelForTimeZone(dateKey, time, timeZone)}`;
}

/** Cộng phút vào (dateKey, "HH:MM"), tự sang ngày kế tiếp nếu tràn quá nửa đêm — trả cặp mới. */
export function addMinutesToLocalTime(
  dateKey: string,
  time: string,
  minutes: number,
): { dateKey: string; time: string } {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const daysOver = Math.floor(total / 1440);
  const clamped = ((total % 1440) + 1440) % 1440;
  return {
    dateKey: daysOver !== 0 ? addDaysToDateKey(dateKey, daysOver) : dateKey,
    time: `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "8:00" — bỏ số 0 đầu giờ, khớp cách hiện trong thẻ design `man-lich-hen.html`. */
export function formatMinuteLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * Khung giờ MỞ CỬA của một ngày cụ thể, sau khi áp ngày nghỉ (nếu có) đè lên
 * giờ thường — cùng luật ưu tiên với `computeStorefrontStatus` (closure thắng).
 * `hours` phải đã lọc đúng `weekday` của ngày đang xem.
 */
export function computeOpenRanges(hours: DayHourRow[], closureOverride: DayClosureOverride): MinuteRange[] {
  if (closureOverride) {
    if (closureOverride.is_full_day) return [];
    if (closureOverride.open_time && closureOverride.close_time) {
      return [{ startMin: toMinutes(closureOverride.open_time), endMin: toMinutes(closureOverride.close_time) }];
    }
    return [];
  }
  return hours
    .filter((h) => !h.is_closed && h.open_time && h.close_time)
    .map((h) => ({ startMin: toMinutes(h.open_time!), endMin: toMinutes(h.close_time!) }))
    .sort((a, b) => a.startMin - b.startMin);
}

function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = [...ranges].sort((a, b) => a.startMin - b.startMin);
  const out: MinuteRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, r.endMin);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/**
 * Khoảng TRỐNG trong ngày = giờ mở cửa trừ đi mọi lịch đã đặt (bất kể track).
 *
 * ⚠️ Giới hạn có chủ đích: đây là "trống của CẢ TIỆM" (hợp nhất mọi nhân
 * viên/tài nguyên thành một track), khớp view điện thoại của thẻ design
 * (`man-lich-hen.html` phần 1 — một timeline chung, không tách cột). Tiệm
 * nhiều thợ mà một thợ bận thì khối đó vẫn báo "không trống" dù thợ khác
 * rảnh — đúng phạm vi V2 (đo ~1,1 người/tiệm, ADR-0009 mục 4). Xem trống
 * TỪNG người/tài nguyên riêng thì dùng `computeFreeBlocks` với `busy` đã lọc
 * theo đúng track đó (view tuần trên máy tính làm vậy, mỗi cột một track).
 */
export function computeFreeBlocks(openRanges: MinuteRange[], busy: MinuteRange[]): MinuteRange[] {
  const mergedBusy = mergeRanges(busy);
  const free: MinuteRange[] = [];
  for (const open of openRanges) {
    let cursor = open.startMin;
    for (const b of mergedBusy) {
      const bs = Math.max(b.startMin, open.startMin);
      const be = Math.min(b.endMin, open.endMin);
      if (bs >= be) continue; // không giao với khung mở cửa này
      if (bs > cursor) free.push({ startMin: cursor, endMin: bs });
      cursor = Math.max(cursor, be);
    }
    if (cursor < open.endMin) free.push({ startMin: cursor, endMin: open.endMin });
  }
  return free;
}

/**
 * Sinh mốc giờ BẤM-LÀ-ĐẶT-ĐƯỢC (đặt lịch từ chat, ADR-0009 mục 7 việc 5, thẻ
 * design man-dat-lich-tu-chat.html) — mỗi mốc cách nhau `stepMinutes`, đủ chỗ
 * chứa trọn `durationMinutes` bên trong một khoảng trống. KHÔNG bịa mốc đè
 * lên lịch đã có: đầu vào là `freeBlocks` (đã trừ hết lịch bận), không tự trừ
 * lại ở đây — đúng D1 (một nơi tính "trống", không tính hai lần).
 */
export function candidateSlotStarts(
  freeBlocks: MinuteRange[],
  durationMinutes: number,
  stepMinutes = 30,
): number[] {
  const starts: number[] = [];
  for (const block of freeBlocks) {
    const firstStep = Math.ceil(block.startMin / stepMinutes) * stepMinutes;
    for (let s = firstStep; s + durationMinutes <= block.endMin; s += stepMinutes) {
      starts.push(s);
    }
  }
  return starts;
}
