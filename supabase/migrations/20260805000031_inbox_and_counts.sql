-- ============================================================
-- iFan.asia — Migration #31: Hộp thư có bộ lọc thật + đếm bằng COUNT
--
-- Nguồn: đợt rà soát toàn sản phẩm 05/08 ("23 lỗi"), mục 2 · 6 · 7.
--
-- VẤN ĐỀ 1 — "Chờ" rơi khỏi mọi bộ đếm và mọi cảnh báo.
--   `conversations.status` có 3 giá trị: 'open' (Đang mở) · 'pending' (Chờ) ·
--   'closed' (Đã đóng). Mọi chỗ đếm "hội thoại đang mở / chưa trả lời" đang viết
--   `status = 'open'`, nên hội thoại chuyển sang "Chờ" biến mất khỏi Tổng quan,
--   khỏi màn Hôm nay, khỏi bản tin tuần VÀ khỏi cảnh báo SLA (chính sách cài sẵn
--   ghim điều kiện {"status":"open"}). Khách nhắn vào hội thoại "Chờ" thì KHÔNG
--   màn nào báo — đúng lỗ thủng của lời hứa "không để khách nào bị quên".
--   SỬA: định nghĩa thống nhất "hội thoại chưa xong" = `status <> 'closed'`
--   (Đang mở + Chờ). Chỉ 'closed' mới ra khỏi mọi bộ đếm và mọi đồng hồ SLA.
--
-- VẤN ĐỀ 2 — "chưa trả lời" là một biểu thức so 2 CỘT với nhau
--   (`last_user_message_at >= coalesce(last_message_at, last_user_message_at)`),
--   PostgREST không lọc được kiểu đó, nên tầng web buộc phải tải danh sách về rồi
--   lọc trong bộ nhớ — sai ngay khi tiệm vượt trang đầu.
--   SỬA: cột SINH `is_unanswered` (generated always as … stored) ngay trên bảng
--   `conversations`. Biểu thức chỉ dùng cột CÙNG DÒNG nên là generated column hợp
--   lệ; Postgres tự tính, không trigger, không thể lệch với dữ liệu. Từ đó Hộp thư
--   lọc `is_unanswered=true` thẳng trong CSDL và phân trang được.
--   RLS: cột nằm trên chính bảng đã bật RLS ⇒ không mở thêm quyền nào.
--
-- VẤN ĐỀ 3 — đếm bằng cách tải hết bảng về (cắt 1000 dòng, sai âm thầm).
--   Thêm 3 hàm đếm chạy COUNT trong CSDL, security invoker để RLS của NGƯỜI GỌI
--   áp nguyên:
--     inbox_counts()          — số hội thoại từng bộ lọc của Hộp thư
--     contact_tier_counts()   — số khách mỗi hạng (màn Phân hạng khách)
--     sla_fired_counts(since) — số lần đã cảnh báo mỗi cam kết (màn Cam kết)
--
-- Chuẩn: theo migration #11/#16/#17 — security invoker cho hàm đọc, definer cho
--        worker, set search_path, revoke public/anon trước khi grant đích danh.
--        KHÔNG tạo bảng mới, KHÔNG sửa/nới bất kỳ policy nào đang có.
-- ============================================================

-- ============================================================
-- PHẦN A — CỘT SINH "chưa trả lời"
-- ============================================================
-- "Chưa trả lời" = tin CUỐI CÙNG của hội thoại là tin của khách.
-- coalesce giữ nguyên định nghĩa cũ (dashboard_overview #11, today_queue #16):
-- dòng dữ liệu cũ thiếu last_message_at vẫn tính là chưa trả lời.
-- KHÔNG bao gồm điều kiện trạng thái — trạng thái lọc riêng, để cùng một cột
-- phục vụ được cả "chưa trả lời" (chưa xong) lẫn thống kê lịch sử.
alter table public.conversations
  add column if not exists is_unanswered boolean
  generated always as (
    last_user_message_at is not null
    and last_user_message_at >= coalesce(last_message_at, last_user_message_at)
  ) stored;

comment on column public.conversations.is_unanswered is
  'Tin cuối cùng là của khách (chưa ai trả lời). Cột sinh — không ghi tay.';

-- Bộ lọc "Chưa trả lời" luôn kèm tenant + sắp theo thời gian chờ.
create index if not exists conversations_unanswered_idx
  on public.conversations (tenant_id, last_user_message_at)
  where is_unanswered;

-- ============================================================
-- PHẦN B — CÁC BỘ ĐẾM DÙNG COUNT TRONG CSDL
-- ============================================================

-- ---------- Hộp thư: số hội thoại của từng bộ lọc ----------
-- Một round-trip cho cả 5 con số. "Đang mở" ở đây ĐÚNG BẰNG ô "Hội thoại đang mở"
-- của Tổng quan, "Chưa trả lời" ĐÚNG BẰNG ô "Chưa trả lời" — hai màn không còn
-- nói hai giọng. "Tất cả" là con số duy nhất có tính cả hội thoại đã đóng, và tab
-- mang đúng tên đó.
-- Hộp thư dùng chung cả tiệm (RLS conversations khoanh theo tenant, không theo
-- người phụ trách) nên mọi thành viên thấy cùng bộ số — trừ "Của tôi".
create or replace function public.inbox_counts()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'unanswered', count(*) filter (where status <> 'closed' and is_unanswered),
    'open',       count(*) filter (where status <> 'closed'),
    'unassigned', count(*) filter (where status <> 'closed' and assignee_user_id is null),
    'mine',       count(*) filter (where status <> 'closed' and assignee_user_id = auth.uid()),
    'all',        count(*))
  from public.conversations
