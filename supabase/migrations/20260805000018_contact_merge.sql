-- ============================================================
-- iFan.asia — Migration #18: Gộp khách trùng + gợi ý trùng lặp (GĐ2, đợt 1)
--
-- Bối cảnh: ngay sau khi nhập Excel là chắc chắn có hồ sơ trùng (spec CRM
-- mục 4.9 "Màn gộp trùng" + US-A2 "gộp 2 hồ sơ trùng SĐT thành 1, giữ toàn bộ
-- deal + lịch sử của cả hai" + mục 6 mergeContacts + mục 9 đợt-2 #8 "Dedupe + merge").
--
-- Migration này thêm ĐÚNG những gì màn gộp cần, không hơn:
--
--   1) contacts.merged_into_id      -- con trỏ bản-thua → bản-giữ. Xóa mềm KHÔNG mất
--                                      dấu vết: mở link cũ vẫn biết chuyển đi đâu.
--   2) merge_logs                   -- nhật ký gộp theo spec mục 5 (kept_id, merged_id,
--                                      entity, snapshot, merged_by). Snapshot giữ giá
--                                      trị TRƯỚC gộp của cả hai + field nào lấy của ai
--                                      — thứ duy nhất không suy lại được sau khi gộp.
--   3) contact_merge_dismissals     -- "Không phải trùng": cặp bị bỏ qua VĨNH VIỄN,
--                                      không bao giờ hiện lại trong danh sách gợi ý.
--   4) contact_duplicate_base()     -- máy dò cặp nghi trùng, xếp hạng theo độ chắc:
--        contact_duplicate_pairs()     SĐT E.164 trùng (100) > email trùng (90) >
--        contact_duplicate_count()     tên chuẩn hóa trùng + cùng nguồn (70).
--        contact_merge_summary()
--   5) merge_contacts()             -- gộp NGUYÊN TỬ + LŨY ĐẲNG (chạy lại = no-op).
--   6) dismiss_duplicate_pair()     -- ghi cặp "không phải trùng".
--
-- ---------- Vì sao security definer (và vì sao vẫn an toàn) ----------
-- Toàn bộ luồng gộp là việc của owner/admin/manager (giống Nhập Excel: ghi hàng
-- loạt cho cả tiệm). Nhân viên (staff) chỉ thấy khách mình phụ trách nên "cặp
-- trùng" với họ vừa thiếu vừa không gộp được → mọi hàm ở đây TỰ kiểm quyền bằng
-- app_role() trước khi chạm dữ liệu, và tự giới hạn theo current_tenant_id().
-- Definer là bắt buộc vì gộp phải sửa hàng của NHIỀU chủ sở hữu khác nhau
-- (deal/activity/hội thoại của người khác) trong MỘT transaction — RLS theo
-- người gọi sẽ bỏ sót đúng những hàng cần chuyển, để lại dữ liệu mồ côi.
-- KHÔNG policy nào của bảng cũ bị nới lỏng trong migration này.
--
-- ---------- Vì sao contact.merged phát BẰNG LỆNH GỌI, không bằng trigger ----------
-- Từ migration #15 event của contacts do trigger contacts_emit_events phát. Ở đây
-- KHÔNG dùng đường đó, vì hai lý do cứng:
--   (a) payload contact.merged phải có `fields_taken` — đó là THAM SỐ của thao tác
--       (người dùng chọn giữ field của ai), không nằm trong trạng thái hàng nào cả;
--       trigger đọc OLD/NEW không thể suy ra được.
--   (b) hàng-thua đổi trạng thái bằng đúng một lần xóa mềm, mà contacts_emit_events
--       CỐ Ý im lặng với xóa mềm — sửa quy ước đó chỉ để nhét merge vào sẽ làm
--       mọi luồng xóa mềm khác phát event rác.
-- Bảo đảm giao dịch KHÔNG yếu đi: wf_emit() chạy bên trong merge_contacts(), tức
-- cùng transaction với mọi thao tác ghi — sập là sập cả cụm. merge_contacts() lại
-- là đường DUY NHẤT đặt merged_into_id nên không có lối nào gộp mà quên phát.
-- ============================================================

