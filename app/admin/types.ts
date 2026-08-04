/** Kiểu trả về của 2 RPC super-admin (migration #28) — CHỈ số tổng hợp. */

export type PlatformOverview = {
  mrr: number;
  arr: number;
  tenants: {
    total: number;
    trialing: number;
    active_paid: number;
    active_free: number;
    past_due: number;
    suspended: number;
    no_subscription: number;
    signups_30d: number;
  };
  health: { healthy: number; idle: number; dormant: number };
  ttv: { activated: number; total: number; median_hours: number };
  generated_at: string;
};

export type TenantHealthRow = {
  tenant_id: string;
  name: string;
  slug: string;
  created_at: string;
  plan_code: string;
  status: string;
  mrr: number;
  members: number;
  seat_limit: number | null;
  last_active_at: string;
  days_inactive: number;
  ttv_hours: number | null;
};

/** Ngưỡng sức khỏe: ≤7 ngày còn chạy · ≤30 ngày đang nguội · trên nữa là đã bỏ. */
export function healthOf(daysInactive: number): "healthy" | "idle" | "dormant" {
  if (daysInactive <= 7) return "healthy";
  if (daysInactive <= 30) return "idle";
  return "dormant";
}