$$;

revoke execute on function public.inbox_counts() from public, anon;
grant execute on function public.inbox_counts() to authenticated;

-- ---------- Phân hạng khách: số khách mỗi hạng ----------
-- Trả {"vip":12,"regular":40,…}; hạng chưa có khách thì vắng khóa (tầng web hiểu
-- là 0). Khách đã xóa mềm không tính — giống mọi bộ đếm khách khác.
create or replace function public.contact_tier_counts()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_object_agg(tier, n), '{}'::jsonb)
  from (
    select tier, count(*) as n
    from public.contacts
    where deleted_at is null
    group by tier) s
$$;

revoke execute on function public.contact_tier_counts() from public, anon;
grant execute on function public.contact_tier_counts() to authenticated;

-- ---------- Cam kết phản hồi: số lần đã cảnh báo mỗi chính sách ----------
-- Trả {"<policy_id>": 37, …} kể từ mốc p_since (tầng web truyền mốc 7 ngày theo
-- giờ VN, giống trước).
create or replace function public.sla_fired_counts(p_since timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_object_agg(policy_id::text, n), '{}'::jsonb)
  from (
    select policy_id, count(*) as n
    from public.sla_events
    where created_at >= p_since
    group by policy_id) s
$$;

revoke execute on function public.sla_fired_counts(timestamptz) from public, anon;
grant execute on function public.sla_fired_counts(timestamptz) to authenticated;

-- ============================================================
-- PHẦN C — ĐƯA "CHỜ" VÀO ĐÚNG CÁC BỘ ĐẾM
-- ============================================================
-- Ba hàm dưới đây GIỮ NGUYÊN phần thân đang chạy; chỉ đổi đúng mệnh đề trạng thái
-- `status = 'open'` → `status <> 'closed'` và dùng cột sinh is_unanswered thay cho
-- biểu thức so cột viết lặp lại.

-- ---------- #11 (đã sửa ở #30): RPC màn Tổng quan ----------
-- Bản gốc dùng ở đây là bản của migration #30 (7 ngày lịch giờ VN cho
-- new_contacts_7d + tên khách qua conversation_contact_name). Chép nguyên, chỉ
-- đổi mệnh đề trạng thái để "Chờ" được đếm.
create or replace function public.dashboard_overview()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'open_conversations', (select count(*) from conversations where status <> 'closed'),
    'unanswered', (select count(*) from conversations c
        where c.status <> 'closed' and c.is_unanswered),
    -- 7 NGÀY LỊCH GIỜ VN (không phải 7×24 giờ): khách tạo lúc 23:30 ngày 15 nằm
    -- trong ngày 15, y hệt mọi con số tiền của Tổng quan và Báo cáo nguồn.
    'new_contacts_7d', (select count(*) from contacts
        where deleted_at is null
          and created_at >= ((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                              - interval '6 days') at time zone 'Asia/Ho_Chi_Minh')
          and created_at <  ((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                              + interval '1 day') at time zone 'Asia/Ho_Chi_Minh')),
    'hot_contacts', (select count(*) from contacts
        where deleted_at is null and lead_score >= 70),
    'channels_count', (select count(*) from channels),
    'contacts_count', (select count(*) from contacts where deleted_at is null),
    -- Tra tên BÊN NGOÀI `limit 5` (bọc thêm 1 lớp) — tiệm đông khách vẫn chỉ tốn
    -- đúng 5 lượt tra, không phải một lượt cho mỗi hội thoại đang chờ.
    'need_reply', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select n.id,
               public.conversation_contact_name(n.id) as name,
               n.channel_type,
               n.channel_name,
               n.waiting_since
        from (select c.id,
                     ch.type as channel_type,
                     ch.display_name as channel_name,
                     c.last_user_message_at as waiting_since
              from conversations c
              join channels ch on ch.id = c.channel_id
              where c.status <> 'closed' and c.is_unanswered
              order by c.last_user_message_at asc
              limit 5) n) x),
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