-- ---------- 1) Con trỏ bản-thua → bản-giữ ----------

alter table public.contacts
  add column merged_into_id uuid references public.contacts (id) on delete set null;

comment on column public.contacts.merged_into_id is
  'Hồ sơ này đã gộp vào hồ sơ nào (chỉ có giá trị khi deleted_at not null). Do merge_contacts() ghi.';

-- Không tự gộp vào chính mình dù gọi thẳng SQL
alter table public.contacts
  add constraint contacts_merged_into_not_self check (merged_into_id is null or merged_into_id <> id);

create index contacts_merged_into_idx on public.contacts (merged_into_id)
  where merged_into_id is not null;

-- Nhánh dò theo TÊN của máy dò trùng là phép nối bằng trên biểu thức chuẩn hóa tên;
-- hai nhánh kia đã có contacts_phone_idx / contacts_email_idx đỡ. Không có chỉ mục này
-- thì tenant 100k khách (mức spec nhắm tới) phải quét toàn bảng mỗi lần mở màn Khách
-- hàng — badge đếm cặp trùng chạy ngay ở trang danh sách.
-- Khác contacts_search_idx (GIN trigram trên search_text, phục vụ tìm-gần-đúng):
-- đây là btree cho phép so BẰNG.
create index contacts_name_norm_idx on public.contacts
  (tenant_id, public.immutable_unaccent(lower(full_name)))
  where deleted_at is null;

-- ---------- 2) Nhật ký gộp ----------

create table public.merge_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entity text not null default 'contact' check (entity in ('contact', 'company')),
  kept_id uuid not null,
  merged_id uuid not null,
  snapshot jsonb not null default '{}'::jsonb, -- giá trị trước gộp + field lấy của ai
  merged_by uuid,                              -- auth.uid(); null khi chạy bằng service role
  created_at timestamptz not null default now()
);
alter table public.merge_logs enable row level security;

create index merge_logs_tenant_time_idx on public.merge_logs (tenant_id, created_at desc);
create index merge_logs_kept_idx on public.merge_logs (kept_id);

-- Chỉ ĐỌC từ phía client, và chỉ quản lý trở lên. Ghi: duy nhất merge_contacts()
-- (security definer, chạy quyền chủ hàm) — không có policy insert/update/delete.
create policy merge_logs_select on public.merge_logs
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

comment on table public.merge_logs is
  'Nhật ký gộp hồ sơ trùng (spec CRM mục 5). Chỉ merge_contacts() ghi; client chỉ đọc.';

-- ---------- 3) Cặp "không phải trùng" ----------

create table public.contact_merge_dismissals (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  contact_a_id uuid not null references public.contacts (id) on delete cascade,
  contact_b_id uuid not null references public.contacts (id) on delete cascade,
  dismissed_by uuid,
  created_at timestamptz not null default now(),
  primary key (tenant_id, contact_a_id, contact_b_id)
);
alter table public.contact_merge_dismissals enable row level security;

create index contact_merge_dismissals_b_idx on public.contact_merge_dismissals (contact_b_id);

-- Cặp được ghi theo thứ tự chuẩn least(a,b) < greatest(a,b) bởi dismiss_duplicate_pair();
-- máy dò vẫn đối chiếu CẢ HAI chiều nên dữ liệu ghi tay lệch thứ tự cũng không lọt.
create policy contact_merge_dismissals_manage on public.contact_merge_dismissals
  for all to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

comment on table public.contact_merge_dismissals is
  'Cặp khách đã được xác nhận "không phải trùng" — loại vĩnh viễn khỏi gợi ý gộp.';

-- ---------- 4) Máy dò cặp nghi trùng ----------

