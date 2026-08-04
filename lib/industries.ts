/**
 * Tiệm mẫu theo ngành (migration #12) — 4 giá trị khớp check constraint
 * tenants_industry_check. Label/description dịch ở messages/*.json
 * namespace "common.industries".
 */
export const INDUSTRIES = [
  "spa_clinic",
  "education",
  "retail_online",
  "other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];