-- ---------- #11: bản tin tuần ----------
-- unanswered_end_of_week phải cùng định nghĩa với ô "Chưa trả lời" của Tổng quan,
-- nếu không thì card Bản tin tuần và ô KPI lại đá nhau.
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
        where c.tenant_id = p_tenant and c.status <> 'closed' and c.is_unanswered)
  ) into v_payload;

  insert into tenant_weekly_digests (tenant_id, week_start, payload)
  values (p_tenant, p_week_start, v_payload)
  on conflict (tenant_id, week_start)
  do update set payload = excluded.payload, created_at = now();

  return v_payload;
end;
$$;

revoke execute on function public.compute_weekly_digest(uuid, date) from public, anon, authenticated;

-- ---------- #16: màn "Hôm nay gọi ai" ----------
-- Khối "chưa trả lời" của màn Hôm nay được migration #16 ghi rõ là PHẢI giống hệt
-- dashboard_overview(). Sửa một bên mà bỏ bên kia là tự tạo ra lệch số mới, nên
-- CTE `unans` đổi cùng lúc. Phần còn lại của hàm giữ nguyên từng dòng.
create or replace function public.today_queue(p_mine_only boolean default false)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with
me as (select auth.uid() as uid),
bounds as (
  select ((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 day')
            at time zone 'Asia/Ho_Chi_Minh') as day_end
),
-- việc (activity) chưa xong, có hạn
act as (
  select a.id, a.type, a.subject, a.due_at, a.contact_id,
         c.full_name, c.phone
  from public.activities a
  left join public.contacts c on c.id = a.contact_id and c.deleted_at is null
  where a.done_at is null
    and a.due_at is not null
    and (not p_mine_only or a.owner_id = (select uid from me))
),
-- cơ hội đang mở có mốc "việc kế tiếp"
dl as (
  select d.id, d.title, d.next_action_at, d.next_action_note, d.contact_id,
         c.full_name, c.phone
  from public.deals d
  join public.contacts c on c.id = d.contact_id
  where d.deleted_at is null
    and d.status = 'open'
    and d.next_action_at is not null
    and (not p_mine_only or d.owner_id = (select uid from me))
),
overdue_items as (
  select 'activity'::text as kind, a.id::text as id,
         coalesce(nullif(a.subject, ''), a.type) as title,
         a.type as detail, a.due_at as at,
         a.contact_id, a.full_name, a.phone
  from act a
  where a.due_at < now()
  union all
  select 'deal', d.id::text, d.title,
         coalesce(nullif(d.next_action_note, ''), ''), d.next_action_at,
         d.contact_id, d.full_name, d.phone
  from dl d
  where d.next_action_at < now()
),
today_items as (
  select 'activity'::text as kind, a.id::text as id,
         coalesce(nullif(a.subject, ''), a.type) as title,
         a.type as detail, a.due_at as at,
         a.contact_id, a.full_name, a.phone
  from act a, bounds b
  where a.due_at >= now() and a.due_at < b.day_end
  union all
  select 'deal', d.id::text, d.title,
         coalesce(nullif(d.next_action_note, ''), ''), d.next_action_at,
         d.contact_id, d.full_name, d.phone
  from dl d, bounds b
  where d.next_action_at >= now() and d.next_action_at < b.day_end
),
busy_contacts as (
  select contact_id from overdue_items where contact_id is not null
  union
  select contact_id from today_items where contact_id is not null
),
hot as (
  select c.id, c.full_name, c.phone, c.lead_score, c.last_interaction_at
  from public.contacts c
  where c.deleted_at is null
    and c.lead_score >= 70
    and (c.last_interaction_at is null
         or c.last_interaction_at < now() - interval '3 days')
    and not exists (
      select 1 from public.activities a
      where a.contact_id = c.id and a.done_at is null)
    and not exists (select 1 from busy_contacts b where b.contact_id = c.id)
    and (not p_mine_only or c.owner_id = (select uid from me))
),
unans as (
  -- Bỏ `left join contacts` (nguồn của mã kỹ thuật, migration #30). Tên tra ở khối
  -- xuất kết quả bên dưới, SAU `limit 50`.
  select cv.id,
         ch.type as channel_type, ch.display_name as channel_name,
         cv.last_user_message_at as waiting_since, cv.contact_id
  from public.conversations cv
  join public.channels ch on ch.id = cv.channel_id
  where cv.status <> 'closed'
    and cv.is_unanswered
    and (not p_mine_only
         or coalesce(cv.assignee_user_id, (select uid from me)) = (select uid from me))
)
select jsonb_build_object(
  'counts', jsonb_build_object(
    'overdue',    (select count(*) from overdue_items),
    'today',      (select count(*) from today_items),
    'hot',        (select count(*) from hot),
    'unanswered', (select count(*) from unans)),
  'overdue', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select kind, id, title, detail, at, contact_id, full_name, phone
      from overdue_items order by at asc limit 50) x),
  'today', (select coalesce(jsonb_agg(y), '[]'::jsonb) from (
      select kind, id, title, detail, at, contact_id, full_name, phone
      from today_items order by at asc limit 50) y),
  'hot', (select coalesce(jsonb_agg(z), '[]'::jsonb) from (
      select id, full_name, phone, lead_score, last_interaction_at
      from hot order by lead_score desc, last_interaction_at asc nulls first
      limit 50) z),
  -- Tên khách qua hàm definer (#30): nhân viên đọc được TÊN, không còn thấy mã
  -- kỹ thuật. Không có khách / khách đã xóa / tên rỗng ⇒ NULL ⇒ web hiện
  -- "Khách chưa định danh".
  'unanswered', (select coalesce(jsonb_agg(w), '[]'::jsonb) from (
      select n.id,
             public.conversation_contact_name(n.id) as name,
             n.channel_type, n.channel_name, n.waiting_since, n.contact_id
      from (select id, channel_type, channel_name, waiting_since, contact_id
            from unans order by waiting_since asc limit 50) n) w)
)
$$;

revoke execute on function public.today_queue(boolean) from public, anon;
grant execute on function public.today_queue(boolean) to authenticated;

-- ============================================================
-- PHẦN D — ĐƯA "CHỜ" VÀO ĐÚNG CÁC CẢNH BÁO SLA
-- ============================================================
-- Hai thay đổi đi CÙNG NHAU, thiếu một cái là hỏng:
--   1) worker phải loại hội thoại ĐÃ ĐÓNG ra khỏi vòng quét. Trước đây việc này
--      do điều kiện {"status":"open"} của chính sách gánh hộ; bỏ ghim trạng thái
--      mà không chặn ở worker thì hội thoại đã đóng sẽ bị bắn cảnh báo.
--   2) chính sách cài sẵn bỏ ghim {"status":"open"} → "Chờ" có đồng hồ SLA.
--
-- Phần thân còn lại của process_sla_timers giữ nguyên từng dòng (nhánh deal, mốc
-- cửa sổ 48h Zalo, cơ chế chống bắn trùng).
create or replace function public.process_sla_timers(p_batch int default 500) returns int
language plpgsql
security definer set search_path = public as $$
declare
  -- Cửa sổ trả lời của Zalo OA: 48 giờ, cảnh báo trước 2 giờ (spec §3)
  c_window_minutes constant int := 48 * 60;
  c_window_lead    constant int := 120;
  p public.sla_policies%rowtype;
  r record;
  v_target jsonb;
  v_fired int := 0;
