/** Kiểu dữ liệu + helper dùng chung cho màn Cơ hội (server + client). */

import { formatVN } from "@/lib/datetime";
import type { Translator } from "@/i18n/config";

/** Khớp check constraint pipeline_stages.kind (migration #4). */
export type StageKind = "open" | "won" | "lost";

/** Khớp check constraint deals.status (migration #4) — denormalize từ stage.kind. */
export type DealStatus = "open" | "won" | "lost";

export type PipelineStage = {
  id: string;
  name: string;
  position: number;
  kind: StageKind;
  win_probability: number | null;
  /** Khóa dịch tên CÀI SẴN (migration #36); null = tên chủ tiệm tự đặt. */
  i18n_key: string | null;
};

export type Pipeline = { id: string; name: string };

export type LostReason = { id: string; name: string; i18n_key: string | null };

/** Khách gắn với cơ hội — chỉ những cột thẻ Kanban cần. */
export type DealContact = {
  id: string;
  full_name: string;
  lead_score: number;
};

export type DealRow = {
  id: string;
  title: string;
  value_vnd: number;
  stage_id: string;
  status: DealStatus;
  contact_id: string;
  owner_id: string;
  expected_close_date: string | null;
  next_action_at: string | null;
  next_action_note: string | null;
  lost_reason_id: string | null;
  stage_entered_at: string;
  created_at: string;
  contacts: DealContact | null;
};

/**
 * Con số THẬT của bảng Kanban — do CSDL đếm (RPC deal_board_stats, migration
 * #37), KHÔNG đếm trên tập thẻ đã tải về. Danh sách thẻ vẫn có trần
 * BOARD_DEAL_LIMIT nên hai thứ này có thể lệch nhau: đó chính là lúc cột phải
 * bày nút "Tải thêm" thay vì im lặng.
 */
export type BoardStats = {
  total: number;
  needs_action: number;
  open_total: number;
  forecast: number;
  stages: Record<string, { n: number; total: number }>;
  /**
   * Bốn số của "sức khoẻ đường ống" — CÓ THỂ VẮNG. RPC deal_board_stats chỉ trả
   * chúng từ migration #260 trở đi; CSDL chưa nâng thì bốn khoá này `undefined`
   * và tầng web tự đếm trên tập thẻ đã tải (đúng khuôn `stats?.x ?? tự đếm` mà
   * `forecast`/`open_total` đã dùng sẵn cho trường hợp RPC hỏng).
   */
  stale?: number;
  forecast_this_month?: number;
  overdue_close_count?: number;
  overdue_close_forecast?: number;
};

/** Toàn bộ dữ liệu bảng Kanban của pipeline mặc định. */
export type BoardData = {
  pipeline: Pipeline;
  stages: PipelineStage[];
  deals: DealRow[];
  /** null khi RPC chưa trả được — tầng web tự lùi về đếm trên tập đã tải. */
  stats: BoardStats | null;
  lostReasons: LostReason[];
};

/** Khách gắn với cơ hội trên màn chi tiết — thêm SĐT + công ty để bấm gọi/mở. */
export type DealDetailContact = {
  id: string;
  full_name: string;
  phone: string | null;
  lead_score: number;
  companies: { id: string; name: string } | null;
};

/** Cơ hội đầy đủ cho màn chi tiết (deal 360). */
export type DealDetailRow = {
  id: string;
  title: string;
  value_vnd: number;
  pipeline_id: string;
  stage_id: string;
  status: DealStatus;
  contact_id: string;
  owner_id: string;
  expected_close_date: string | null;
  next_action_at: string | null;
  next_action_note: string | null;
  lost_reason_id: string | null;
  stage_entered_at: string;
  won_at: string | null;
  lost_at: string | null;
  created_at: string;
  contacts: DealDetailContact | null;
  lost_reasons: { name: string; i18n_key: string | null } | null;
};

/** Một chặng cơ hội đã đi qua (deal_stage_history — trigger DB ghi, append-only). */
export type StageHistoryRow = {
  id: number;
  from_stage_id: string | null;
  to_stage_id: string;
  entered_at: string;
  exited_at: string | null;
  duration_seconds: number | null;
};

/** Ngưỡng cam kết đang áp cho cơ hội — panel SLA của màn chi tiết (spec §4.5). */
export type DealSlaPolicy = {
  name: string;
  warn_after_minutes: number;
  breach_after_minutes: number;
};

/** Trạng thái đồng hồ cam kết của một cơ hội. */
export type DealSlaState = "ontime" | "overdue" | "breached";

/** Số phút đã quá hạn việc kế tiếp (0 khi còn hạn hoặc cơ hội đã đóng). */
export function overdueMinutes(
  deal: Pick<DealRow, "status" | "next_action_at">,
  now: number = Date.now(),
): number {
  if (deal.status !== "open" || !deal.next_action_at) return 0;
  const diff = now - new Date(deal.next_action_at).getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 60_000);
}

