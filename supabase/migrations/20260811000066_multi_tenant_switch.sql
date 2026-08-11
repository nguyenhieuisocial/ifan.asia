-- ============================================================
-- iFan.asia — Migration #66: Một tài khoản, nhiều tiệm — cơ chế
-- "tiệm đang chọn" (ADR-0005, docs/adr/0005-nhieu-tiem-mot-tai-khoan.md).
--
-- Đã ĐO THẬT (không suy đoán): Custom Access Token Hook đang bật trên
-- production, claim app_metadata.tenant_id có mặt trong JWT thật. Toàn bộ
-- migration này bám theo claim đó — KHÔNG đổi sang cơ chế khác.
--
-- Bất biến an toàn (ADR-0005 mục 3.2): claim tenant_id CHỈ được mang giá trị
-- là tiệm mà người đó đang là thành viên status='active'. profiles.active_tenant_id
-- là GỢI Ý ưu tiên, không phải nguồn quyền — hook luôn resolve qua
-- tenant_members, không tin con trỏ một cách mù quáng.
-- ============================================================

-- ---------- A. Nơi lưu "tiệm đang chọn" ----------
-- profiles khoá chính là user_id (không phải id) — đã kiểm information_schema.
alter table public.profiles
  add column if not exists active_tenant_id uuid references public.tenants(id) on delete set null;

-- ---------- B. Hook JWT: ưu tiên tiệm đang chọn, rơi về tiệm cũ nhất nếu
-- không hợp lệ nữa (bị gỡ/tiệm mẫu vừa thoát) ----------
create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable
security definer set search_path = public, pg_temp as $$
declare
  claims jsonb;
  v_uid uuid := (event ->> 'user_id')::uuid;
  m record;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  select tm.tenant_id, tm.role into m
    from public.tenant_members tm
    left join public.profiles p on p.user_id = tm.user_id
    where tm.user_id = v_uid and tm.status = 'active'
    order by (tm.tenant_id = p.active_tenant_id) desc nulls last, tm.created_at asc
    limit 1;
  if found then
    claims := jsonb_set(
      claims, '{app_metadata}',
      coalesce(claims -> 'app_metadata', '{}'::jsonb)
        || jsonb_build_object('tenant_id', m.tenant_id, 'role', m.role),
      true
    );
  end if;
  return jsonb_set(event, '{claims}', claims, true);
end $$;

-- ---------- C. Nhánh dự phòng (chưa bật hook / hook lỗi) — PHẢI cùng thứ tự
-- ưu tiên với hook ở trên, không thì 2 môi trường hành xử khác nhau (R3) ----------
create or replace function public.current_tenant_id() returns uuid
language sql stable
security definer set search_path = public, pg_temp as $$
  select coalesce(
    nullif(((auth.jwt() -> 'app_metadata') ->> 'tenant_id'), '')::uuid,
    (select tm.tenant_id from public.tenant_members tm
      left join public.profiles p on p.user_id = tm.user_id
      where tm.user_id = auth.uid() and tm.status = 'active'
      order by (tm.tenant_id = p.active_tenant_id) desc nulls last, tm.created_at asc
      limit 1)
  )
$$;

create or replace function public.app_role() returns text
language sql stable
security definer set search_path = public, pg_temp as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata') ->> 'role',
    (select tm.role::text from public.tenant_members tm
      left join public.profiles p on p.user_id = tm.user_id
      where tm.user_id = auth.uid() and tm.status = 'active'
      order by (tm.tenant_id = p.active_tenant_id) desc nulls last, tm.created_at asc
      limit 1)
  )
$$;

-- ---------- D. Đổi tiệm đang chọn ----------
create or replace function public.switch_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select exists(
    select 1 from public.tenant_members
    where tenant_id = p_tenant_id and user_id = v_uid and status = 'active'
  ) into v_ok;
  if not v_ok then raise exception 'not_a_member'; end if;

  update public.profiles set active_tenant_id = p_tenant_id, updated_at = now()
    where user_id = v_uid;

  perform public.record_audit_log('tenant', p_tenant_id, 'switched', null);
