-- ============================================================
-- iFan.asia — Migration #77: V1b bước 9 — đường GHI cho "Cần giúp?" +
-- phiên hỗ trợ chỉ-đọc (ADR-0006, docs/adr/0006-phien-ho-tro-chi-doc.md).
-- Schema (bảng help_requests/support_sessions, cột is_support/expires_at
-- trên tenant_members) đã dựng từ migration #69 — đợt này NỐI ĐƯỜNG GHI,
-- đúng thứ tự mục 36.3 bước 9: làm CUỐI vì đụng quyền hạn.
--
-- Không sửa current_tenant_id()/app_role(), không thêm chính sách RLS nào
-- (đúng cấm ở ADR-0006 mục 3(A)/mục 8) — mọi đường ghi cross-tenant đi qua
-- RPC SECURITY DEFINER có kiểm is_platform_admin() ở dòng đầu.
-- ============================================================

-- ---------- Lớp bịt Lỗ 1 (ADR-0006 mục 5): hỗ trợ không ăn ghế khách ----------

create or replace function public.tenant_seats_used(p_tenant uuid)
returns bigint
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select (select count(*) from public.tenant_members
            where tenant_id = p_tenant and status = 'active' and is_support = false)
       + (select count(*) from public.invitations
            where tenant_id = p_tenant and status = 'pending' and expires_at > now())
$$;

create or replace function public.tenant_seats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_limit bigint;
  v_members bigint;
  v_pending bigint;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if not public.can_read_billing(v_tenant) then raise exception 'forbidden'; end if;
  v_limit := public.tenant_seat_limit(v_tenant);
  select count(*) into v_members from public.tenant_members
    where tenant_id = v_tenant and status = 'active' and is_support = false;
  select count(*) into v_pending from public.invitations
    where tenant_id = v_tenant and status = 'pending' and expires_at > now();
  return jsonb_build_object(
    'members', v_members,
    'pending', v_pending,
    'used', v_members + v_pending,
    'limit', v_limit,
    'over_limit', v_limit is not null and (v_members + v_pending) > v_limit
  );
end $$;

-- Trigger dùng chung cho tenant_members VÀ invitations (tg_table_name rẽ nhánh) —
-- invitations KHÔNG có cột is_support, nên phải if lồng riêng, không được gộp
-- vào MỘT biểu thức "tg_table_name = 'x' and new.is_support": SQL không đảm bảo
-- thứ tự đánh giá, đụng new.is_support trên bảng invitations sẽ vỡ ngay.
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := new.tenant_id;
  v_busy text := case when tg_table_name = 'tenant_members' then 'active' else 'pending' end;
  v_takes boolean;
  v_limit bigint;
  v_used bigint;
begin
  if tg_table_name = 'tenant_members' then
    if new.is_support then return new; end if;
  end if;

  if tg_op = 'INSERT' then
    v_takes := new.status = v_busy;
  else
    v_takes := new.status = v_busy and old.status is distinct from v_busy;
  end if;

  if not v_takes then return new; end if;

  v_limit := public.tenant_seat_limit(v_tenant);
  if v_limit is null then return new; end if;

  v_used := public.tenant_seats_used(v_tenant);
  if v_used >= v_limit then
    raise exception 'seat_limit_reached'
      using detail = format('used=%s limit=%s', v_used, v_limit);
  end if;
  return new;
end $$;

