/**
 * Tính trạng thái mở/đóng cửa cho mặt tiền công khai (ADR-0008 mục 6, task #88).
 *
 * Toàn bộ hàm ở đây THUẦN (không Date.now(), không đọc đồng hồ máy) — mọi input
 * (now, today_weekday, hours, closures) đều là dữ liệu wall-clock KHÔNG offset
 * do RPC storefront_view() trả (đã tính sẵn theo timezone của tiệm ở tầng SQL).
 * Lý do tính ở đây thay vì SQL: đây là phép tính THUẦN TRÌNH BÀY (chọn câu chữ,
 * định dạng hiển thị) — sửa câu chữ không cần đụng migration (xem chú thích đầu
 * migration #80). new Date() ở file này CHỈ dùng để cộng/trừ NGÀY LỊCH (không
 * đọc giờ hệ thống), an toàn với mọi múi giờ trình duyệt.
 */

export type StorefrontHourRow = {
  weekday: number; // 0=CN…6=T7, theo extract(dow) — khớp today_weekday của RPC
  is_closed: boolean;
  open_time: string | null; // "HH:MM"
  close_time: string | null;
};

export type StorefrontClosureRow = {
  date_from: string; // "YYYY-MM-DD"
  date_to: string;
  reason: string;
  is_full_day: boolean;
  open_time: string | null;
  close_time: string | null;
};

export type StorefrontStatus =
  | { kind: "no_hours" } // chưa đặt giờ nào -> ẩn hẳn khối giờ (thẻ design man-cai-dat-mat-tien.html)
  | { kind: "closure"; reason: string; reopensLabel: string | null }
  | { kind: "open"; closesAtLabel: string }
  | { kind: "closed"; reopensLabel: string | null };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOffset(fromStr: string, toStr: string): number {
  const from = new Date(`${fromStr}T00:00:00`).getTime();
  const to = new Date(`${toStr}T00:00:00`).getTime();
  return Math.round((to - from) / 86_400_000);
}

function partOfDay(hhmm: string): string {
  const h = Number(hhmm.split(":")[0]);
  if (h < 12) return "sáng";
  if (h < 18) return "chiều";
  return "tối";
}

function dateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** "8:00 sáng mai" / "18:00 tối nay" / "8:00 sáng 23/2" — dùng cho ca "ngoài giờ". */
function formatReopenLabel(dateStr: string, todayStr: string, time: string): string {
  const part = partOfDay(time);
  if (dateStr === todayStr) return `${time} ${part} nay`;
  if (dateStr === addDays(todayStr, 1)) return `${time} ${part} mai`;
  return `${time} ${part} ${dateLabel(dateStr)}`;
}

/** "23/2" — dùng cho ca nghỉ lễ (thẻ design không ghim giờ mở lại, chỉ ngày). */
function formatClosureReopenLabel(dateStr: string): string {
  return dateLabel(dateStr);
}

/** Tìm (ngày, giờ mở) SỚM NHẤT kể từ startDateStr, tối đa 8 ngày, bỏ qua ngày bị closure cả-ngày phủ. */
function findNextOpenFrom(
  startDateStr: string,
  todayStr: string,
  todayWeekday: number,
  hours: StorefrontHourRow[],
  closures: StorefrontClosureRow[],
): { date: string; time: string } | null {
  for (let i = 0; i <= 8; i++) {
    const d = addDays(startDateStr, i);
    const coveredByClosure = closures.some(
      (c) => c.is_full_day && d >= c.date_from && d <= c.date_to,
    );
    if (coveredByClosure) continue;
    const weekday = (((todayWeekday + dayOffset(todayStr, d)) % 7) + 7) % 7;
    const ranges = hours
      .filter((h) => h.weekday === weekday && !h.is_closed && h.open_time)
      .sort((a, b) => toMinutes(a.open_time!) - toMinutes(b.open_time!));
    if (ranges.length > 0) return { date: d, time: ranges[0].open_time! };
  }
  return null;
}

export function computeStorefrontStatus(input: {
  now: string; // "YYYY-MM-DDTHH:MM:SS[.ffffff]" wall-clock, không offset
  todayWeekday: number;
  hours: StorefrontHourRow[];
  closures: StorefrontClosureRow[];
}): StorefrontStatus {
  const [dateStr, timePart] = input.now.split("T");
  const nowMinutes = toMinutes(timePart.slice(0, 5));

  // Chưa từng đặt giờ (tenant mới bật mặt tiền, chưa qua màn Cài đặt giờ) —
  // KHÔNG suy diễn "đã đóng cửa", ẩn hẳn khối giờ (đúng luật thẻ design).
  if (input.hours.length === 0) return { kind: "no_hours" };

  // Ngày nghỉ ĐÈ lên giờ thường — kiểm trước.
  const closureToday = input.closures.find(
    (c) => dateStr >= c.date_from && dateStr <= c.date_to,
  );
  if (closureToday) {
    const openByOverride =
      !closureToday.is_full_day &&
      closureToday.open_time &&
      closureToday.close_time &&
      nowMinutes >= toMinutes(closureToday.open_time) &&
      nowMinutes < toMinutes(closureToday.close_time);
    if (!openByOverride) {
      const next = findNextOpenFrom(
        addDays(closureToday.date_to, 1),
        dateStr,
        input.todayWeekday,
        input.hours,
        input.closures,
      );
      return {
        kind: "closure",
        reason: closureToday.reason,
        reopensLabel: next ? formatClosureReopenLabel(next.date) : null,
      };
    }
  }

  const todayRanges = input.hours
    .filter((h) => h.weekday === input.todayWeekday && !h.is_closed && h.open_time && h.close_time)
    .sort((a, b) => toMinutes(a.open_time!) - toMinutes(b.open_time!));

  const activeRange = todayRanges.find(
    (r) => nowMinutes >= toMinutes(r.open_time!) && nowMinutes < toMinutes(r.close_time!),
  );
  if (activeRange) return { kind: "open", closesAtLabel: activeRange.close_time! };

  const upcomingToday = todayRanges.find((r) => toMinutes(r.open_time!) > nowMinutes);
  if (upcomingToday) {
    return { kind: "closed", reopensLabel: formatReopenLabel(dateStr, dateStr, upcomingToday.open_time!) };
  }

  const next = findNextOpenFrom(addDays(dateStr, 1), dateStr, input.todayWeekday, input.hours, input.closures);
  return { kind: "closed", reopensLabel: next ? formatReopenLabel(next.date, dateStr, next.time) : null };
}

export const WEEKDAY_LABELS_VN = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
