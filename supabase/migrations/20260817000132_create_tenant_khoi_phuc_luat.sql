-- ============================================================
-- iFan.asia — Migration #132: khôi phục `create_tenant()` (bản 8 tham số,
-- migration #123) — đánh rơi toàn bộ nghiệp vụ cũ khi chuyển từ 2 tham số
-- sang 8 tham số. Phát hiện lúc nghiệm thu D3 cho V3 (task #144), theo dõi
-- ở task #150. Đã ĐO RED trước khi vá (rls-smoke.mjs, đúng luật D3):
--   FAIL 44-46: tiệm mới không có pipeline/stage mặc định
--   FAIL 47-48: tiệm mới không có lead_sources/lost_reasons mặc định
--   FAIL 49:    thiếu pg_temp cuối search_path
--   FAIL 64/70: gọi create_tenant lần 2 KHÔNG bị chặn — hạn mức tiệm vô tác dụng
--
-- NGHIÊM TRỌNG, ĐANG SỐNG: mọi tiệm đăng ký từ 14/08 (lúc #123 áp) tới giờ
-- đều KHÔNG có pipeline/giai đoạn/nguồn khách/lý do thua mặc định (CRM rỗng
-- hoàn toàn), VÀ tài khoản gọi thẳng RPC (bỏ qua nút bấm) tạo được tiệm
-- không giới hạn (chốt hạn mức chỉ còn ở tầng UI — trái invariant 1: quyền
-- phải chặn ở DB, UI chỉ là gợi ý). VÀ nếu chủ tiệm ĐANG có sẵn 1 tiệm tạo
-- thêm tiệm thứ hai, profiles.active_tenant_id không được đặt lại — đúng lỗi
-- chí mạng "chuỗi chi nhánh" đã vá 1 lần (migration #66): JWT sau
-- refreshSession() vẫn mang tiệm CŨ, apply_industry_pack() ghi ngành vừa
-- chọn NHẦM lên tiệm CŨ.
--
-- GỐC: `create or replace function public.create_tenant(p_name, p_slug, ...
-- 6 tham số mới)` — chữ ký (8 tham số) KHÁC bản cũ (2 tham số), Postgres tạo
-- hàm CHỒNG mới thay vì thay thân hàm cũ, và bản mới đó viết thân hàm THEO
-- TRÍ NHỚ thay vì đọc file thật — đánh rơi cả khối nghiệp vụ. Bài học y hệt
-- migration #125, lần này rơi vào đúng hàm nhạy nhất (tạo tiệm), 3 ngày
-- không ai phát hiện vì UI vẫn "chạy được" — chỉ là rỗng và sai âm thầm.
--
-- VÁ: giữ NGUYÊN phần ngữ cảnh đăng ký của #123 (set_config ifan.signup_ctx
-- cho trigger tenants_notify_signup đọc — ADR-0007 mục 12b), GHÉP LẠI đầy đủ
-- thân hàm bản 2 tham số — đối chiếu từng dòng với file gốc, không viết lại
-- theo trí nhớ. Bản MỚI NHẤT trước #123 là migration #80 (V1.5 storefront,
-- KHÔNG PHẢI #66 — #66 chỉ có 4 lead_sources, #80 thêm "Form/Landing" thành
-- 5; suýt chép sót do dừng ở #66 quá sớm, rls-smoke.mjs bắt được ngay —
-- FAIL 47 "được 4" thay vì 5 — trước khi kịp coi là xong). Cùng chữ ký (8
-- tham số) nên CREATE OR REPLACE thay thân trực tiếp, không cần DROP.
-- ============================================================

create or replace function public.create_tenant(
  p_name text,
  p_slug text,
  p_ip text default null,
  p_city text default null,
  p_region text default null,
  p_country text default null,
  p_user_agent text default null,
  p_referrer text default null
) returns uuid
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
  v_email text;
  v_pipeline uuid;
  v_max int;
  v_joined int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Postgres đã có sẵn JWT của người đang tạo tiệm (security definer vẫn đọc
  -- được auth.uid()/auth.users vì hàm chạy quyền chủ hàm) — không cần Next.js
  -- truyền email riêng, tránh D1 (một địa chỉ khai một lần).
  select email into v_email from auth.users where id = auth.uid();

  -- Transaction-local — TỰ MẤT khi giao dịch kết thúc, không rò sang câu
  -- lệnh kế tiếp. true = phạm vi giao dịch (đúng khuôn ifan.wf_depth/livechat_key).
  perform set_config('ifan.signup_ctx', jsonb_build_object(
    'email', v_email, 'ip', p_ip, 'city', p_city, 'region', p_region,
    'country', p_country, 'user_agent', p_user_agent, 'referrer', p_referrer
  )::text, true);

  perform pg_advisory_xact_lock(hashtext('create_tenant:' || auth.uid()::text));
  v_max := coalesce(
    (select l.max_tenants from public.tenant_creation_limits l where l.user_id = auth.uid()),
    1);
  -- Sửa #66: cùng luật với can_create_tenant() — chỉ đếm tiệm mình làm chủ,
  -- không tính tiệm được mời vào hay tiệm mẫu đang tham quan.
  select count(*) into v_joined from public.tenant_members tm
    join public.tenants t on t.id = tm.tenant_id
    where tm.user_id = auth.uid() and tm.status = 'active'
      and tm.role = 'owner' and t.is_sample = false;
  if v_joined >= v_max then
    raise exception 'tenant_limit_reached';
  end if;

  insert into public.tenants (name, slug, trial_ends_at)
    values (p_name, lower(p_slug), now() + interval '30 days')
    returning id into v_tenant;
  insert into public.tenant_members (tenant_id, user_id, role, joined_at)
    values (v_tenant, auth.uid(), 'owner', now());

  -- Sửa #66 (chốt lỗi chí mạng đã tìm thấy khi thiết kế): tiệm vừa tạo phải
  -- thành "tiệm đang chọn" NGAY trong cùng giao dịch — thiếu bước này thì
  -- refreshSession() ở tầng web vẫn mang claim tiệm CŨ khi tài khoản đã có
  -- sẵn tiệm khác (chuỗi chi nhánh), và apply_industry_pack() gọi ngay sau đó
  -- sẽ ghi đè gói ngành lên NHẦM tiệm.
  update public.profiles set active_tenant_id = v_tenant, updated_at = now()
    where user_id = auth.uid();

  insert into public.pipelines (tenant_id, name, is_default, position)
    values (v_tenant, 'Bán hàng', true, 0)
    returning id into v_pipeline;
  insert into public.pipeline_stages
    (tenant_id, pipeline_id, name, position, kind, win_probability, i18n_key) values
    (v_tenant, v_pipeline, 'Mới',         0, 'open', 10,  'stage.new'),
    (v_tenant, v_pipeline, 'Đang tư vấn', 1, 'open', 30,  'stage.consulting'),
    (v_tenant, v_pipeline, 'Hẹn lịch',    2, 'open', 60,  'stage.scheduled'),
    (v_tenant, v_pipeline, 'Đã chốt',     3, 'won', 100,  'stage.won'),
    (v_tenant, v_pipeline, 'Quay lại',    4, 'open', 20,  'stage.returning'),
    (v_tenant, v_pipeline, 'Thua',        5, 'lost', 0,   'stage.lost');

  insert into public.lost_reasons (tenant_id, name, position, i18n_key) values
    (v_tenant, 'Giá cao',             0, 'lostReason.price'),
    (v_tenant, 'Chọn đối thủ',        1, 'lostReason.competitor'),
    (v_tenant, 'Không còn nhu cầu',   2, 'lostReason.noNeed'),
    (v_tenant, 'Không liên lạc được', 3, 'lostReason.unreachable'),
    (v_tenant, 'Khác',                4, 'lostReason.other');

  -- Migration #80 (V1.5): thêm "Form/Landing" — nguồn hệ thống thứ 5.
  insert into public.lead_sources (tenant_id, name, channel_type, is_system, i18n_key) values
    (v_tenant, 'Zalo',        'zalo',     true, 'source.zalo'),
    (v_tenant, 'Facebook',    'facebook', true, 'source.facebook'),
    (v_tenant, 'Giới thiệu',  'referral', true, 'source.referral'),
    (v_tenant, 'Form/Landing','website',  true, 'source.form'),
    (v_tenant, 'Khác',        'other',    true, 'source.other');

  perform public.wf_seed_playbooks(v_tenant);
  perform public.sla_seed_policies(v_tenant);
  insert into public.tier_rules (tenant_id) values (v_tenant);

  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid(), 'platform');
  return v_tenant;
end $$;

grant execute on function public.create_tenant(text, text, text, text, text, text, text, text) to authenticated;
revoke execute on function public.create_tenant(text, text, text, text, text, text, text, text) from anon, public;