begin
  for p in
    select * from public.sla_policies where is_active order by tenant_id, created_at
  loop
    if p.target_type = 'conversation' then
      for r in
        select c.id,
               c.status,
               c.assignee_user_id,
               c.last_user_message_at as started_at,
               ch.type as channel_type,
               (floor(extract(epoch from (now() - c.last_user_message_at)) / 60))::int as elapsed
        from public.conversations c
        join public.channels ch on ch.id = c.channel_id
        where c.tenant_id = p.tenant_id
          -- hội thoại ĐÃ ĐÓNG là việc đã xong, không còn đồng hồ nào chạy
          and c.status <> 'closed'
          and c.last_user_message_at is not null
          and c.last_user_message_at > now() - interval '30 days'
          and c.last_user_message_at <= now() - make_interval(mins => p.warn_after_minutes)
          -- "chưa trả lời" = không có tin GỬI ĐI nào sau tin cuối của khách
          and not exists (
            select 1 from public.messages m
            where m.conversation_id = c.id
              and m.direction = 'out'
              and m.sent_at > c.last_user_message_at)
        order by c.last_user_message_at
        limit p_batch
      loop
        v_target := jsonb_build_object(
          'status', r.status,
          'channel_type', r.channel_type,
          'unanswered', true,
          'assignee_user_id', r.assignee_user_id);
        if not public.wf_match_conditions(
             p.condition, jsonb_build_object('payload', v_target), '{}'::jsonb) then
          continue;
        end if;

        if r.elapsed >= p.warn_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'conversation', r.id, 'warning', r.started_at, r.elapsed,
                               r.assignee_user_id, '/app/inbox?c=' || r.id::text) then
          v_fired := v_fired + 1;
        end if;

        if r.elapsed >= p.breach_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'conversation', r.id, 'breached', r.started_at, r.elapsed,
                               r.assignee_user_id, '/app/inbox?c=' || r.id::text) then
          v_fired := v_fired + 1;
        end if;

        -- Mốc riêng, khẩn hơn: sắp hết cửa sổ trả lời 48h của Zalo OA
        if r.channel_type = 'zalo_oa'
           and r.elapsed >= c_window_minutes - c_window_lead
           and r.elapsed < c_window_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'conversation', r.id, 'window_warning', r.started_at, r.elapsed,
                               r.assignee_user_id, '/app/inbox?c=' || r.id::text) then
          v_fired := v_fired + 1;
        end if;
      end loop;

    elsif p.target_type = 'deal' then
      for r in
        select d.id,
               d.status,
               d.owner_id,
               d.next_action_at as started_at,
               (floor(extract(epoch from (now() - d.next_action_at)) / 60))::int as elapsed
        from public.deals d
        where d.tenant_id = p.tenant_id
          and d.deleted_at is null
          and d.next_action_at is not null
          and d.next_action_at > now() - interval '30 days'
          and d.next_action_at <= now() - make_interval(mins => p.warn_after_minutes)
        order by d.next_action_at
        limit p_batch
      loop
        v_target := jsonb_build_object(
          'status', r.status,
          'overdue', true,
          'owner_id', r.owner_id);
        if not public.wf_match_conditions(
             p.condition, jsonb_build_object('payload', v_target), '{}'::jsonb) then
          continue;
        end if;

        -- Chưa có màn chi tiết cơ hội (đợt 1) → link về bảng Cơ hội
        if r.elapsed >= p.warn_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'deal', r.id, 'warning', r.started_at, r.elapsed,
                               r.owner_id, '/app/deals') then
          v_fired := v_fired + 1;
        end if;

        if r.elapsed >= p.breach_after_minutes
           and public.sla_fire(p.tenant_id, p.id, p.name, p.escalate_to,
                               'deal', r.id, 'breached', r.started_at, r.elapsed,
                               r.owner_id, '/app/deals') then
          v_fired := v_fired + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_fired;