-- Trần cứng: màn gộp là việc dọn tay, không phải báo cáo. 500 cặp/lượt đủ cho
-- mọi đợt nhập Excel thực tế và chặn nổ tổ hợp trên tenant 100k khách.
create or replace function public.contact_duplicate_base(p_cap int default 500)
returns table (a_id uuid, b_id uuid, match_type text, confidence int)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    -- Không đúng vai → tid null → không hàng nào lọt (không rò dữ liệu qua definer)
    select case
      when public.app_role() in ('owner', 'admin', 'manager')
      then public.current_tenant_id()
    end as tid
  ),
  visible as (
    select
      c.id,
      c.phone_e164,
      lower(c.email::text) as email_l,
      public.immutable_unaccent(lower(c.full_name)) as name_n,
      c.source_id
    from public.contacts c
    join me on true
    where c.tenant_id = me.tid
      and c.deleted_at is null
      and c.merged_into_id is null
  ),
  pairs as (
    -- (1) SĐT chuẩn E.164 trùng — chắc nhất, dùng index contacts_phone_idx
    select a.id as a_id, b.id as b_id, 'phone'::text as mt, 100 as conf
    from visible a
    join visible b on b.phone_e164 = a.phone_e164 and b.id > a.id
    where a.phone_e164 is not null
    union all
    -- (2) email trùng
    select a.id, b.id, 'email', 90
    from visible a
    join visible b on b.email_l = a.email_l and b.id > a.id
    where a.email_l is not null and a.email_l <> ''
    union all
    -- (3) tên chuẩn hóa (bỏ dấu, thường) trùng VÀ cùng nguồn — yếu nhất, dễ dương tính giả
    select a.id, b.id, 'name', 70
    from visible a
    join visible b
      on b.name_n = a.name_n
     and b.source_id is not distinct from a.source_id
     and b.id > a.id
    where a.name_n <> ''
  ),
  ranked as (
    -- Một cặp chỉ hiện MỘT lần, mang mức chắc cao nhất trong các kiểu khớp
    select distinct on (a_id, b_id) a_id, b_id, mt, conf
    from pairs
    order by a_id, b_id, conf desc
  )
  select r.a_id, r.b_id, r.mt, r.conf
  from ranked r
  where not exists (
    select 1
    from public.contact_merge_dismissals d
    where d.tenant_id = (select tid from me)
      and (
        (d.contact_a_id = r.a_id and d.contact_b_id = r.b_id)
        or (d.contact_a_id = r.b_id and d.contact_b_id = r.a_id)
      )
  )
  order by r.conf desc, r.a_id, r.b_id
  limit greatest(p_cap, 0)
$$;

comment on function public.contact_duplicate_base(int) is
  'Cặp khách nghi trùng trong tenant, xếp theo độ chắc: SĐT 100 > email 90 > tên+nguồn 70. Đã loại cặp bị bỏ qua.';

-- Tóm tắt một hồ sơ đủ để so sánh cạnh nhau + biết cái gì sẽ được chuyển khi gộp
create or replace function public.contact_merge_summary(p_contact uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'full_name', c.full_name,
    'phone', c.phone,
    'email', c.email,
    'tier', c.tier,
    'lead_score', c.lead_score,
    'total_revenue', c.total_revenue,
    'owner_id', c.owner_id,
    'source_id', c.source_id,
    'source_name', s.name,
    'company_id', co.id,
    'company_name', co.name,
    'created_at', c.created_at,
    'conversation_count', (select count(*) from public.conversations x where x.contact_id = c.id),
    'deal_count', (select count(*) from public.deals x where x.contact_id = c.id and x.deleted_at is null),
    'activity_count', (select count(*) from public.activities x where x.contact_id = c.id),
    'tag_count', (select count(*) from public.contact_tags x where x.contact_id = c.id),
    'identity_count', (select count(*) from public.contact_identities x where x.contact_id = c.id),
    'tags', (
      select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb)
      from public.contact_tags ct join public.tags t on t.id = ct.tag_id
      where ct.contact_id = c.id
    )
  )
  from public.contacts c
  left join public.lead_sources s on s.id = c.source_id
  left join public.companies co on co.id = c.company_id and co.deleted_at is null
  where c.id = p_contact
    and c.tenant_id = public.current_tenant_id()
    and public.app_role() in ('owner', 'admin', 'manager')
$$;

