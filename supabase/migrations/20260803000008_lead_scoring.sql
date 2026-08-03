-- ============================================================
-- iFan.asia — Migration #8: Chấm điểm lead ĐỢT 1 (tầng rule — spec CRM V1)
-- Spec: "03 Sản phẩm/Specs/01 CRM và Bán hàng.md" mục V1 tầng 1:
--   điểm = tổng có trọng số của độ đầy hồ sơ + chất lượng nguồn
--   + độ mới tương tác (decay theo ngày) + tần suất tương tác + lịch sử mua.
--   Band hiển thị: Nóng ≥70 / Ấm 40–69 / Lạnh <40.
-- Tầng 2 (AI ±30 điểm, quota theo gói) + lead_score_settings (tenant chỉnh
--   trọng số) thuộc đợt sau — trọng số đợt 1 là hằng số trong hàm dưới đây.
--
-- TRỌNG SỐ (tối đa 110, kẹp về 100 — ai đủ mọi thứ vẫn chỉ 100):
--   profile   0..15  — có SĐT +10, có email +5 (số của spec)
--   source    0..20  — lead_sources.quality_score (0..100) × 20%
--   recency   0..40  — 40 điểm khi tương tác hôm nay, giảm tuyến tính về 0 sau 30 ngày
--   frequency 0..15  — tin nhắn KHÁCH GỬI (direction='in') 30 ngày gần nhất, 1.5đ/tin, trần 10 tin
--   won_deal  0..20  — đã từng thắng deal +20 (số của spec)
-- Khớp tiêu chí nghiệm thu #14: đủ hồ sơ + nguồn quality 90 + nhắn hôm nay
--   = 15+18+40+2 = 75 ≥ 70 (Nóng); contact trống + 60 ngày im lặng < 40 (Lạnh).
--
-- Giả định quy mô: recompute chạy per-row trong trigger (không debounce) —
-- đủ nhanh ở quy mô hiện tại (nghìn contact/tenant, 1 query messages 30d có
-- index conversations_contact_idx + messages_conversation_idx). Khi có tenant
-- lớn: chuyển sang job batch score-recompute qua pgmq (spec mục 6).
-- ============================================================

-- ---------- cột trên contacts (tên cột theo data model của spec) ----------

alter table public.contacts
  add column lead_score int not null default 0 check (lead_score between 0 and 100),
  add column lead_score_breakdown jsonb not null default '[]'::jsonb, -- [{factor, points}] — 'reason' text dành cho tầng AI đợt sau
  add column lead_score_updated_at timestamptz;

-- Sort "khách nóng trước" trong danh sách (cursor: lead_score desc, created_at desc)
create index contacts_lead_score_idx
  on public.contacts (tenant_id, lead_score desc, created_at desc)
  where deleted_at is null;

-- ---------- hàm tính điểm ----------
-- SECURITY DEFINER: trigger gọi được cả khi người ghi (staff, service role)
-- không có quyền UPDATE contact đó qua RLS — tiền lệ activities_touch_contact.
-- KHÔNG cho client gọi trực tiếp (revoke bên dưới): chỉ trigger + cron + postgres.

create or replace function public.recompute_contact_score(p_contact_id uuid)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  v record;
  v_msgs int;
  v_profile int; v_source int; v_recency int; v_freq int; v_won int;
  v_days numeric;
  v_score int;
