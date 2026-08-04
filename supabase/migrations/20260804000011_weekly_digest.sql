-- ============================================================
-- iFan.asia — Migration #11: Bản tin tuần đợt 0 + RPC Tổng quan
-- Spec: "07 Dashboard và Báo cáo" (lát cắt mỏng đợt 0 — thuần rule-based,
-- KHÔNG phụ thuộc AI; lớp nhận xét AI đính vào sau khi có key).
--
-- tenant_weekly_digests            -- 1 dòng/tenant/tuần, payload jsonb số liệu
-- compute_weekly_digest()          -- definer: tính + upsert digest 1 tenant 1 tuần
-- generate_weekly_digests()       -- definer: chạy cho MỌI tenant (cron gọi)
-- dashboard_overview()             -- INVOKER (RLS user thật): mọi số liệu màn
--                                     Tổng quan trong 1 round-trip
-- cron 'weekly-digest' thứ 2 06:00 VN (= CN 23:00 UTC — pg_cron chạy UTC,
--   tiền lệ migration #8: '0 20 * * *' = 03:00 VN)
-- Backfill: tính ngay tuần hiện tại (dở dang) cho tenant sẵn có để card
--   Bản tin tuần có số liệu từ lần mở đầu tiên.
-- Chuẩn: theo migration #4/#5/#10 — timestamptz, definer set search_path,
--        revoke public trước khi grant đích danh, policy bọc (select ...).
-- ============================================================

-- ---------- bảng digest ----------

create table public.tenant_weekly_digests (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  week_start date not null, -- thứ 2 đầu tuần theo giờ VN
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), -- lần tính gần nhất
  primary key (tenant_id, week_start)
);
alter table public.tenant_weekly_digests enable row level security;
-- Đọc: mọi member cùng tenant. KHÔNG policy ghi — dữ liệu chỉ sinh qua
-- compute_weekly_digest (definer) / cron, client không tự sửa số liệu.
create policy tenant_weekly_digests_select on public.tenant_weekly_digests
  for select using (tenant_id = (select public.current_tenant_id()));

-- ---------- tính digest 1 tenant / 1 tuần ----------
-- Cửa sổ [week_start 00:00 VN, +7 ngày). Định nghĩa số (đợt 0):
--   conversations_total      = hội thoại CÓ tin nhắn trong tuần (distinct)
--   messages_in / messages_out = số tin theo direction trong tuần
--   new_contacts             = khách tạo trong tuần (chưa xóa mềm)
--   hot_contacts             = khách lead_score ≥ 70 tại thời điểm tính (snapshot)
--   unanswered_end_of_week   = hội thoại open mà tin CUỐI là của khách
--                              (last_user_message_at ≥ last_message_at) — snapshot