end;
$$;
grant execute on function public.switch_tenant(uuid) to authenticated;
revoke execute on function public.switch_tenant(uuid) from anon, public;

-- ---------- E. Liệt kê tiệm của tôi — RLS tenant_members/tenants chỉ cho thấy
-- ĐÚNG tiệm đang mở (current_tenant_id()), nên không có hàm này thì màn chuyển
-- tiệm không vẽ được. Rủi ro rò rỉ cao nhất của cả đợt: KHÔNG nhận tham số nào
-- từ client, chỉ đọc auth.uid() của chính phiên gọi. ----------
create or replace function public.my_tenants()
returns table(
  tenant_id uuid, name text, slug text, industry text,
  role text, is_sample boolean, is_active boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.name, t.slug, t.industry, tm.role::text, t.is_sample,
         t.id = public.current_tenant_id()
  from public.tenant_members tm
  join public.tenants t on t.id = tm.tenant_id
  where tm.user_id = auth.uid() and tm.status = 'active'
  order by t.is_sample asc, tm.created_at asc
$$;
comment on function public.my_tenants() is
  'ADR-0005: danh sách tiệm của CHÍNH người gọi (auth.uid(), không tham số) — dùng cho menu chuyển tiệm. is_active so khớp current_tenant_id() thật, không đoán qua active_tenant_id (tránh 2 nơi cùng luật lệch nhau).';
grant execute on function public.my_tenants() to authenticated;
revoke execute on function public.my_tenants() from anon, public;

-- ---------- F. can_create_tenant()/create_tenant(): hạn mức nói về tiệm mình
-- LÀM CHỦ, không phải tiệm được mời vào hay tiệm mẫu đang tham quan. Trước đây
-- đếm MỌI dòng tenant_members → nhân viên/khách tham quan bị tính hết hạn mức
-- oan (ADR-0005 mục 3.6, mục C1 bản kiểm kê 11/08). Hai hàm phải cùng một luật. ----------
create or replace function public.can_create_tenant() returns boolean
language sql stable
security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
     and (select count(*) from public.tenant_members tm
            join public.tenants t on t.id = tm.tenant_id
          where tm.user_id = auth.uid() and tm.status = 'active'
            and tm.role = 'owner' and t.is_sample = false)
       < coalesce((select l.max_tenants from public.tenant_creation_limits l
                    where l.user_id = auth.uid()), 1)
$$;
comment on function public.can_create_tenant() is
  'Tài khoản đang đăng nhập còn mở thêm được tiệm không (migration #41, sửa #66: chỉ đếm tiệm mình LÀM CHỦ, is_sample=false). Chỉ trả đúng/sai về chính mình.';

create or replace function public.create_tenant(p_name text, p_slug text)
returns uuid
language plpgsql
security definer set search_path = public, pg_temp as $function$
declare
  v_tenant uuid;
  v_pipeline uuid;
  v_max int;
  v_joined int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

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

  insert into public.lead_sources (tenant_id, name, channel_type, is_system, i18n_key) values
    (v_tenant, 'Zalo',       'zalo',     true, 'source.zalo'),
    (v_tenant, 'Facebook',   'facebook', true, 'source.facebook'),
    (v_tenant, 'Giới thiệu', 'referral', true, 'source.referral'),
    (v_tenant, 'Khác',       'other',    true, 'source.other');

  perform public.wf_seed_playbooks(v_tenant);
  perform public.sla_seed_policies(v_tenant);
  insert into public.tier_rules (tenant_id) values (v_tenant);

  insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, source_module)
    values (v_tenant, 'tenant.created', 'tenant', v_tenant::text,
            jsonb_build_object('name', p_name, 'slug', lower(p_slug)), auth.uid(), 'platform');
  return v_tenant;