comment on function public.contact_merge_summary(uuid) is
  'Ảnh chụp hồ sơ khách cho màn so sánh/gộp: field nghiệp vụ + số hội thoại/cơ hội/hoạt động/thẻ/định danh.';

-- Danh sách phân trang cho màn "Trùng lặp"
create or replace function public.contact_duplicate_pairs(
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  a_id uuid,
  b_id uuid,
  match_type text,
  confidence int,
  a jsonb,
  b jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.a_id,
    p.b_id,
    p.match_type,
    p.confidence,
    public.contact_merge_summary(p.a_id) as a,
    public.contact_merge_summary(p.b_id) as b
  from public.contact_duplicate_base() p
  order by p.confidence desc, p.a_id, p.b_id
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0)
$$;

comment on function public.contact_duplicate_pairs(int, int) is
  'Trang danh sách cặp nghi trùng (tối đa 50 cặp/lượt) kèm tóm tắt 2 hồ sơ để so cạnh nhau.';

-- Badge số cặp trên màn Khách hàng
create or replace function public.contact_duplicate_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.contact_duplicate_base()
$$;

comment on function public.contact_duplicate_count() is
  'Số cặp nghi trùng đang chờ xử lý (trần 500 — badge hiển thị "500+" khi chạm trần).';

-- ---------- 5) Gộp ----------

