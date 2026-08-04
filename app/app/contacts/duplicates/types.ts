/** Kiểu dữ liệu màn "Trùng lặp" — khớp đúng RPC contact_duplicate_pairs (migration #18). */

import type { Tier } from "../types";

/** Cách hệ thống nhận ra hai hồ sơ nghi là một người. */
export type MatchType = "phone" | "email" | "name";

/** Tóm tắt một hồ sơ để so cạnh nhau + biết cái gì sẽ chuyển khi gộp. */
export type MergeCandidate = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  tier: Tier;
  lead_score: number;
  total_revenue: number;
  owner_id: string | null;
  source_id: string | null;
  source_name: string | null;
  company_id: string | null;
  company_name: string | null;
  created_at: string;
  conversation_count: number;
  deal_count: number;
  activity_count: number;
  tag_count: number;
  identity_count: number;
  tags: string[];
};

export type DuplicatePair = {
  a_id: string;
  b_id: string;
  match_type: MatchType;
  confidence: number;
  a: MergeCandidate;
  b: MergeCandidate;
};

/** Field người dùng được chọn giữ giá trị của bên nào. */
export const MERGE_FIELDS = [
  "full_name",
  "phone",
  "email",
  "source_id",
  "company_id",
  "owner_id",
  "tier",
] as const;

export type MergeField = (typeof MERGE_FIELDS)[number];

/** "winner" = giữ giá trị của bản được chọn làm hồ sơ chính. */
export type FieldChoice = Record<MergeField, "winner" | "loser">;

/** Giá trị hiển thị của một field trên một hồ sơ (null = chưa có). */
export function fieldValue(c: MergeCandidate, f: MergeField): string | null {
  switch (f) {
    case "full_name":
      return c.full_name;
    case "phone":
      return c.phone;
    case "email":
      return c.email;
    case "source_id":
      return c.source_name;
    case "company_id":
      return c.company_name;
    case "owner_id":
      return c.owner_id;
    case "tier":
      return c.tier;
  }
}

/**
 * Mặc định thông minh: giữ giá trị bản chính, TRỪ khi bản chính bỏ trống mà bản
 * kia có — lúc đó lấy của bản kia (gộp mà mất dữ liệu là lỗi nặng nhất của màn này).
 */
export function defaultChoices(
  winner: MergeCandidate,
  loser: MergeCandidate,
): FieldChoice {
  const out = {} as FieldChoice;
  for (const f of MERGE_FIELDS) {
    const w = fieldValue(winner, f);
    const l = fieldValue(loser, f);
    out[f] = !w && l ? "loser" : "winner";
  }
  return out;
}

/** Tổng số hàng sẽ chuyển từ bản thua sang bản giữ. */
export function movedTotals(loser: MergeCandidate) {
  return {
    conversations: loser.conversation_count,
    deals: loser.deal_count,
    activities: loser.activity_count,
    tags: loser.tag_count,
    identities: loser.identity_count,
  };
}