end $$;

revoke execute on function public.process_sla_timers from public, anon, authenticated;

-- ---------- chính sách cài sẵn: bỏ ghim {"status":"open"} ----------
-- Giữ nguyên phần thân đang chạy (migration #17), chỉ đổi `condition` của chính
-- sách hội thoại. Chính sách cơ hội KHÔNG đổi: deal đã thắng/thua thì hết việc,
-- {"status":"open"} ở đó là đúng.
create or replace function public.sla_seed_policies(p_tenant uuid) returns void
language plpgsql
security definer set search_path = public as $$
begin
  if p_tenant is null then
    return;
  end if;

  insert into public.sla_policies
    (tenant_id, key, name, target_type, condition,
     warn_after_minutes, breach_after_minutes, escalate_to, is_system)
  values
    (p_tenant, 'conversation_first_reply',
     'Hội thoại khách chưa được trả lời',
     'conversation',
     -- Không ghim trạng thái: hội thoại "Chờ" cũng là khách đang đợi.
     -- Hội thoại đã đóng bị loại ngay trong vòng quét của process_sla_timers.
     jsonb_build_object('unanswered', true),
     30, 120, 'manager', true),
    (p_tenant, 'deal_next_action_overdue',
     'Cơ hội quá hạn việc kế tiếp',
     'deal',
     jsonb_build_object('status', 'open', 'overdue', true),
     240, 1440, 'manager', true)
  on conflict (tenant_id, key) where key is not null do nothing;
end $$;

revoke execute on function public.sla_seed_policies from public, anon, authenticated;

-- ---------- vá chính sách của tenant đã tồn tại ----------
-- CHỈ vá dòng còn nguyên điều kiện mặc định cũ. Tenant nào đã tự sửa điều kiện thì
-- giữ nguyên ý muốn của họ — không ghi đè.
update public.sla_policies
   set condition = jsonb_build_object('unanswered', true)
 where key = 'conversation_first_reply'
   and is_system
   and condition = jsonb_build_object('status', 'open', 'unanswered', true);