create or replace function public.merge_contacts(
  p_winner_id uuid,
  p_loser_id uuid,
  p_fields jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.app_role();
  w public.contacts%rowtype;
  l public.contacts%rowtype;
  v_fields text[];
  v_moved jsonb;
  n_deals int;
  n_acts int;
  n_convs int;
  n_ids int;
  n_tags int;
begin
  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'merge_contacts: chỉ chủ tiệm/quản trị/quản lý được gộp hồ sơ'
      using errcode = '42501';
  end if;
  if v_tenant is null then
    raise exception 'merge_contacts: không xác định được tiệm' using errcode = '42501';
  end if;
  if p_winner_id is null or p_loser_id is null or p_winner_id = p_loser_id then
    raise exception 'merge_contacts: phải là hai hồ sơ khác nhau' using errcode = '22023';
  end if;

  -- Khóa hai hàng theo thứ tự id cố định → hai người bấm Gộp cùng lúc không deadlock,
  -- và người đến sau đọc được trạng thái đã gộp (nhánh lũy đẳng bên dưới).
  perform 1
  from public.contacts
  where id in (p_winner_id, p_loser_id) and tenant_id = v_tenant
  order by id
  for update;

  select * into w from public.contacts where id = p_winner_id and tenant_id = v_tenant;
  select * into l from public.contacts where id = p_loser_id and tenant_id = v_tenant;
  if w.id is null or l.id is null then
    raise exception 'merge_contacts: không tìm thấy hồ sơ trong tiệm này' using errcode = 'P0002';
  end if;

  -- LŨY ĐẲNG: cặp này đã gộp đúng chiều rồi → không làm gì thêm, không phát event lại.
  if l.merged_into_id = p_winner_id then
    return jsonb_build_object(
      'status', 'noop',
      'winner_id', p_winner_id,
      'loser_id', p_loser_id,
      'moved', jsonb_build_object(
        'deals', 0, 'activities', 0, 'conversations', 0, 'tags', 0, 'identities', 0));
  end if;

  if l.merged_into_id is not null or w.merged_into_id is not null then
    raise exception 'merge_contacts: hồ sơ đã được gộp vào hồ sơ khác' using errcode = '22023';
  end if;
  if w.deleted_at is not null or l.deleted_at is not null then
    raise exception 'merge_contacts: hồ sơ đã bị xóa' using errcode = '22023';
  end if;

  -- Field nào NGƯỜI DÙNG chọn lấy của bản thua (mặc định: giữ của bản thắng)
  select coalesce(array_agg(e.key order by e.key), '{}'::text[])
  into v_fields
  from jsonb_each_text(coalesce(p_fields, '{}'::jsonb)) as e(key, val)
  where e.val = 'loser'
    and e.key in ('full_name', 'phone', 'email', 'source_id', 'company_id', 'owner_id', 'tier');

  -- ---- chuyển mọi hàng liên quan về bản giữ ----
  -- deals: FK NO ACTION, phải chuyển trước khi bản thua bị xóa mềm
  with moved as (
    update public.deals set contact_id = p_winner_id
    where contact_id = p_loser_id returning 1
  ) select count(*)::int into n_deals from moved;

  with moved as (
    update public.activities set contact_id = p_winner_id
    where contact_id = p_loser_id returning 1
  ) select count(*)::int into n_acts from moved;

  with moved as (
    update public.conversations set contact_id = p_winner_id
    where contact_id = p_loser_id returning 1
  ) select count(*)::int into n_convs from moved;

  -- contact_identities: unique (tenant_id, channel_type, external_id) — mỗi định danh
  -- đã duy nhất trong tiệm nên đổi chủ không bao giờ đụng ràng buộc; hợp nhất = giữ cả hai.
  with moved as (
    update public.contact_identities set contact_id = p_winner_id
    where contact_id = p_loser_id returning 1
  ) select count(*)::int into n_ids from moved;

  -- thẻ: HỢP (union) — thẻ trùng bị nuốt bởi on conflict, không nhân đôi
  select count(*)::int into n_tags
  from public.contact_tags where contact_id = p_loser_id;

  insert into public.contact_tags (tenant_id, contact_id, tag_id)
  select v_tenant, p_winner_id, ct.tag_id
  from public.contact_tags ct
  where ct.contact_id = p_loser_id
  on conflict (contact_id, tag_id) do nothing;

  delete from public.contact_tags where contact_id = p_loser_id;

  v_moved := jsonb_build_object(
    'deals', n_deals,
    'activities', n_acts,
    'conversations', n_convs,
    'tags', n_tags,
    'identities', n_ids);

  -- ---- bản giữ: nhận field được chọn + số liệu tích lũy ----
  update public.contacts set
    full_name = case when p_fields ->> 'full_name' = 'loser' then l.full_name else w.full_name end,
    -- phone và phone_e164 luôn đi cùng nhau: lấy nửa này bỏ nửa kia là hỏng dò trùng
    phone      = case when p_fields ->> 'phone' = 'loser' then l.phone else w.phone end,
    phone_e164 = case when p_fields ->> 'phone' = 'loser' then l.phone_e164 else w.phone_e164 end,
    email      = case when p_fields ->> 'email' = 'loser' then l.email else w.email end,
    source_id  = case when p_fields ->> 'source_id' = 'loser' then l.source_id else w.source_id end,
    company_id = case when p_fields ->> 'company_id' = 'loser' then l.company_id else w.company_id end,
    owner_id   = case when p_fields ->> 'owner_id' = 'loser' then l.owner_id else w.owner_id end,
    tier       = case when p_fields ->> 'tier' = 'loser' then l.tier else w.tier end,
    -- doanh thu tích lũy CỘNG (spec mục 6); tương tác cuối lấy mốc muộn hơn
    total_revenue = w.total_revenue + l.total_revenue,
    last_interaction_at = greatest(w.last_interaction_at, l.last_interaction_at),
    updated_at = now()
  where id = p_winner_id;

  -- ĐIỂM: KHÔNG lấy max điểm cũ của hai bên — điểm là số DẪN XUẤT, chấm lại mới đúng.
  -- Vì mọi hàng liên quan đã chuyển ở trên TRƯỚC bước này, máy chấm (migration #8)
  -- nhìn thấy đủ deal thắng + hội thoại + mốc tương tác của CẢ HAI hồ sơ, nên điểm
  -- sau gộp phản ánh hồ sơ hợp nhất chứ không phải trạng thái cũ của một bên.
  -- (trigger contacts_score_recompute cũng chạy vì email/SĐT/nguồn nằm trong SET ở trên;
  --  gọi tường minh để việc chấm lại không phụ thuộc danh sách cột của trigger đó.)
  perform public.recompute_contact_score(p_winner_id);

  -- ---- bản thua: xóa mềm + con trỏ về bản giữ ----
  -- contacts_emit_events cố ý IM LẶNG với xóa mềm nên bước này không phát event thừa.
  update public.contacts
  set deleted_at = now(), merged_into_id = p_winner_id, updated_at = now()
  where id = p_loser_id;

  -- Cặp gợi ý liên quan bản thua không còn nghĩa
  delete from public.contact_merge_dismissals
  where tenant_id = v_tenant
    and (contact_a_id = p_loser_id or contact_b_id = p_loser_id);

  insert into public.merge_logs (tenant_id, entity, kept_id, merged_id, merged_by, snapshot)
  values (
    v_tenant, 'contact', p_winner_id, p_loser_id, auth.uid(),
    jsonb_build_object(
      'winner_before', to_jsonb(w),
      'loser_before', to_jsonb(l),
      'fields_taken', to_jsonb(v_fields),
      'moved', v_moved));

  -- catalog: contact.merged (winner_id, loser_id, fields_taken, moved) — cùng transaction
  perform public.wf_emit(
    v_tenant, 'contact.merged', 'contact', p_winner_id::text,
    jsonb_build_object(
      'winner_id', p_winner_id,
      'loser_id', p_loser_id,
      'fields_taken', to_jsonb(v_fields),
      'moved', v_moved));

  return jsonb_build_object(
    'status', 'merged',
    'winner_id', p_winner_id,
    'loser_id', p_loser_id,
    'moved', v_moved);
end $$;

comment on function public.merge_contacts(uuid, uuid, jsonb) is
  'Gộp hai hồ sơ khách: chuyển deal/hoạt động/hội thoại/định danh, hợp thẻ, cộng doanh thu, chấm lại điểm trên hồ sơ hợp nhất, xóa mềm bản thua kèm merged_into_id, ghi merge_logs, phát contact.merged. Nguyên tử + lũy đẳng.';

-- ---------- 6) Không phải trùng ----------

create or replace function public.dismiss_duplicate_pair(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.app_role();
begin
  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'dismiss_duplicate_pair: không đủ quyền' using errcode = '42501';
  end if;
  if v_tenant is null or p_a is null or p_b is null or p_a = p_b then
    raise exception 'dismiss_duplicate_pair: cặp không hợp lệ' using errcode = '22023';
  end if;
  if (select count(*) from public.contacts
      where id in (p_a, p_b) and tenant_id = v_tenant) <> 2 then
    raise exception 'dismiss_duplicate_pair: không tìm thấy hồ sơ trong tiệm này'
      using errcode = 'P0002';
  end if;

  insert into public.contact_merge_dismissals
    (tenant_id, contact_a_id, contact_b_id, dismissed_by)
  values (v_tenant, least(p_a, p_b), greatest(p_a, p_b), auth.uid())
  on conflict do nothing;
end $$;

comment on function public.dismiss_duplicate_pair(uuid, uuid) is
  'Đánh dấu cặp khách "không phải trùng" — ghi theo thứ tự chuẩn, gọi lại nhiều lần vô hại.';

-- ---------- Quyền gọi ----------
-- Mặc định Postgres cấp EXECUTE cho PUBLIC; thu hồi rồi cấp lại đúng vai đăng nhập.
revoke execute on function public.contact_duplicate_base(int) from public;
revoke execute on function public.contact_duplicate_pairs(int, int) from public;
revoke execute on function public.contact_duplicate_count() from public;
revoke execute on function public.contact_merge_summary(uuid) from public;
revoke execute on function public.merge_contacts(uuid, uuid, jsonb) from public;
revoke execute on function public.dismiss_duplicate_pair(uuid, uuid) from public;

grant execute on function public.contact_duplicate_base(int) to authenticated;
grant execute on function public.contact_duplicate_pairs(int, int) to authenticated;
grant execute on function public.contact_duplicate_count() to authenticated;
grant execute on function public.contact_merge_summary(uuid) to authenticated;
grant execute on function public.merge_contacts(uuid, uuid, jsonb) to authenticated;
grant execute on function public.dismiss_duplicate_pair(uuid, uuid) to authenticated;

grant select on public.merge_logs to authenticated;
grant select, insert, delete on public.contact_merge_dismissals to authenticated;