end $function$;

-- ---------- G. accept_invitation(): vá lỗi đang sống — người đã có tiệm khác
-- nhận lời mời tiệm thứ hai trước đây bị vào "thành công" nhưng claim vẫn mang
-- tiệm cũ, không cách nào vào tiệm mới. Nay đặt tiệm vừa nhận làm tiệm đang
-- chọn NGAY trong giao dịch (ADR-0005 mục 6.2 hạng CAO). ----------
create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  inv public.invitations;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid_token'; end if;

  select * into inv from public.invitations
    where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
    for update;
  if inv.id is null then raise exception 'invalid_token'; end if;
  if inv.status <> 'pending' then raise exception 'invitation_used'; end if;
  if inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = inv.id;
    raise exception 'invitation_expired';
  end if;

  select email into v_email from auth.users where id = v_uid;
  if lower(v_email) is distinct from lower(inv.email::text) then
    raise exception 'invitation_email_mismatch';
  end if;

  update public.invitations set status = 'accepted' where id = inv.id;

  insert into public.tenant_members (tenant_id, user_id, role, status, invited_by, joined_at)
    values (inv.tenant_id, v_uid, inv.role, 'active', inv.invited_by, now())
  on conflict (tenant_id, user_id) do update
    set status = 'active', role = excluded.role, joined_at = now();

  -- Sửa #66: nếu không đặt thành tiệm đang chọn, người đã có tiệm A nhận lời
  -- mời vào tiệm B sẽ "nhận thành công" nhưng claim vẫn mang tiệm A — bấm vào
  -- không thấy gì đổi, ghế tiệm B vẫn bị trừ. Lỗi này đã sống thật trên production.
  update public.profiles set active_tenant_id = inv.tenant_id, updated_at = now()
    where user_id = v_uid;

  return jsonb_build_object('tenant_id', inv.tenant_id, 'role', inv.role);
end $$;

-- ---------- H. Tiệm mẫu: bỏ chốt "đã có tiệm thật" (ADR-0005 mục 3.7 —
-- founder chọn phương án cho phép chuyển qua lại, không còn cần chốt tạm này) ----------
create or replace function public.enter_sample_tenant(p_industry text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select id into v_tenant from public.tenants where industry = p_industry and is_sample = true;
  if v_tenant is null then raise exception 'no_sample_tenant'; end if;

  -- Đổi tour: rời tiệm mẫu cũ (nếu có) trước khi vào tiệm mẫu mới — luôn đúng
  -- 1 tour đang mở cho mỗi người, không lẫn dữ liệu 2 tiệm mẫu.
  delete from public.tenant_members tm
    using public.tenants t
    where tm.tenant_id = t.id and tm.user_id = v_uid and t.is_sample = true;

  insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
    values (v_tenant, v_uid, 'viewer', 'active', now());

  update public.profiles set active_tenant_id = v_tenant, updated_at = now()
    where user_id = v_uid;

  return v_tenant;
end;
$$;

create or replace function public.exit_sample_tenant()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from public.tenant_members tm
    using public.tenants t
    where tm.tenant_id = t.id and tm.user_id = v_uid
      and tm.role = 'viewer' and t.is_sample = true;

  -- Trả về mặc định (rơi về tiệm thật cũ nhất qua hook, hoặc /onboarding nếu
  -- chưa có tiệm nào) — không để trỏ vào dòng membership vừa xoá ở trên.
  update public.profiles set active_tenant_id = null, updated_at = now() where user_id = v_uid;
end;
$$;

comment on column public.profiles.active_tenant_id is
  'ADR-0005: tiệm người dùng đang chọn xem — GỢI Ý ưu tiên cho custom_access_token_hook(), KHÔNG phải nguồn quyền. Hook luôn resolve qua tenant_members.status=''active'', tự rơi về tiệm cũ nhất nếu con trỏ này trỏ vào tiệm không còn hợp lệ.';