/** Quá mốc vi phạm của chính sách đang bật ⇒ "vi phạm"; chỉ quá hạn ⇒ "quá hạn". */
export function dealSlaState(
  overdue: number,
  policy: DealSlaPolicy | null,
): DealSlaState {
  if (overdue <= 0) return "ontime";
  if (policy && overdue >= policy.breach_after_minutes) return "breached";
  return "overdue";
}

/** Cơ hội của 1 khách — card mini trong hồ sơ 360. */
export type ContactDealRow = {
  id: string;
  title: string;
  value_vnd: number;
  status: DealStatus;
  next_action_at: string | null;
  pipeline_stages: { name: string; kind: StageKind; i18n_key: string | null } | null;
};

/** Ô gợi ý khách trong ô chọn khách của form cơ hội. */
export type ContactOption = { id: string; full_name: string; phone: string | null };

/** Thành viên tenant cho ô chọn người phụ trách. */
export type MemberOption = { userId: string; name: string };

/** Nhãn ô chọn người phụ trách — dùng chung nhãn "Tôi"/tên/NV {id} với màn Khách hàng. */
export function buildMemberOptions(
  memberIds: string[],
  memberNames: Record<string, string>,
  currentUserId: string,
  t: Translator,
): MemberOption[] {
  return memberIds.map((userId) => ({
    userId,
    name:
      userId === currentUserId
        ? t("me")
        : (memberNames[userId] ?? t("member", { id: userId.slice(0, 8) })),
  }));
}

/**
 * Luật đợt 1: "mọi deal MỞ phải có việc kế tiếp".
 * DB đã chặn cứng next_action_at null cho deal mở (check deals_open_needs_next_action),
 * nên trên thực tế cảnh báo bắt được deal QUÁ HẠN — vẫn kiểm cả null để phòng
 * dữ liệu cũ/nhập tay ngoài app.
 */
export function needsNextAction(
  deal: Pick<DealRow, "status" | "next_action_at">,
  now: number = Date.now(),
): boolean {
  if (deal.status !== "open") return false;
  if (!deal.next_action_at) return true;
  return new Date(deal.next_action_at).getTime() <= now;
}

/** Pill màu theo loại cột — token luật: thắng xanh lá (tiền vào), thua đỏ, mở xám. */
export const STAGE_KIND_BADGE: Record<StageKind, string> = {
  open: "bg-muted text-muted-foreground",
  won: "bg-status-closed text-status-closed-foreground",
  lost: "bg-destructive/10 text-destructive",
};

/** Tổng giá trị 1 cột (VNĐ). */
export function sumValue(deals: DealRow[]): number {
  return deals.reduce((sum, d) => sum + Number(d.value_vnd), 0);
}

/**
 * Doanh thu dự báo = Σ(giá trị × xác suất thắng của stage) — spec CRM §4.4.
 * Chỉ tính deal đang mở; stage chưa đặt xác suất coi như 0.
 */
export function forecastValue(deals: DealRow[], stages: PipelineStage[]): number {
  const prob = new Map(stages.map((s) => [s.id, s.win_probability ?? 0]));
  return deals
    .filter((d) => d.status === "open")
    .reduce((sum, d) => sum + (Number(d.value_vnd) * (prob.get(d.stage_id) ?? 0)) / 100, 0);
}

/** Số ngày deal nằm ở stage hiện tại (spec: "tuổi deal" trên thẻ). */
export function daysInStage(deal: Pick<DealRow, "stage_entered_at">, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(deal.stage_entered_at).getTime()) / 86_400_000));
}

/**
 * Ngưỡng "nguội": cơ hội đứng yên MỘT BƯỚC bấy nhiêu ngày thì coi là đang chết.
 *
 * VÌ SAO ĐO THEO BƯỚC, KHÔNG THEO VIỆC KẾ TIẾP: nút "Hẹn tiếp"
 * (`rescheduleNextAction`) dời `next_action_at` ra xa bao nhiêu lần cũng được —
 * không đếm, không ghi vết. Một cơ hội bị dời hẹn mười lần thì KHÔNG BAO GIỜ lọt
 * vào bộ lọc "Cần việc kế tiếp": nó chết êm trong khi vẫn được cộng đủ vào dự
 * báo. `stage_entered_at` thì dời hẹn không đụng tới được (chỉ trigger đổi bước
 * mới ghi lại), nên nó là cái đồng hồ trung thực — và migration nền CRM đã chú
 * thích thẳng cột này là "phục vụ SLA/rotting".
 *
 * 14 ngày vì tiệm spa/salon bán gói theo ngày chứ không theo quý. Khai hằng số
 * có tên đúng lối `HOT_SCORE = 70` của nhãn "khách đang nóng".
 */
export const STALE_DAYS = 14;