begin
  select c.phone, c.email, c.last_interaction_at, ls.quality_score
    into v
    from public.contacts c
    left join public.lead_sources ls on ls.id = c.source_id
    where c.id = p_contact_id and c.deleted_at is null;
  if not found then return; end if;

  -- Độ đầy hồ sơ: SĐT +10, email +5 (spec V1)
  v_profile := case when nullif(trim(v.phone), '') is not null then 10 else 0 end
             + case when v.email is not null then 5 else 0 end;

  -- Chất lượng nguồn: quality_score 0..100 → 0..20 (chưa gán nguồn = 0)
  v_source := coalesce(round(v.quality_score * 20.0 / 100.0)::int, 0);

  -- Độ mới tương tác: decay tuyến tính 40 → 0 trong 30 ngày
  if v.last_interaction_at is null then
    v_recency := 0;
  else
    v_days := extract(epoch from (now() - v.last_interaction_at)) / 86400.0;
    v_recency := greatest(0, round(40.0 * (1 - v_days / 30.0)))::int;
  end if;

  -- Tần suất: tin khách gửi 30 ngày gần nhất, trần 10 tin → 0..15
  select count(*)::int into v_msgs
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id
    where cv.contact_id = p_contact_id
      and m.direction = 'in'
      and m.sent_at >= now() - interval '30 days';
  v_freq := round(least(v_msgs, 10) * 15.0 / 10.0)::int;

  -- Lịch sử mua: đã từng thắng deal +20 (spec V1)
  select case when exists (
      select 1 from public.deals d
      where d.contact_id = p_contact_id and d.status = 'won' and d.deleted_at is null
    ) then 20 else 0 end
    into v_won;

  v_score := least(100, v_profile + v_source + v_recency + v_freq + v_won);

  update public.contacts
     set lead_score = v_score,
         lead_score_breakdown = jsonb_build_array(
           jsonb_build_object('factor', 'profile',   'points', v_profile),
           jsonb_build_object('factor', 'source',    'points', v_source),
           jsonb_build_object('factor', 'recency',   'points', v_recency),
           jsonb_build_object('factor', 'frequency', 'points', v_freq),
           jsonb_build_object('factor', 'won_deal',  'points', v_won)
         ),
         lead_score_updated_at = now()
   where id = p_contact_id;
end $$;

revoke execute on function public.recompute_contact_score(uuid) from public, anon, authenticated;

-- ---------- trigger: tin nhắn KHÁCH gửi → bump last_interaction_at ----------
-- Spec mục 7 (CRM NHẬN message.received): update last_interaction_at + trigger score.
-- Chuỗi kích hoạt duy nhất: bump cột này → trigger contacts bên dưới lo recompute
-- (tin 'out' của nhân viên không đổi factor nào nên không kích).

create or replace function public.messages_touch_contact() returns trigger
language plpgsql
security definer set search_path = public as $$
declare
  v_contact uuid;
begin
  if new.direction = 'in' then
    select contact_id into v_contact
      from public.conversations where id = new.conversation_id;
    if v_contact is not null then
      update public.contacts
         set last_interaction_at = greatest(coalesce(last_interaction_at, new.sent_at), new.sent_at)
       where id = v_contact;
    end if;
  end if;
  return null;
end $$;

create trigger messages_touch_contact after insert on public.messages
  for each row execute function public.messages_touch_contact();

-- ---------- trigger: contacts đổi tín hiệu → tính lại điểm ----------
-- Cột kích hoạt = đúng các input của công thức. UPDATE trong recompute chỉ SET
-- lead_score* (không nằm trong danh sách OF) → không đệ quy.
-- last_interaction_at nằm trong danh sách → activity mới (activities_touch_contact)
-- và tin nhắn mới (messages_touch_contact) đều tự kéo theo recompute.

create or replace function public.contacts_score_recompute() returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  perform public.recompute_contact_score(new.id);
  return null;
end $$;

create trigger contacts_score_recompute
  after insert or update of phone, email, source_id, last_interaction_at
  on public.contacts
  for each row execute function public.contacts_score_recompute();

-- ---------- trigger: deal thắng → tính lại điểm (+20 lịch sử mua) ----------

create or replace function public.deals_score_recompute() returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  if new.status = 'won' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.recompute_contact_score(new.contact_id);
  end if;
  return null;
end $$;

create trigger deals_score_recompute after insert or update of status on public.deals
  for each row execute function public.deals_score_recompute();

-- ---------- cron đêm: decay điểm khi KHÔNG có sự kiện ----------
-- Recency giảm theo ngày — không có cron thì khách im lặng vẫn giữ điểm cũ.
-- 20:00 UTC = 03:00 giờ VN (spec: score-recompute cron 03:00 VN).
-- Chỉ quét contact có gì để decay (điểm > 0), bỏ qua đã xóa mềm.

select cron.schedule(
  'lead-score-nightly',
  '0 20 * * *',
  $$ select public.recompute_contact_score(id)
       from public.contacts
      where deleted_at is null and lead_score > 0 $$
);

-- ---------- backfill 1 lần cho contact hiện có ----------

select public.recompute_contact_score(id) from public.contacts where deleted_at is null;
