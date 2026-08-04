/** Kiểu dữ liệu + helper dùng chung cho màn Cơ hội (server + client). */

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
};

export type Pipeline = { id: string; name: string };

export type LostReason = { id: string; name: string };

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

/** Toàn bộ dữ liệu bảng Kanban của pipeline mặc định. */
export type BoardData = {
  pipeline: Pipeline;
  stages: PipelineStage[];
  deals: DealRow[];
  lostReasons: LostReason[];
};

/** Cơ hội của 1 khách — card mini trong hồ sơ 360. */
export type ContactDealRow = {
  id: string;
  title: string;
  value_vnd: number;
  status: DealStatus;
  next_action_at: string | null;
  pipeline_stages: { name: string; kind: StageKind } | null;
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