-- ---------- Lớp bịt Lỗ 2 (ADR-0006 mục 5): hết hạn thì hook KHÔNG cấp claim ----------
-- Thêm điều kiện SIẾT CHẶT hơn (không phải nới rộng) — mọi hàng cũ có
-- expires_at = NULL không đổi hành vi (đã kiểm bằng ca #5 trong rls-smoke).

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
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
      and (tm.expires_at is null or tm.expires_at > now())
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

-- ---------- Ràng buộc cứng cho support_sessions (mục 36.9 D) ----------

alter table public.support_sessions
  add constraint support_sessions_reason_len check (char_length(trim(reason)) >= 10);

alter table public.support_sessions
  add constraint support_sessions_expires_cap check (expires_at <= started_at + interval '60 minutes');

-- ---------- Phát sự kiện (mục 36.11, đã khai EVENT_CATALOG.md dòng 130-132) ----------

create or replace function public.help_requests_emit_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.wf_emit(
    new.tenant_id, 'help_request.created', 'help_request', new.id::text,
    jsonb_build_object('message', new.message, 'allow_screen_view', new.allow_screen_view));
  return new;
end $$;

drop trigger if exists help_requests_emit_event_trigger on public.help_requests;
create trigger help_requests_emit_event_trigger
  after insert on public.help_requests
  for each row execute function public.help_requests_emit_event();

create or replace function public.support_sessions_emit_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.wf_emit(
      new.tenant_id, 'support_session.started', 'support_session', new.id::text,
      jsonb_build_object('admin_user_id', new.admin_user_id, 'reason', new.reason, 'expires_at', new.expires_at));
    return new;
  end if;

  if new.ended_at is not null and old.ended_at is null then
    perform public.wf_emit(
      new.tenant_id, 'support_session.ended', 'support_session', new.id::text,
      jsonb_build_object('ended_by', new.ended_by));
  end if;
  return new;
end $$;

drop trigger if exists support_sessions_emit_event_trigger on public.support_sessions;
create trigger support_sessions_emit_event_trigger
  after insert or update on public.support_sessions
  for each row execute function public.support_sessions_emit_event();

-- ---------- RPC mở phiên hỗ trợ ----------
-- SECURITY DEFINER có chủ đích: đây LÀ cửa ghi xuyên-tenant duy nhất được phép
-- (ADR-0006 quyết định 4) — is_platform_admin() kiểm ngay dòng đầu, lý do bắt
-- buộc >=10 ký tự (ràng buộc CSDL phía trên đảm bảo lần nữa), hạn tối đa 60
-- phút. record_audit ghi TRỰC TIẾP với tenant_id = tiệm ĐÍCH (không dùng
-- record_audit_log() dùng chung — hàm đó đọc current_tenant_id() của người
-- GỌI, mà quản trị nền tảng không có tenant nào đang mở).
create or replace function public.open_support_session(
  p_tenant_id uuid,
  p_reason text,
  p_minutes int default 60
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_reason text := trim(coalesce(p_reason, ''));
  v_minutes int := coalesce(p_minutes, 60);
  v_expires timestamptz;
  v_help_request_id uuid;
  v_session_id uuid;
begin
  if v_admin is null then raise exception 'not_authenticated'; end if;
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_tenant_id is null or not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'tenant_not_found';
  end if;
  if char_length(v_reason) < 10 then raise exception 'reason_required'; end if;
  if v_minutes < 1 or v_minutes > 60 then raise exception 'invalid_duration'; end if;

  v_expires := now() + (v_minutes || ' minutes')::interval;

  -- Đang có phiên chưa đóng của CHÍNH admin này trên CHÍNH tiệm này (bỏ ngang,
  -- không bấm Dừng ngay) → đóng lại trước, không để 2 dòng "đang mở" chồng nhau.
  update public.support_sessions
    set ended_at = now(), ended_by = 'admin'
    where tenant_id = p_tenant_id and admin_user_id = v_admin and ended_at is null;

  -- Có yêu cầu "Cần giúp?" chưa xử lý thì gắn kèm + chuyển "đang xử" ngay —
  -- đúng câu "đã cho phép xem màn hình" trên thẻ design.
  select id into v_help_request_id from public.help_requests
    where tenant_id = p_tenant_id and status = 'open'
    order by created_at asc
    limit 1;

  insert into public.tenant_members (tenant_id, user_id, role, status, is_support, expires_at, joined_at)
  values (p_tenant_id, v_admin, 'viewer', 'active', true, v_expires, now())
  on conflict (tenant_id, user_id) do update
    set status = 'active', role = 'viewer', is_support = true, expires_at = v_expires;

  insert into public.support_sessions (tenant_id, admin_user_id, reason, help_request_id, started_at, expires_at)
  values (p_tenant_id, v_admin, v_reason, v_help_request_id, now(), v_expires)
  returning id into v_session_id;

  insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
    values (p_tenant_id, 'support_session', v_session_id, v_admin, 'opened',
      jsonb_build_object('reason', v_reason, 'expires_at', v_expires, 'help_request_id', v_help_request_id));

  return v_session_id;
end $$;

-- ---------- RPC đóng phiên hỗ trợ ----------
-- Gọi được bởi CHÍNH quản trị viên đang xem (ended_by='admin') HOẶC chủ
-- tiệm/quản trị tiệm đó bấm "Dừng ngay" (ended_by='tenant') — người trả tiền
-- phải cắt được quyền xem bất cứ lúc nào, không phải đi xin (ADR-0006 mục 6).
create or replace function public.end_support_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_ended_by text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_row from public.support_sessions where id = p_session_id;
  if not found then raise exception 'session_not_found'; end if;
  if v_row.ended_at is not null then return; end if; -- đã đóng rồi — coi như thành công (idempotent)

  if v_row.admin_user_id = v_uid then
    v_ended_by := 'admin';
  elsif exists (
    select 1 from public.tenant_members
      where tenant_id = v_row.tenant_id and user_id = v_uid and status = 'active'
        and is_support = false and role in ('owner', 'admin')
  ) then
    v_ended_by := 'tenant';
  else
    raise exception 'forbidden';
  end if;

  update public.support_sessions
    set ended_at = now(), ended_by = v_ended_by
    where id = p_session_id;

  update public.tenant_members
    set status = 'removed'
    where tenant_id = v_row.tenant_id and user_id = v_row.admin_user_id and is_support = true;

  insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
    values (v_row.tenant_id, 'support_session', p_session_id, v_uid, 'ended',
      jsonb_build_object('ended_by', v_ended_by));
end $$;

-- ---------- Việc nền: quét phiên hết hạn mà chưa đóng sạch ----------
-- Đây là NỬA-SQL của lớp bịt thứ 4 (ADR-0006 mục 5): thu hồi NGAY hàng
-- tenant_members (chặn được refreshSession/token MỚI từ giờ trở đi) + đóng sổ
-- support_sessions đúng sự thật. KHÔNG ép đăng xuất JWT CŨ còn hiệu lực qua
-- Admin API — hạ tầng hiện tại không có cầu nối cron→Admin API (pg_net đã khoá
-- theo chốt chống SSRF #36, chưa có Edge Function/Vercel Cron nào dựng sẵn).
-- Đây LÀ khoảng hở còn lại ADR-0006 đã nói thẳng ("cửa sổ ≤ thời gian sống
-- JWT") — không tự vá bằng hạ tầng mới chưa ai quyết, ghi lại làm việc theo dõi
-- thay vì âm thầm bỏ qua.
create or replace function public.support_sessions_sweep_expired()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  with expired as (
    update public.support_sessions
      set ended_at = now(), ended_by = 'expiry'
      where ended_at is null and expires_at <= now()
      returning tenant_id, admin_user_id
  )
  update public.tenant_members tm
    set status = 'removed'
    from expired e
    where tm.tenant_id = e.tenant_id and tm.user_id = e.admin_user_id and tm.is_support = true;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Dọn yêu cầu "Cần giúp?" im lặng quá 30 ngày (mục 36.12A — một trong 3 đường
-- đóng hợp lệ, KHÔNG có reopened — cần giúp tiếp = yêu cầu mới).
create or replace function public.help_requests_close_stale()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  update public.help_requests
    set status = 'closed', closed_at = now()
    where status = 'open' and created_at < now() - interval '30 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

select cron.schedule(
  'support-sessions-sweep', '*/5 * * * *',
  $$select public.support_sessions_sweep_expired()$$
);

select cron.schedule(
  'help-requests-close-stale', '0 3 * * *',
  $$select public.help_requests_close_stale()$$
);

-- ---------- RPC cho /admin: danh sách "Cần giúp?" đang mở, kèm tên tiệm ----------
-- Đọc dữ liệu xuyên-tenant (tên tiệm + nội dung yêu cầu) nên ghi admin_audit_logs
-- giống hệt khuôn admin_tenant_health() (migration #28) — không phải chỗ tự chế.
create or replace function public.admin_pending_help_requests()
returns table (
  id uuid,
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  message text,
  allow_screen_view boolean,
  created_at timestamptz,
  has_active_session boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  insert into public.admin_audit_logs (actor_user_id, action, meta)
    values (auth.uid(), 'help_requests.read', '{}'::jsonb);

  return query
    select
      hr.id, hr.tenant_id, t.name, t.slug, hr.message, hr.allow_screen_view, hr.created_at,
      exists (
        select 1 from public.support_sessions ss
          where ss.tenant_id = hr.tenant_id and ss.ended_at is null and ss.expires_at > now()
      ) as has_active_session
    from public.help_requests hr
    join public.tenants t on t.id = hr.tenant_id
    where hr.status = 'open'
    order by hr.created_at asc;
end $$;
