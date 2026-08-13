/**
 * Kiểu dữ liệu cho vòng đời gói (migration #27).
 * Giá và hạn mức KHÔNG hard-code ở đây — nguồn sự thật duy nhất là bảng `plans`
 * trong DB; mọi màn hình đọc qua RPC `billing_overview` / `list_plans`.
 */

/**
 * ADR-0011 mục 4c.1/4c.2: đúng 2 gói, không có gói ba. 'pro' là code CŨ giữ
 * lại nguyên trạng (migration #88) — nay mang Ý NGHĨA MỚI "gói trả phí duy
 * nhất iFan" (99k/tháng, không giới hạn người), không còn là gói giữa của
 * bậc thang 4 gói cũ. Đổi code thành 'paid' sẽ đúng ngữ nghĩa hơn nhưng kéo
 * theo sửa CHECK constraint trên plans/subscriptions/subscription_invoices —
 * không cần thiết khi tên hiển thị (name_vi/name_en) đã đọc từ CSDL, không
 * hard-code "pro" ở đâu trong UI.
 */
export const PLAN_CODES = ["free", "pro"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export type BillingCycle = "month" | "year";

/** Trạng thái vòng đời — `none` chỉ xảy ra khi tenant chưa có thuê bao. */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "canceled"
  | "none";

export type PlanRow = {
  code: PlanCode;
  name_vi: string;
  name_en: string;
  price_month: number;
  price_year: number;
  limits: Record<string, number | null>;
};

export type UsageRow = {
  metric: string;
  used: number;
  /** null = không giới hạn */
  limit: number | null;
};

/** Phiếu thanh toán đang chờ (status='open') — migration #47. */
export type OpenInvoice = {
  number: string;
  amount_due: number;
  created_at: string;
};

/**
 * Thông tin chuyển khoản của iFan, founder điền trong `platform_settings`
 * (migration #47). Các trường có thể rỗng khi founder CHƯA điền — màn hình
 * phải kiểm trước khi hiện, không được hiện ô trống.
 */
export type BankTransferInfo = {
  account_name?: string;
  account_number?: string;
  bank?: string;
};

export type BillingOverview = {
  status: SubscriptionStatus;
  plan_code: PlanCode;
  plan_name_vi: string;
  plan_name_en: string;
  billing_cycle: BillingCycle;
  price_month: number;
  price_year: number;
  period_end: string | null;
  days_left: number | null;
  grace_ends_at: string | null;
  cancel_at_period_end: boolean;
  credit_balance: number;
  usage: UsageRow[];
  /** Phiếu đang chờ thanh toán của tiệm, mới nhất trước (migration #47). */
  open_invoices: OpenInvoice[];
  /** Thông tin chuyển khoản của iFan (migration #47). */
  bank_transfer: BankTransferInfo;
};

export type PlanQuote = {
  plan_code: PlanCode;
  billing_cycle: BillingCycle;
  /** giá niêm yết của gói/kỳ mới */
  list_price: number;
  /** phần chưa dùng của gói cũ, quy đổi theo số ngày còn lại */
  unused_credit: number;
  /** tiền dư đang giữ từ lần hạ gói trước */
  existing_credit: number;
  /** số phải trả thực tế, đã làm tròn nghìn, không âm */
  amount_due: number;
  /** phần dư chuyển sang kỳ sau */
  credit_carried: number;
  current_plan_code: PlanCode;
  current_cycle: BillingCycle;
  current_status: SubscriptionStatus;
};

/** Số tiền tiết kiệm khi trả năm (giá năm đã giảm 15% ở DB). */
export function yearlySaving(priceMonth: number, priceYear: number): number {
  return priceMonth * 12 - priceYear;
}
