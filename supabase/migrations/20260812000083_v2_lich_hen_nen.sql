-- ============================================================
-- iFan.asia — Migration #83: V2 "Lịch hẹn" — nền tảng (ADR-0009,
-- docs/adr/0009-v2-lich-hen.md). Đọc ADR trước khi sửa file này — bảng, tập
-- trạng thái, hai ràng buộc chống trùng và phạm vi 6 việc đều đã CHỐT ở đó,
-- không phải tự chọn ở migration này.
--
-- Đúng phạm vi ADR mục 7 việc 1 — CHỈ dựng nền có người ghi trong đợt V2:
--   services      -- ADR mục 4: TỐI THIỂU (tên · thời lượng · giá · bật/tắt ·
--                    thứ tự). Thời lượng là thuộc tính của LỊCH, không phải của
--                    bán hàng — không có nó thì không tính được slot.
--   resources     -- giường/phòng/ghế/bàn/máy: cái mà MỘT ca chiếm chỗ
--   appointments  -- 5 trạng thái (ADR mục 5) + 2 EXCLUDE chống trùng (mục 6)
--   2 EXCLUDE     -- btree_gist đã bật từ migration #2; chống trùng nằm ở CSDL,
--                    KHÔNG ở giao diện (bất biến 1 + ADR mục 6)
--   trash_*       -- nối lịch hẹn vào Thùng rác 30 ngày dùng chung (bất biến 11
--                    + 13: hạ tầng dùng chung là bản duy nhất, cấm tự chế)
--   industry_packs.content->'services' + apply_industry_pack() -- dịch vụ mẫu
--                    theo pack ngành, cùng khuôn 'lead_form_fields' của #80
--   appointment_hours_warning() -- ADR mục 8 ca 6: đặt ngoài giờ/trúng ngày
--                    nghỉ phải CẢNH BÁO RÕ, không im lặng cho qua
--   appointments_emit_events -- bất biến 12 + luật D1: đúng 5 event, khai sẵn
--                    ở docs/EVENT_CATALOG.md và Quy hoạch mục 32
--
-- CỐ TÌNH CHƯA DỰNG (ADR mục 7 "CẮT" — có lý do, KHÔNG phải thiếu sót):
--   staff_services (thợ nào làm được dịch vụ nào) — đo ra ~1,1 người/tiệm,
--   dựng bây giờ = bảng rỗng ở mọi tiệm (D2) · waitlist · hàng chờ walk-in ·
--   hồ sơ ca · lịch lặp · đệm ca + `visits` lượt khách (31.75) · thu cọc thật ·
--   trạng thái `draft`/`confirmed` (không có ai sinh ra — ADR mục 5).
--
-- ĐÍNH CHÍNH ghi rõ để không ai tưởng bị quên: AGENTS.md (viết trước ADR-0009)
-- yêu cầu "sửa hợp đồng 24b/24c theo 31.75 TRƯỚC khi dựng appointments".
-- ADR-0009 mục 7 viết SAU đã CẮT 31.75 khỏi V2 (luật đọc: mục viết sau thắng).
-- Khi V3 dựng `visits`, appointments nhận thêm cột `visit_id` bằng migration
-- riêng — cột đó bây giờ chưa có ai ghi vào (luật D2).
--
-- ĐIỂM DỄ SAI NHẤT của file này (ADR mục 6, kiểm bằng scripts/rls-smoke.mjs):
-- hai EXCLUDE CHỈ áp cho trạng thái CÒN GIỮ CHỖ (`booked`, `arrived`).
-- `cancelled` / `no_show` / xoá mềm PHẢI NHẢ CHỖ — nếu không, tiệm huỷ một ca
-- rồi không đặt lại được vào đúng khung giờ đó, và không ai hiểu vì sao.
-- ============================================================

