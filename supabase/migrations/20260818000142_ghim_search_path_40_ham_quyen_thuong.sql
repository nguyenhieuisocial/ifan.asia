-- Việc #168 — ghim search_path cho 40 hàm QUYỀN-THƯỜNG còn sót.
--
-- Bối cảnh đo 18/08 trên CSDL thật: 246 hàm của mình (bỏ hàm thư viện).
--   · 194/194 hàm QUYỀN CAO (security definer) ĐỀU đã đủ pg_temp — việc #38
--     vẫn giữ, và rls-smoke đã có chốt canh sẵn (phép kiểm 49).
--   · 40 hàm quyền-thường còn thiếu: 33 khai `search_path=public` nhưng thiếu
--     pg_temp, 7 chưa khai gì.
--
-- KHÔNG phải lỗ đang mở: đã kiểm bằng has_schema_privilege — KHÔNG vai nào
-- (authenticated/anon/public) có quyền CREATE trong schema public, nên kiểu
-- tấn công "chèn hàm giả mạo tên vào schema tìm trước" không thực hiện được.
-- Vá để ĐỒNG BỘ với 194 hàm kia và để hôm nào có ai cấp CREATE thì không
-- thành 40 lỗ cùng lúc.
--
-- AN TOÀN — đã đo trước khi viết, KHÔNG vá mù:
--   · 3 hàm là "chịu lực": immutable_unaccent đỡ chỉ mục contacts_name_norm_idx,
--     wf_approval_levels_valid và wf_form_fields_valid đỡ 2 ràng buộc CHECK.
--   · Đọc thân cả 7 hàm chưa khai search_path: chúng gọi TÊN ĐẦY ĐỦ
--     (public.unaccent, public.tenants, public.tenant_members, public.reserved_slugs)
--     hoặc chỉ dùng hàm dựng sẵn (round, jsonb_*). Đã xác nhận `unaccent` nằm
--     ở schema `public`. => ghim `public, pg_temp` KHÔNG đổi kết quả hàm nào,
--     nên chỉ mục và ràng buộc vẫn đúng, không cần dựng lại.
--   · `alter function ... set` chỉ đổi cấu hình, KHÔNG đụng thân hàm.

alter function appointments_reset_reminder() set search_path = public, pg_temp;
alter function approval_pending_count() set search_path = public, pg_temp;
alter function billing_apply_invoice(uuid) set search_path = public, pg_temp;
alter function billing_log_once(uuid,uuid,text,text) set search_path = public, pg_temp;
alter function billing_notify(uuid,text,text,text,text,jsonb) set search_path = public, pg_temp;
alter function billing_owner_user(uuid) set search_path = public, pg_temp;
alter function billing_quote(uuid,text,text) set search_path = public, pg_temp;
alter function billing_round_thousand(bigint) set search_path = public, pg_temp;
alter function block_reserved_slug() set search_path = public, pg_temp;
alter function clear_i18n_key_on_rename() set search_path = public, pg_temp;
alter function companies_by_email_domain(text[]) set search_path = public, pg_temp;
alter function contact_tier_counts() set search_path = public, pg_temp;
alter function dashboard_overview() set search_path = public, pg_temp;
alter function dashboard_sales(timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone) set search_path = public, pg_temp;
alter function deal_board_stats(uuid) set search_path = public, pg_temp;
alter function deals_stage_changed() set search_path = public, pg_temp;
alter function ensure_last_owner() set search_path = public, pg_temp;
alter function form_submission_counts() set search_path = public, pg_temp;
alter function immutable_unaccent(text) set search_path = public, pg_temp;
alter function inbox_counts() set search_path = public, pg_temp;
alter function live_subscription(uuid) set search_path = public, pg_temp;
alter function next_invoice_number() set search_path = public, pg_temp;
alter function plan_limit(uuid,text) set search_path = public, pg_temp;
alter function plan_price(text,text) set search_path = public, pg_temp;
alter function qr_attribute_contact(text,uuid) set search_path = public, pg_temp;
alter function qr_code_list() set search_path = public, pg_temp;
alter function sla_fired_counts(timestamp with time zone) set search_path = public, pg_temp;
alter function sla_minutes_vn(integer) set search_path = public, pg_temp;
alter function source_revenue_report(timestamp with time zone,timestamp with time zone) set search_path = public, pg_temp;
alter function touch_updated_at() set search_path = public, pg_temp;
alter function wf_approval_levels_valid(jsonb) set search_path = public, pg_temp;
alter function wf_emit(uuid,text,text,text,jsonb) set search_path = public, pg_temp;
alter function wf_event_ctx() set search_path = public, pg_temp;
alter function wf_field(text,jsonb,jsonb) set search_path = public, pg_temp;
alter function wf_form_fields_valid(jsonb) set search_path = public, pg_temp;
alter function wf_match_conditions(jsonb,jsonb,jsonb) set search_path = public, pg_temp;
alter function wf_render(text,jsonb,jsonb) set search_path = public, pg_temp;
alter function wf_safe_label(text,integer) set search_path = public, pg_temp;
alter function wf_validate_form_data(jsonb,jsonb) set search_path = public, pg_temp;
alter function workflow_run_stats(timestamp with time zone) set search_path = public, pg_temp;
