-- #49 — Màn "Hôm nay gọi ai" khép vòng: thêm đếm "done_today" vào today_queue
--
-- Vì sao: màn Hôm nay chỉ nói "còn bao nhiêu việc" — làm xong hết thì trống trơn,
-- không ai thấy mình đã làm được gì. Thêm counts.done_today (số activity có
-- done_at rơi TRONG NGÀY theo giờ VN) để web hiện "Đã xong hôm nay N" và màn
-- hết việc khoe "Hôm nay bạn đã xong N việc".
--
-- Ranh giới ngày lấy đúng cách các hàm khác đang dùng (bounds của chính hàm này,
-- metric_daily #21, metric_consistency #30): `date_trunc('day', now() at time
-- zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'`.
--
-- ⚠️ CẢNH BÁO REGRESSION: thân hàm dưới đây CHÉP TỪ BẢN MỚI NHẤT (#45 — đã gồm
-- sửa `hot` chỉ loại khách còn việc CÓ HẠN `a.due_at is not null`, sửa `unans`
-- của #30/#31 và tra tên qua conversation_contact_name). KHÔNG chép lại từ bản
-- cũ hơn. Ai sửa hàm này sau: phải chép từ bản mới nhất, chỉ đổi đúng chỗ cần.
-- Khác #45 đúng 2 chỗ: (1) CTE `bounds` thêm `day_start`; (2) counts thêm
-- 'done_today'. search_path vẫn ghim `pg_temp` cuối (giữ chốt #40 — create or
-- replace ghi đè cấu hình cũ, chép nguyên `public` là tự tháo chốt).
create or replace function public.today_queue(p_mine_only boolean default false)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with
me as (select auth.uid() as uid),
bounds as (
  select ((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh'))
            at time zone 'Asia/Ho_Chi_Minh') as day_start,
         ((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 day')
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
    -- #45: chỉ loại khách còn việc CÓ HẠN đang chờ. Ghi chú/cuộc gọi đã ghi
    -- (nhật ký, không hạn) không được che khách nóng.
    and not exists (
      select 1 from public.activities a
      where a.contact_id = c.id and a.done_at is null and a.due_at is not null)
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
    'unanswered', (select count(*) from unans),
    -- #49: việc ĐÃ XONG trong ngày (giờ VN) — cùng phạm vi p_mine_only với các
    -- khối trên để số khớp nút "Của tôi / Cả tiệm".
    'done_today', (select count(*)
       from public.activities a, bounds b
       where a.done_at >= b.day_start and a.done_at < b.day_end
         and (not p_mine_only or a.owner_id = (select uid from me)))),
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