-- ---------- services: dịch vụ TỐI THIỂU (ADR mục 4) ----------
-- KHÔNG có deleted_at: ADR mục 4 chốt đúng 5 cột nghiệp vụ, `is_active=false`
-- là đường "ngừng bán" (dịch vụ cũ vẫn phải đọc được từ lịch cũ). Lịch giữ
-- `service_id ... on delete set null` nên kể cả xoá cứng cũng không mất ca.
-- V3 khi dựng catalog phải MỞ RỘNG bảng này, không tạo bảng thứ hai cùng nghĩa
-- (ADR mục 4, phần "Hệ quả").

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Thời lượng ca. >0 vì ca dài 0 phút không chiếm chỗ ⇒ EXCLUDE (dùng khoảng
  -- nửa mở) sẽ không bao giờ bắt được trùng ⇒ chống trùng thủng một lỗ câm.
  duration_minutes int not null check (duration_minutes > 0),
  price_vnd bigint not null default 0 check (price_vnd >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
alter table public.services enable row level security;
-- Khuôn `lead_sources`: MỌI thành viên ĐỌC (thợ cần biết dịch vụ để đặt ca),
-- owner/admin/manager GHI.
create policy services_select on public.services for select
  using (tenant_id = (select public.current_tenant_id()));
create policy services_manage on public.services for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger services_touch before update on public.services
  for each row execute function public.touch_updated_at();
revoke all on public.services from anon;

comment on table public.services is
  'ADR-0009 mục 4. Bản TỐI THIỂU của V2: chỉ đủ để tính slot. Biến thể/ảnh/danh mục/giá sỉ/thuế/tồn kho là V3 — mở rộng bảng NÀY, cấm dựng bảng thứ hai cùng nghĩa.';

-- ---------- resources: cái mà MỘT ca chiếm chỗ ----------
-- Tập `kind` chọn theo đúng 4 pack ngành CÓ module `booking`/`booking_table`
-- trong industry_packs (#61) — không bịa loại cho ngành chưa dùng lịch:
--   bed     giường  — spa/massage (pack 'spa')
--   room    phòng   — phòng khám/phòng trị liệu (pack 'kham')
--   chair   ghế     — ghế nha, ghế cắt/gội, ghế nail (pack 'kham'/'spa';
--                     "khử trùng ghế nha" — Quy hoạch 31.75)
--   table   bàn     — bàn ăn (pack 'fnb', module 'booking_table'), bàn tắm
--                     chải thú cưng (pack 'pet')
--   machine máy     — thiết bị dùng chung: máy triệt lông, laser, máy sấy
-- Thêm loại mới = một dòng migration; đoán trước loại cho ngành chưa có ai
-- dùng là vi phạm luật D2.

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('bed','room','chair','table','machine')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
alter table public.resources enable row level security;
create policy resources_select on public.resources for select
  using (tenant_id = (select public.current_tenant_id()));
create policy resources_manage on public.resources for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger resources_touch before update on public.resources
  for each row execute function public.touch_updated_at();
revoke all on public.resources from anon;

-- ---------- appointments ----------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  -- Người LÀM ca. `on delete restrict`: lịch sử ca không được biến mất theo
  -- tài khoản; đường cho người nghỉ việc là chuyển ca sang người khác
  -- (fan-out `member.offboarded`, ma trận 32 đường 43 — V7), không phải xoá.
  staff_user_id uuid not null references auth.users(id) on delete restrict,
  -- Nullable: nhiều ca không chiếm tài nguyên nào (tư vấn tại quầy).
  resource_id uuid references public.resources(id) on delete set null,
  -- Nullable: dịch vụ có thể bị gỡ khỏi bảng giá sau — ca cũ vẫn phải đọc được,
  -- giá đã chốt nằm ở `price_vnd` ngay trên ca này.
  service_id uuid references public.services(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  -- ĐÚNG 5 trạng thái — ADR mục 5. `draft` bị cắt (V2 đặt một phát từ khung
  -- chat, không có bước nháp); `confirmed` bị cắt (chỉ có nghĩa khi KHÁCH xác
  -- nhận, mà V2 không có kênh tới khách — ADR mục 3). Thêm lại = migration
  -- một dòng khi Zalo OA cắm xong, rẻ hơn nhiều so với sống chung với một
  -- trạng thái luôn rỗng mà ai đọc cũng tưởng có nghĩa.
  status text not null default 'booked'
    check (status in ('booked','arrived','done','cancelled','no_show')),
  -- Giá CHỐT LÚC ĐẶT, chép từ services.price_vnd — bảng giá đổi sau không
  -- được sửa ngược vào ca đã đặt.
  price_vnd bigint not null default 0 check (price_vnd >= 0),
  note text check (note is null or char_length(note) <= 500),
  -- Đặt từ đâu. Chỉ 2 giá trị vì V2 chỉ có 2 cửa vào ghi thật: khung chat Hộp
  -- thư (việc 5) và màn Lịch (việc 4). Trang tự đặt của khách ('public',
  -- ma trận 32 đường 34) dựng ở V2.5 — thêm giá trị lúc đó, không khai trước
  -- một giá trị chưa ai ghi (luật D2).
  source text not null default 'chat' check (source in ('chat','calendar')),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200),
  -- Bất biến 11: xoá mềm, vào Thùng rác 30 ngày (xem trash_* bên dưới).
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ca kết thúc sau khi bắt đầu. Bằng nhau cũng cấm: khoảng rỗng không chồng
  -- lên bất cứ gì ⇒ lọt qua cả hai EXCLUDE.
  constraint appointments_time_check check (end_at > start_at)
);

-- Màn Lịch đọc theo (tiệm, khoảng ngày) và chỉ lấy ca còn sống.
create index appointments_tenant_start_idx
  on public.appointments (tenant_id, start_at) where deleted_at is null;
create index appointments_staff_start_idx
  on public.appointments (tenant_id, staff_user_id, start_at) where deleted_at is null;
create index appointments_contact_idx on public.appointments (contact_id);
create index appointments_resource_idx on public.appointments (resource_id)
  where resource_id is not null;
create index appointments_service_idx on public.appointments (service_id)
  where service_id is not null;

-- ---------- HAI RÀNG BUỘC CHỐNG TRÙNG (ADR mục 6) ----------
-- `tstzrange(a, b)` mặc định là khoảng NỬA MỞ '[)' — ca 10:00–11:00 và
-- 11:00–12:00 KHÔNG chồng nhau. Đúng ý: xếp sát lưng nhau là hợp lệ.
--
-- Mệnh đề WHERE là phần dễ sai nhất: chỉ trạng thái CÒN GIỮ CHỖ mới chiếm.
-- Huỷ / không đến / xoá mềm PHẢI nhả chỗ ra cho người sau.

alter table public.appointments
  add constraint appointments_no_overlap_staff
  exclude using gist (
    tenant_id with =,
    staff_user_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status in ('booked','arrived') and deleted_at is null);

-- resource_id NULL (ca không chiếm tài nguyên) bị loại thẳng khỏi chỉ mục:
-- toán tử `=` trên NULL trả NULL nên hai ca như vậy vốn đã không "trùng" nhau,
-- ghi rõ ở WHERE để không ai phải đoán và để chỉ mục khỏi phình.
alter table public.appointments
  add constraint appointments_no_overlap_resource
  exclude using gist (
    tenant_id with =,
    resource_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (resource_id is not null and status in ('booked','arrived') and deleted_at is null);

comment on constraint appointments_no_overlap_staff on public.appointments is
  'ADR-0009 mục 6: một thợ không ở hai chỗ. Hai người đặt cùng lúc thì CSDL thắng; tầng web PHẢI dịch mã 23P01 thành câu "slot vừa được giữ, chọn giờ khác" — cấm lỗi câm, cấm lỗi kỹ thuật trần (luật luồng 3).';
comment on constraint appointments_no_overlap_resource on public.appointments is
  'ADR-0009 mục 6: một giường không nhận hai khách. Cùng luật dịch lỗi như ràng buộc thợ.';

-- ---------- RLS appointments: Pattern B (khuôn `contacts`) ----------
-- owner/admin/manager/viewer thấy CẢ TIỆM; staff chỉ thấy ca của chính mình.
-- viewer đọc được nhưng không ghi (migration #65).

alter table public.appointments enable row level security;

create policy appointments_select on public.appointments for select
  using (tenant_id = (select public.current_tenant_id())
         and ((select public.app_role()) in ('owner','admin','manager','viewer')
              or staff_user_id = (select auth.uid())));

create policy appointments_insert on public.appointments for insert
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner','admin','manager')
                   or staff_user_id = (select auth.uid()))); -- staff đặt phải là ca của mình

create policy appointments_update on public.appointments for update
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) <> 'viewer'
         and ((select public.app_role()) in ('owner','admin','manager')
              or staff_user_id = (select auth.uid())))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer'
              and ((select public.app_role()) in ('owner','admin','manager')
                   or staff_user_id = (select auth.uid())));