/** Cơ hội đang mở và đã đứng yên một bước ≥ STALE_DAYS ngày. */
export function isStaleDeal(
  deal: Pick<DealRow, "status" | "stage_entered_at">,
  now: number = Date.now(),
): boolean {
  return deal.status === "open" && daysInStage(deal, now) >= STALE_DAYS;
}

/**
 * Số ngày đã trôi qua kể từ NGÀY DỰ KIẾN CHỐT (0 = còn hạn / đã đóng / bỏ trống).
 *
 * `expected_close_date` là kiểu `date` (không giờ), nên so sánh phải làm trên
 * NGÀY của giờ Việt Nam — neo cả hai đầu vào 00:00Z để phép trừ là số học ngày
 * thuần, không phụ thuộc đồng hồ máy chạy code.
 */
export function closeOverdueDays(
  deal: Pick<DealRow, "status" | "expected_close_date">,
  now: number = Date.now(),
): number {
  if (deal.status !== "open" || !deal.expected_close_date) return 0;
  const today = Date.parse(`${formatVN(now, "yyyy-MM-dd")}T00:00:00Z`);
  const due = Date.parse(`${deal.expected_close_date}T00:00:00Z`);
  if (Number.isNaN(due) || due >= today) return 0;
  return Math.round((today - due) / 86_400_000);
}

/**
 * Dự báo BÓC THEO KỲ HẠN — cùng công thức Σ(giá trị × tỉ lệ thắng của bước) với
 * `forecastValue`, chỉ khác ở chỗ chia theo `expected_close_date`.
 *
 * Sinh ra vì con số "dự kiến thu" một mình nó không nói được nó gồm những gì:
 * đo trên CSDL thật 21/08 có 26/33 cơ hội đang mở (79%) đã QUÁ ngày dự kiến
 * chốt mà vẫn được cộng nguyên vào dự báo. Chủ tiệm đọc con số đó để tính tiền
 * mặt tháng này.
 */
export type ForecastHorizon = {
  /** Dự báo của cơ hội có ngày chốt rơi vào tháng dương lịch hiện tại (giờ VN). */
  thisMonth: number;
  /** Số cơ hội đang mở đã quá ngày dự kiến chốt. */
  overdueCount: number;
  /** Phần dự báo đến TỪ nhóm quá ngày chốt — đã nhân tỉ lệ thắng như dự báo tổng. */
  overdueForecast: number;
};

export function forecastHorizon(
  deals: DealRow[],
  stages: PipelineStage[],
  now: number = Date.now(),
): ForecastHorizon {
  const prob = new Map(stages.map((s) => [s.id, s.win_probability ?? 0]));
  const thisMonthPrefix = formatVN(now, "yyyy-MM");
  const out: ForecastHorizon = { thisMonth: 0, overdueCount: 0, overdueForecast: 0 };

  for (const d of deals) {
    if (d.status !== "open") continue;
    const weighted = (Number(d.value_vnd) * (prob.get(d.stage_id) ?? 0)) / 100;
    if (closeOverdueDays(d, now) > 0) {
      out.overdueCount += 1;
      out.overdueForecast += weighted;
      // Cơ hội đã quá hạn KHÔNG cộng vào "tháng này" kể cả khi ngày chốt của nó
      // rơi đúng tháng này — nó đã trượt, đếm tiếp là lại dựng lên một con số
      // hứa hẹn đúng thứ vừa lỡ.
      continue;
    }
    if (d.expected_close_date?.startsWith(thisMonthPrefix)) out.thisMonth += weighted;
  }
  return out;
}

/** Lối sắp xếp thẻ trong từng cột — giá trị của tham số URL `?sort=`. */
export const DEAL_SORTS = ["stale", "close"] as const;
export type DealSort = (typeof DEAL_SORTS)[number];

/**
 * Sắp xếp thẻ TRONG cột. Cố ý là sắp xếp chứ không phải bộ lọc: giấu thẻ đi thì
 * con số trên đầu mỗi cột hoá ra nói dối, mà bảng này đếm số bằng CSDL đúng để
 * tránh chuyện đó.
 *
 * Không sửa mảng gốc (`deals` là state của bảng, kéo-thả đang đọc nó).
 */
export function sortDeals(deals: DealRow[], sort: DealSort | null): DealRow[] {
  if (!sort) return deals;
  const copy = [...deals];
  if (sort === "stale") {
    // Vào bước sớm nhất = nằm lại lâu nhất = lên đầu.
    return copy.sort(
      (a, b) => Date.parse(a.stage_entered_at) - Date.parse(b.stage_entered_at),
    );
  }
  // "close": gần tới ngày chốt nhất lên đầu; chưa đặt ngày thì xuống cuối (không
  // có ngày không có nghĩa là gấp).
  return copy.sort((a, b) => {
    if (!a.expected_close_date) return b.expected_close_date ? 1 : 0;
    if (!b.expected_close_date) return -1;
    return a.expected_close_date.localeCompare(b.expected_close_date);
  });
}
