-- ============================================================
-- iFan.asia — Migration #78: vá lỗ hổng tự phát hiện ở migration #77 —
-- 2 hàm chỉ dành cho pg_cron nội bộ (support_sessions_sweep_expired,
-- help_requests_close_stale) đang GỌI ĐƯỢC qua PostgREST bởi cả anon lẫn
-- authenticated (advisor: "can be executed by the anon role ... via
-- /rest/v1/rpc/..."), vì quên revoke execute — đúng khuôn 4 hàm nội bộ khác
-- trong kho đã làm (process_zalo_events, trigger_zalo_processing,
-- increment_usage, emit_event — migration #1/#2/#5).
--
-- Không phải lỗ rò dữ liệu (2 hàm không trả về hàng nào nhạy cảm, chỉ đóng
-- sổ đúng hạn/đúng lý do) nhưng SAI QUY ƯỚC: hàm chỉ-cron không được lộ ra
-- API công khai — ai cũng gọi được nghĩa là ai cũng ép chạy sớm việc lẽ ra
-- chỉ pg_cron quyết định giờ chạy. Tự bắt bằng `npx supabase db advisors`
-- ngay sau khi áp migration #77, vá liền không đợi ai báo.
-- ============================================================

revoke execute on function public.support_sessions_sweep_expired from anon, authenticated, public;
revoke execute on function public.help_requests_close_stale from anon, authenticated, public;