-- Xoá CỨNG chỉ dành cho owner/admin/manager (khuôn contacts_delete). Đường
-- dùng thật của app là xoá MỀM (deleted_at) — bất biến 11.
create policy appointments_delete on public.appointments for delete
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'));

create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();
revoke all on public.appointments from anon;

-- ---------- Sự kiện: ĐÚNG 5, một cho mỗi trạng thái (bất biến 12 + D1) ----------
-- Khai trước ở docs/EVENT_CATALOG.md và Quy hoạch mục 32 (hàng 52).
-- Cách phát: TRIGGER DB, cùng transaction nghiệp vụ — giống contacts/deals,
-- không có đường nào ghi mà quên phát.
--
-- CỐ Ý KHÔNG phát (khai rõ để không bị tính là sót):
--   * `appointment.status_changed` gộp — 4 event trạng thái dưới đây đã phủ hết;
--     phát cả hai khiến consumer ĐẾM HAI LẦN (đúng bài học `bulk_operations`).
--     Đây là ĐÍNH CHÍNH tên event ở ma trận 32 hàng 7.
--   * `appointment.rescheduled` (dời giờ) — V2 chưa có consumer nào nghe: job
--     nhắc nhân viên đọc thẳng `start_at` lúc gửi nên luôn thấy giờ mới.
--   * Xoá mềm — giữ nguyên quy ước sẵn có của kho ("deleted_at không phát
--     event"); huỷ ca là `appointment.cancelled`, không phải xoá.

create or replace function public.appointments_emit_events() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'contact_id', new.contact_id,
    'staff_user_id', new.staff_user_id,
    'resource_id', new.resource_id,
    'service_id', new.service_id,
    'start_at', new.start_at,
    'end_at', new.end_at,
    'price_vnd', new.price_vnd,
    'source', new.source);

  if tg_op = 'INSERT' then
    perform public.wf_emit(new.tenant_id, 'appointment.booked', 'appointment',
                           new.id::text, v_payload);
    return null;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    return null;
  end if;

  if new.status is distinct from old.status then
    perform public.wf_emit(
      new.tenant_id, 'appointment.' || new.status, 'appointment', new.id::text,
      case when new.status = 'cancelled'
        then v_payload || jsonb_build_object('cancel_reason', new.cancel_reason,
                                             'cancelled_by', auth.uid())
        else v_payload end);
  end if;
  return null;
