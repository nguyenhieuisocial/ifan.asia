/**
 * Trần mốc thời gian = 30 ngày: worker `process_sla_timers` (migration #17) chỉ
 * quét mục tiêu có mốc bắt đầu trong 30 ngày gần đây, đặt xa hơn là mốc chết.
 * Tách ra file riêng vì "use server" không cho export non-async (Next.js 16).
 */
export const SLA_MAX_MINUTES = 30 * 24 * 60;