create or replace function public.compute_weekly_digest(p_tenant uuid, p_week_start date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_from timestamptz := (p_week_start::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_to   timestamptz := ((p_week_start + 7)::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_payload jsonb;
begin
  select jsonb_build_object(
    'conversations_total', (select count(distinct m.conversation_id) from messages m
        where m.tenant_id = p_tenant and m.sent_at >= v_from and m.sent_at < v_to),
    'messages_in', (select count(*) from messages m
        where m.tenant_id = p_tenant and m.direction = 'in'
          and m.sent_at >= v_from and m.sent_at < v_to),
    'messages_out', (select count(*) from messages m
        where m.tenant_id = p_tenant and m.direction = 'out'
          and m.sent_at >= v_from and m.sent_at < v_to),
    'new_contacts', (select count(*) from contacts c
        where c.tenant_id = p_tenant and c.deleted_at is null
          and c.created_at >= v_from and c.created_at < v_to),
    'hot_contacts', (select count(*) from contacts c
        where c.tenant_id = p_tenant and c.deleted_at is null and c.lead_score >= 70),
    'unanswered_end_of_week', (select count(*) from conversations c
        where c.tenant_id = p_tenant and c.status = 'open'
          and c.last_user_message_at is not null
          and c.last_user_message_at >= coalesce(c.last_message_at, c.last_user_message_at))
  ) into v_payload;

  insert into tenant_weekly_digests (tenant_id, week_start, payload)
  values (p_tenant, p_week_start, v_payload)
  on conflict (tenant_id, week_start)
  do update set payload = excluded.payload, created_at = now();

  return v_payload;
end;
$$;

revoke execute on function public.compute_weekly_digest(uuid, date) from public, anon, authenticated;

-- ---------- chạy cho mọi tenant (cron thứ 2 06:00 VN) ----------
-- Mặc định: tuần VỪA KẾT THÚC (thứ 2 tuần trước, vì cron chạy sáng thứ 2).

create or replace function public.generate_weekly_digests(p_week_start date default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_week date := coalesce(
    p_week_start,
    (date_trunc('week', (now() at time zone 'Asia/Ho_Chi_Minh')))::date - 7);
  v_n int := 0;
  r record;
begin
  for r in select id from tenants loop
    perform compute_weekly_digest(r.id, v_week);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.generate_weekly_digests(date) from public, anon, authenticated;

-- CN 23:00 UTC = thứ 2 06:00 VN
select cron.schedule('weekly-digest', '0 23 * * 0', $$select public.generate_weekly_digests()$$);

-- ---------- RPC màn Tổng quan (đợt 0) ----------
-- SECURITY INVOKER: chạy bằng JWT người dùng → RLS tự khoanh tenant, không cần
-- lọc tenant_id thủ công. 1 lần gọi = đủ số liệu 4 ô + 2 danh sách + digest.
-- Định nghĩa ô:
--   open_conversations = hội thoại status 'open'
--   unanswered         = open + tin cuối là của khách (như digest)
--   new_contacts_7d    = khách tạo trong 7 ngày qua
--   hot_contacts       = khách lead_score ≥ 70
-- need_reply: 5 hội thoại chờ trả lời LÂU nhất. hot_followup: 5 khách nóng
-- không có tương tác ≥ 3 ngày (last_interaction_at cũ hoặc null).

create or replace function public.dashboard_overview()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'open_conversations', (select count(*) from conversations where status = 'open'),
    'unanswered', (select count(*) from conversations c
        where c.status = 'open' and c.last_user_message_at is not null
          and c.last_user_message_at >= coalesce(c.last_message_at, c.last_user_message_at)),
    'new_contacts_7d', (select count(*) from contacts
        where deleted_at is null and created_at >= now() - interval '7 days'),
    'hot_contacts', (select count(*) from contacts
        where deleted_at is null and lead_score >= 70),
    'channels_count', (select count(*) from channels),
    'contacts_count', (select count(*) from contacts where deleted_at is null),
    'need_reply', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select c.id,
               coalesce(ct.full_name, c.external_user_id) as name,
               ch.type as channel_type,
               ch.display_name as channel_name,
               c.last_user_message_at as waiting_since
        from conversations c
        join channels ch on ch.id = c.channel_id
        left join contacts ct on ct.id = c.contact_id
        where c.status = 'open' and c.last_user_message_at is not null
          and c.last_user_message_at >= coalesce(c.last_message_at, c.last_user_message_at)
        order by c.last_user_message_at asc
        limit 5) x),
    'hot_followup', (select coalesce(jsonb_agg(y), '[]'::jsonb) from (
        select id, full_name, lead_score, last_interaction_at
        from contacts
        where deleted_at is null and lead_score >= 70
          and (last_interaction_at is null or last_interaction_at < now() - interval '3 days')
        order by lead_score desc, last_interaction_at asc nulls first
        limit 5) y),
    'digest', (select to_jsonb(d) from (
        select week_start, payload, created_at
        from tenant_weekly_digests
        order by week_start desc
        limit 1) d)
  )
$$;

revoke execute on function public.dashboard_overview() from public, anon;
grant execute on function public.dashboard_overview() to authenticated;

-- ---------- backfill: tuần hiện tại (dở dang) cho tenant sẵn có ----------

select public.generate_weekly_digests(
  (date_trunc('week', (now() at time zone 'Asia/Ho_Chi_Minh')))::date);