end $$;

create trigger appointments_emit_events after insert or update on public.appointments
  for each row execute function public.appointments_emit_events();

-- ---------- Thùng rác 30 ngày: nối lịch hẹn vào hạ tầng dùng chung ----------
-- Bất biến 11 + 13. Chỉ THÊM nhánh 'appointment' vào 3 hàm sẵn có (migration
-- #60), không đổi hành vi của contact/deal/company.

create or replace function public.trash_list(p_limit int default 100)
returns table (
  entity_type text, entity_id uuid, title text, deleted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
begin
  if v_tenant is null or (select public.app_role()) not in ('owner','admin') then
    raise exception 'forbidden';
  end if;
  return query
    select 'contact'::text, c.id, c.full_name, c.deleted_at
      from public.contacts c
      where c.tenant_id = v_tenant and c.deleted_at is not null
    union all
    select 'deal'::text, d.id, d.title, d.deleted_at
      from public.deals d
      where d.tenant_id = v_tenant and d.deleted_at is not null
    union all
    select 'company'::text, co.id, co.name, co.deleted_at
      from public.companies co
      where co.tenant_id = v_tenant and co.deleted_at is not null
    union all
    -- Tiêu đề đọc được: tên khách + giờ ca THEO GIỜ TIỆM (tenants.timezone),
    -- không phải UTC — chủ tiệm phải nhận ra ngay ca nào bị xoá.
    select 'appointment'::text, a.id,
           ct.full_name || ' — ' ||
           to_char(a.start_at at time zone t.timezone, 'DD/MM HH24:MI'),
           a.deleted_at
      from public.appointments a
      join public.tenants t on t.id = a.tenant_id
      join public.contacts ct on ct.id = a.contact_id
      where a.tenant_id = v_tenant and a.deleted_at is not null
    order by 4 desc
    limit p_limit;
end;
$$;
revoke execute on function public.trash_list(int) from public, anon;
grant execute on function public.trash_list(int) to authenticated;

create or replace function public.trash_restore(p_entity_type text, p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
begin
  if v_tenant is null or (select public.app_role()) not in ('owner','admin') then
    raise exception 'forbidden';
  end if;
  if p_entity_type = 'contact' then
    update public.contacts set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  elsif p_entity_type = 'deal' then
    update public.deals set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  elsif p_entity_type = 'company' then
    update public.companies set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  elsif p_entity_type = 'appointment' then
    -- Khôi phục ca có thể ĐỤNG chỗ đã bị người khác giữ trong lúc nó nằm thùng
    -- rác: EXCLUDE sẽ chặn (23P01) và tầng web dịch thành "khung giờ đã có
    -- người, chọn giờ khác" — đúng ý, không được lặng lẽ chồng lịch.
    update public.appointments set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  else
    raise exception 'invalid_entity_type';
  end if;
end;
$$;
revoke execute on function public.trash_restore(text, uuid) from public, anon;
grant execute on function public.trash_restore(text, uuid) to authenticated;

create or replace function public.trash_purge_expired()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.contacts where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.deals where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.companies where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.appointments where deleted_at is not null and deleted_at < now() - interval '30 days';
end;
$$;
revoke execute on function public.trash_purge_expired() from public, anon, authenticated;
-- Job 'trash-purge-nightly' đã có từ migration #60 — không đăng ký lại.

-- ---------- appointment_hours_warning: ADR mục 8 ca 6 ----------
-- CẢNH BÁO, KHÔNG CHẶN. Đặt ngoài giờ là chuyện có thật (khách quen xin thêm
-- ca cuối ngày) — chặn cứng ở CSDL sẽ đẩy tiệm sang ghi tay. Nhưng "im lặng
-- cho qua" cũng bị cấm (luật luồng 3), nên phép so nằm ở CSDL — MỘT nguồn sự
-- thật — thay vì để mỗi màn tự tính lại toán múi giờ.
--
-- Bài học 12/08 (scripts/storefront-hours-smoke.mjs): so giờ phải quy về GIỜ
-- ĐỊA PHƯƠNG của tiệm (tenants.timezone) rồi mới đối chiếu business_hours —
-- business_hours lưu kiểu `time` không offset. So thẳng theo UTC thì bộ ca
-- chạy giờ quốc tế xanh giả trong khi 100% tiệm Việt Nam hỏng.
-- V2 chỉ ĐỌC business_hours/business_closures (ADR mục 9), không sửa gì.

create or replace function public.appointment_hours_warning(
  p_start timestamptz,
  p_end timestamptz
) returns jsonb
language plpgsql stable
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_tz text;
  v_local_start timestamp;
  v_local_end timestamp;
  v_date date;
  v_dow int;
  v_closure public.business_closures%rowtype;
  v_has_hours boolean;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  select t.timezone into v_tz from public.tenants t where t.id = v_tenant;

  v_local_start := p_start at time zone v_tz;
  v_local_end := p_end at time zone v_tz;
  v_date := v_local_start::date;
  v_dow := extract(dow from v_local_start)::int;

  -- Ca vắt qua nửa đêm không so được với khung giờ theo THỨ. Nói thẳng thay vì
  -- trả bừa một câu trả lời sai.
  if v_local_end::date <> v_date then
    return jsonb_build_object('ok', false, 'reason', 'crosses_midnight');
  end if;

  -- Tiệm CHƯA KHAI giờ mở cửa (đo 12/08: 0/2 tiệm thật đã khai) — không có gì
  -- để đối chiếu thì không dựng cảnh báo giả. Trả cờ riêng để màn đặt lịch mời
  -- tiệm khai giờ, KHÔNG im lặng.
  select exists (select 1 from public.business_hours h where h.tenant_id = v_tenant)
    into v_has_hours;
  if not v_has_hours then
    return jsonb_build_object('ok', true, 'reason', 'hours_not_set');
  end if;

  -- Ngày nghỉ/đổi giờ đột xuất ĐÈ lên giờ lặp theo thứ (khuôn migration #80).
  select * into v_closure from public.business_closures c
    where c.tenant_id = v_tenant and v_date between c.date_from and c.date_to
    order by c.date_from limit 1;
  if v_closure.id is not null then
    if v_closure.is_full_day then
      return jsonb_build_object('ok', false, 'reason', 'closure',
                                'closure_reason', v_closure.reason);
    end if;
    if v_local_start::time >= v_closure.open_time
       and v_local_end::time <= v_closure.close_time then
      return jsonb_build_object('ok', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'closure_hours',
                              'closure_reason', v_closure.reason,
                              'open_time', to_char(v_closure.open_time, 'HH24:MI'),
                              'close_time', to_char(v_closure.close_time, 'HH24:MI'));
  end if;

  -- MỘT thứ có NHIỀU dòng giờ (nghỉ trưa) — ca phải nằm TRỌN trong một khung.
  if exists (
    select 1 from public.business_hours h
      where h.tenant_id = v_tenant and h.weekday = v_dow and not h.is_closed
        and v_local_start::time >= h.open_time
        and v_local_end::time <= h.close_time
  ) then
    return jsonb_build_object('ok', true);
  end if;

  if not exists (
    select 1 from public.business_hours h
      where h.tenant_id = v_tenant and h.weekday = v_dow and not h.is_closed
  ) then
    return jsonb_build_object('ok', false, 'reason', 'day_closed');
  end if;

  return jsonb_build_object('ok', false, 'reason', 'outside_hours');
end $$;
revoke execute on function public.appointment_hours_warning(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.appointment_hours_warning(timestamptz, timestamptz)
  to authenticated;

-- ---------- industry_packs: dịch vụ mẫu theo pack ngành ----------
-- Cùng khuôn 'lead_form_fields' của migration #80: một mảnh ở gốc `content`.
-- CHỈ seed cho pack có module `booking` thật trong #61 (spa/kham/pet).
-- Mảng RỖNG khai TƯỜNG MINH cho 5 pack còn lại — "cố ý bỏ trống" phải nhìn
-- thấy trong dữ liệu, không chỉ nằm trong chú thích:
--   shop/retail  — modules orders/inventory/shipping/loyalty, KHÔNG có booking.
--                  Bán theo món, không có ca theo giờ ⇒ "dịch vụ tính bằng
--                  phút" vô nghĩa. Catalog hàng hoá là V3/V4, không phải bảng này.
--   fnb          — 'booking_table' là giữ BÀN theo khung giờ: đặt bàn dùng
--                  `resources` (kind='table') và để `service_id` trống. Đổ menu
--                  món ăn vào `services` là sai nghĩa (món ăn = hàng hoá V3).
--   education/other — `modules: []`, chưa có lịch hẹn.
-- Giá/thời lượng dưới đây là số KHỞI ĐIỂM để tiệm sửa, cùng tinh thần với
-- pipeline_stages/quick_replies mẫu — không phải bảng giá thật của ai.

update public.industry_packs
  set content = content || jsonb_build_object('services', '[
    {"name": "Chăm sóc da cơ bản",   "duration_minutes": 60, "price_vnd": 350000, "sort_order": 0},
    {"name": "Massage trị liệu",     "duration_minutes": 90, "price_vnd": 450000, "sort_order": 1},
    {"name": "Triệt lông (1 vùng)",  "duration_minutes": 45, "price_vnd": 500000, "sort_order": 2},
    {"name": "Gội đầu dưỡng sinh",   "duration_minutes": 45, "price_vnd": 150000, "sort_order": 3}
  ]'::jsonb)
  where key = 'spa';

update public.industry_packs
  set content = content || jsonb_build_object('services', '[
    {"name": "Khám tổng quát",             "duration_minutes": 30, "price_vnd": 300000, "sort_order": 0},
    {"name": "Tư vấn chuyên khoa",         "duration_minutes": 30, "price_vnd": 200000, "sort_order": 1},
    {"name": "Điều trị theo liệu trình",   "duration_minutes": 60, "price_vnd": 500000, "sort_order": 2},
    {"name": "Tái khám",                   "duration_minutes": 20, "price_vnd": 0,      "sort_order": 3}
  ]'::jsonb)
  where key = 'kham';

update public.industry_packs
  set content = content || jsonb_build_object('services', '[
    {"name": "Tắm + sấy",      "duration_minutes": 60, "price_vnd": 150000, "sort_order": 0},
    {"name": "Cắt tỉa lông",   "duration_minutes": 90, "price_vnd": 300000, "sort_order": 1},
    {"name": "Khám thú y",     "duration_minutes": 30, "price_vnd": 200000, "sort_order": 2},
    {"name": "Tiêm phòng",     "duration_minutes": 20, "price_vnd": 250000, "sort_order": 3}
  ]'::jsonb)
  where key = 'pet';

update public.industry_packs
  set content = content || jsonb_build_object('services', '[]'::jsonb)
  where key in ('shop', 'retail', 'fnb', 'education', 'other');

-- ---------- apply_industry_pack: seed dịch vụ mẫu ----------
-- Giữ NGUYÊN thân hàm của migration #74 (kể cả mệnh đề ON CONFLICT đã vá cho
-- partial unique index của `tags`), CHỈ thêm vòng seed `services`.

create or replace function public.apply_industry_pack(p_pack_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_sample jsonb;
  v_services jsonb;
  v_tag text;
  v_qr jsonb;
  v_svc jsonb;
  v_inactive_days int;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if (select public.app_role()) not in ('owner','admin') then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.industry_packs where key = p_pack_key) then
    raise exception 'invalid_pack_key';
  end if;

  update public.tenants set industry = p_pack_key where id = v_tenant;

  select content -> 'sample_data', content -> 'services'
    into v_sample, v_services
    from public.industry_packs where key = p_pack_key;

  -- Tags mẫu — arbiter phải khớp đúng partial unique index tags_tenant_id_name_active_idx
  for v_tag in select jsonb_array_elements_text(coalesce(v_sample -> 'tags', '[]'::jsonb))
  loop
    insert into public.tags (tenant_id, name) values (v_tenant, v_tag)
      on conflict (tenant_id, name) where deleted_at is null do nothing;
  end loop;

  -- Câu trả lời nhanh mẫu
  for v_qr in select jsonb_array_elements(coalesce(v_sample -> 'quick_replies', '[]'::jsonb))
  loop
    insert into public.quick_replies (tenant_id, title, content, sort_order)
      values (v_tenant, v_qr ->> 'title', v_qr ->> 'content', coalesce((v_qr ->> 'sort_order')::int, 0))
      on conflict (tenant_id, title) do nothing;
  end loop;

  -- Dịch vụ mẫu (migration #83, ADR-0009 mục 4). Pack không có booking để
  -- mảng rỗng — vòng lặp không chạy, không cần nhánh riêng. `do nothing` để
  -- đổi pack lần hai không đè lên giá tiệm đã tự sửa.
  for v_svc in select jsonb_array_elements(coalesce(v_services, '[]'::jsonb))
  loop
    insert into public.services (tenant_id, name, duration_minutes, price_vnd, sort_order)
      values (v_tenant, v_svc ->> 'name',
              (v_svc ->> 'duration_minutes')::int,
              coalesce((v_svc ->> 'price_vnd')::bigint, 0),
              coalesce((v_svc ->> 'sort_order')::int, 0))
      on conflict (tenant_id, name) do nothing;
  end loop;

  -- 2 view mặc định (24p, mục 36.10A) — số ngày khác nhau vì nhịp quay lại
  -- tự nhiên của từng nghề khác nhau (quán cà phê 1 tuần/lần vs nha khoa
  -- khám định kỳ 6 tháng). Đây là con số KHỞI ĐIỂM, tiệm sửa lại được.
  v_inactive_days := case p_pack_key
    when 'spa' then 60
    when 'kham' then 180
    when 'pet' then 75
    when 'fnb' then 30
    when 'shop' then 45
    when 'retail' then 60
    when 'education' then 90
    else 60 -- 'other' và mọi key ngoài danh sách trên
  end;

  insert into public.saved_views (tenant_id, user_id, screen, name, query, vocab_version, position)
    values
      (v_tenant, null, 'contacts', 'Cần kéo về', 'tier=vip&inactive_days=' || v_inactive_days, 1, 0),
      (v_tenant, null, 'contacts', 'Khách mới', 'tier=new', 1, 1)
    on conflict do nothing;

  perform public.record_audit_log('tenant', v_tenant, 'pack_applied', jsonb_build_object('pack_key', p_pack_key));
end;
$$;
