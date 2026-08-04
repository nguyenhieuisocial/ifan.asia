-- ============================================================
-- iFan.asia — Migration #30: NHẤT QUÁN SỐ LIỆU GIỮA CÁC MÀN
-- Nguồn: rà soát toàn sản phẩm 05/08 — "sản phẩm nói nhiều giọng khác nhau về
-- cùng một con số". Chủ tiệm không đọc tài liệu: thấy chỗ ghi 1, chỗ ghi 2 là
-- kết luận phần mềm sai. Luật từ nay: MỘT chỉ số xuất hiện ở ≥2 màn thì phải
-- CÙNG định nghĩa và CÙNG cửa sổ thời gian.
--
--   1) conversation_contact_name(uuid) — MỚI, security definer.
--      Trả về ĐÚNG MỘT THỨ: tên khách của một hội thoại trong tiệm của người gọi.
--      Vá lỗi "nhân viên thấy mã nội bộ (demo-zl-007) thay vì Chị Yến Nhi".
--
--   2) dashboard_overview() — sửa 2 điểm, giữ nguyên phần còn lại:
--      · new_contacts_7d: đang tính lùi 7×24 GIỜ (now() - interval '7 days');
--        đổi sang 7 NGÀY LỊCH GIỜ VN, khớp TUYỆT ĐỐI với vnRange("7") mà màn
--        Tổng quan/Báo cáo nguồn đang dùng ⇒ hai ô "Khách mới" cạnh nhau hết đá nhau.
--      · need_reply[].name: lấy qua (1) thay cho coalesce(full_name, external_user_id).
--
--   3) today_queue(boolean) — sửa 1 điểm: unanswered[].name lấy qua (1).
--
-- KHÔNG đụng tới bất kỳ policy nào. Không nới lỏng gì. Hai hàm đọc vẫn là
-- SECURITY INVOKER — RLS của người gọi áp nguyên như cũ cho MỌI cột khác.
-- ============================================================


-- ============================================================
-- 1) conversation_contact_name(uuid) — chỉ tên khách, không gì khác
-- ============================================================
-- VÌ SAO CẦN: conversations là RLS theo TENANT (chủ ý, spec Inbox §4.2/§5 — hộp
-- thư dùng chung để không ai bỏ sót khách), còn contacts là "Pattern B" (nhân
-- viên chỉ đọc khách mình phụ trách). Hai hợp đồng khác nhau gặp nhau ở câu
-- `left join contacts` bên trong dashboard_overview()/today_queue(): với nhân
-- viên, join trả NULL nên tên rơi về external_user_id — tức MÃ KỸ THUẬT
-- ("demo-zl-007", "lc_demo-web-0001"). Trong tiệm thật phần lớn người dùng là
-- nhân viên ⇒ cảnh báo quan trọng nhất hiện ra một đống mã vô nghĩa.
--
-- VÌ SAO CHỌN CÁCH NÀY (definer trả tên) THAY VÌ CHỈ HIỆN "Khách chưa đặt tên":
-- hội thoại đó nhân viên VỐN ĐÃ mở được và đọc được toàn bộ nội dung tin nhắn
-- (policy conversations_select + messages theo tenant, có từ migration #4).
-- Tên khách không phải bí mật mới — nó nằm ngay trong hội thoại họ đang trực.
-- Giấu tên chỉ làm cảnh báo vô dụng chứ không bảo vệ được gì.
--
-- PHẠM VI RÒ RỈ — CHỨNG MINH KHÔNG LỘ THÊM GÌ NGOÀI TÊN:
--   · Cột duy nhất rời khỏi hàm: contacts.full_name (text). Không phone, không
--     email, không lead_score, không tier, không owner_id, không id khách.
--   · Đầu vào là ID HỘI THOẠI, không phải ID khách ⇒ không dùng làm máy dò
--     "khách X có tồn tại không"; muốn hỏi phải có sẵn id hội thoại, mà id hội
--     thoại thì người gọi vốn đã đọc được (RLS tenant-scope).
--   · Chốt chặn tenant tường minh: cv.tenant_id = current_tenant_id() ⇒ hỏi
--     hội thoại tiệm khác luôn trả NULL.
--   · Không có khách / khách đã xóa mềm / tên rỗng ⇒ NULL, tầng web hiện
--     "Khách chưa định danh". KHÔNG BAO GIỜ trả external_user_id nữa.
create or replace function public.conversation_contact_name(p_conversation_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(ct.full_name), '')
  from public.conversations cv
  join public.contacts ct
    on ct.id = cv.contact_id
   and ct.deleted_at is null
  where cv.id = p_conversation_id
    and cv.tenant_id = (select public.current_tenant_id())
$$;

comment on function public.conversation_contact_name(uuid) is
  'Tên khách của MỘT hội thoại trong tiệm của người gọi. Security definer để '
  'nhân viên thấy tên thay vì mã kỹ thuật; trả về DUY NHẤT cột full_name, chốt '
  'chặn theo current_tenant_id(). Migration #30.';

revoke execute on function public.conversation_contact_name(uuid) from public, anon;
grant execute on function public.conversation_contact_name(uuid) to authenticated;


-- ============================================================
-- 2) dashboard_overview() — giữ nguyên thân hàm, sửa đúng 2 chỗ
-- ============================================================
-- Bản gốc: migration #11 (weekly_digest). Chép nguyên, đổi:
--   a) new_contacts_7d → 7 ngày lịch giờ VN, nửa mở [đầu ngày hôm nay − 6 ngày,
--      đầu ngày mai) — ĐÚNG BẰNG vnRange("7") của app/app/reports/sources/types.ts.
--   b) need_reply[].name → conversation_contact_name(c.id), bỏ left join contacts.
create or replace function public.dashboard_overview()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'open_conversations', (select count(*) from conversations where status = 'open'),
    'unanswered', (select count(*) from conversations c
        where c.status = 'open' and c.last_user_message_at is not null
          and c.last_user_message_at >= coalesce(c.last_message_at, c.last_user_message_at)),
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
              where c.status = 'open' and c.last_user_message_at is not null
                and c.last_user_message_at >= coalesce(c.last_message_at, c.last_user_message_at)
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


-- ============================================================
-- 3) today_queue(boolean) — giữ nguyên thân hàm, sửa đúng 1 chỗ
-- ============================================================
-- Bản gốc: migration #16 (today_and_attribution). Chép nguyên, đổi CTE `unans`:
-- name lấy qua conversation_contact_name(cv.id), bỏ left join contacts.
-- Mọi khối khác (act/dl/overdue/today/hot, bộ đếm, giới hạn 50) GIỮ NGUYÊN.
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
  -- Bỏ `left join contacts` (nguồn của mã kỹ thuật). Tên tra ở khối xuất kết quả
  -- bên dưới, SAU `limit 50` — bộ đếm 'unanswered' không phải trả phí tra tên.
  select cv.id,
         ch.type as channel_type, ch.display_name as channel_name,
         cv.last_user_message_at as waiting_since, cv.contact_id
  from public.conversations cv
  join public.channels ch on ch.id = cv.channel_id
  where cv.status = 'open'
    and cv.last_user_message_at is not null
    and cv.last_user_message_at >= coalesce(cv.last_message_at, cv.last_user_message_at)
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
