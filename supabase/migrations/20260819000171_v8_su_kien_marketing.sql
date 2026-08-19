-- V8 events (19/08/2026) — Sự kiện marketing: chiến dịch · trần tiền giảm tự
-- dừng · đồng ý nhận tin · gửi tin · tổng kết.
-- Thẻ design: design-system/man-su-kien-marketing.html (5 quyết định đã chốt).
--
-- ════════════════════════════════════════════════════════════════════
-- BỐN ĐIỂM PHẢI CHỐT TRƯỚC, ghi lại để người sau không mở lại
-- ════════════════════════════════════════════════════════════════════
--
-- (1) CHIẾN DỊCH KHÔNG DỰNG HỆ MÃ THỨ HAI. Thẻ nói thẳng: "ba cái chặn cứng
--     giống hệt voucher". Ba luật đó (trần tiền giảm · không cộng dồn · bắt buộc
--     có ngày kết thúc) đã đóng đinh sẵn ở bảng `vouchers` từ #157 —
--     `max_discount_vnd not null`, một đơn một mã (unique trên order_id),
--     `expires_at not null`. Nối bằng `vouchers.campaign_id` là DÙNG LẠI cả ba;
--     dựng bảng mã riêng cho chiến dịch là viết lại cả ba, và bản thứ hai sẽ
--     thiếu một luật nào đó — thiếu luật nào thì tiền chảy ra đúng chỗ đó.
--
-- (2) TRẦN CHẠM THÌ TỰ DỪNG PHẢI LÀ TRIGGER. Thẻ: "chạm ngưỡng thì tự dừng,
--     không đợi ai nhớ". Cron chạy 5 phút một lần thì 5 phút đó vẫn cho đi tiền
--     không trần; lời nhắc trên màn hình thì phải có người đang mở màn hình.
--     Trigger trên `voucher_redemptions` chạy ĐÚNG lúc lượt dùng được ghi, trong
--     cùng transaction — không có khe hở nào.
--
-- (3) TRẠNG THÁI ĐỒNG Ý NHẬN TIN PHẢI `not null` VỚI MẶC ĐỊNH AN TOÀN.
--     Kho CHƯA CÓ cột nào về consent (đã soát cả 169 migration trước). Nếu thêm
--     dạng nullable thì mọi khách hiện có sẽ mang giá trị null, và mọi câu lọc
--     kiểu `where consent <> 'withdrawn'` sẽ cho null đi qua — tức là mặc định
--     GỬI cho toàn bộ tệp khách chưa ai hỏi ý. Đó là lỗi nguy hiểm nhất của cả
--     mảng này: không hỏng gì trông thấy, chỉ là hàng nghìn người bị nhắn tin
--     mà không đồng ý. `not null default 'unknown'` ⇒ mặc định KHÔNG gửi.
--
-- (4) THẺ KHÔNG NÓI VỀ VAI cho mảng này. Mặc định chọn ở đây, ghi rõ để người
--     sau biết đây là lựa chọn chứ không phải trích từ thẻ: quản lý trở lên
--     (owner/admin/manager) quản chiến dịch và gửi tin — vì đây là chỗ cho đi
--     tiền và chạm vào toàn bộ tệp khách; ĐỌC thì mọi thành viên trong tiệm,
--     vì nhân viên đứng quầy phải biết đang có ưu đãi gì mà trả lời khách.

-- ════════════════════════════════════════════════════════════════════
-- 1. CHIẾN DỊCH
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 160),
  start_at   timestamptz not null default now(),

  -- ── HAI CỘT `not null` DƯỚI ĐÂY LÀ QUYẾT ĐỊNH 3 CỦA THẺ ──
  -- Bỏ trống `end_at` = chiến dịch chạy vô thời hạn, và thẻ gọi đúng tên thứ đó:
  -- "bảng giá mới mà không ai nhận ra". Bỏ trống trần = cho đi tiền không đáy.
  -- Đây là cùng một khuôn với `vouchers.expires_at` + `vouchers.max_discount_vnd`
  -- (#157) — hai luật đó đã cứu tiền một lần rồi, không viết lại phiên bản lỏng.
  end_at                 timestamptz not null,
  max_discount_total_vnd bigint      not null check (max_discount_total_vnd > 0),

  offer_note text check (offer_note is null or length(offer_note) <= 500),
  -- 'stopped' = chạm trần, máy tự dừng (mục 3). 'ended' = hết ngày, người chốt.
  status     text not null default 'draft'
             check (status in ('draft', 'running', 'stopped', 'ended')),
  stopped_at timestamptz,

  -- Thẻ, mục "Cái iFan KHÔNG làm": không mua quảng cáo hộ, chỉ GHI NHẬN chi phí
  -- đã tiêu để tính được "còn lại bao nhiêu". Nên đây là số nhập tay, không có
  -- đường nối nào ra ví quảng cáo.
  ad_cost_vnd bigint not null default 0 check (ad_cost_vnd >= 0),

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint campaigns_ngay_hop_le check (end_at > start_at)
);
create index if not exists campaigns_tenant_idx
  on public.campaigns (tenant_id, status, end_at desc);

drop trigger if exists campaigns_touch on public.campaigns;
create trigger campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();

-- Điểm (1) đầu file: chiến dịch nối vào HỆ MÃ ĐÃ CÓ, không dựng hệ thứ hai.
-- `set null` chứ không cascade: xoá chiến dịch không được xoá theo lịch sử mã đã
-- phát ra — mã đó có thể đã dùng thật và đang treo trong `voucher_redemptions`.
alter table public.vouchers
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
create index if not exists vouchers_campaign_idx
  on public.vouchers (campaign_id) where campaign_id is not null;

-- ── TRẦN TỔNG: chạm là TỰ DỪNG ─────────────────────────────────────
-- Điểm (2) đầu file. Cộng dồn `discount_vnd` của mọi lượt dùng thuộc chiến dịch
-- rồi so với trần. Đọc từ sổ lượt dùng chứ KHÔNG nuôi một ô cộng dồn riêng —
-- cùng lý do đã ghi ở #157: bộ đếm rời luôn lệch với sự thật.
--
-- Dừng chiến dịch mà để mã vẫn 'active' thì "tự dừng" không dừng được gì: khách
-- tiếp theo vẫn quẹt mã và tiền vẫn chảy. Nên hạ luôn mã của chiến dịch xuống
-- 'paused' — đó đúng là cái chốt mà `voucher_check` (#159, dòng 99) đã kiểm sẵn.
create or replace function public.campaign_tran_tu_dung()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign uuid;
  v_tran     bigint;
  v_da_cho   bigint;
begin
  select v.campaign_id into v_campaign
    from public.vouchers v where v.id = new.voucher_id;
  if v_campaign is null then return new; end if;   -- mã lẻ, không thuộc chiến dịch nào

  select c.max_discount_total_vnd into v_tran
    from public.campaigns c where c.id = v_campaign;
  if v_tran is null then return new; end if;

  -- Trigger AFTER ⇒ dòng vừa ghi đã nằm trong tổng này.
  select coalesce(sum(r.discount_vnd), 0) into v_da_cho
    from public.voucher_redemptions r
    join public.vouchers v2 on v2.id = r.voucher_id
   where v2.campaign_id = v_campaign;

  if v_da_cho >= v_tran then
    update public.campaigns
       set status = 'stopped', stopped_at = now()
     where id = v_campaign and status <> 'stopped';
    update public.vouchers
       set status = 'paused'
     where campaign_id = v_campaign and status = 'active';
  end if;
  return new;
end;
$$;
revoke execute on function public.campaign_tran_tu_dung() from public, anon;

drop trigger if exists voucher_redemptions_campaign_tran on public.voucher_redemptions;
create trigger voucher_redemptions_campaign_tran
  after insert on public.voucher_redemptions
  for each row execute function public.campaign_tran_tu_dung();

-- ════════════════════════════════════════════════════════════════════
-- 2. ĐỒNG Ý NHẬN TIN — trên `contacts`
-- ════════════════════════════════════════════════════════════════════
-- Xem điểm (3) đầu file: `not null` + mặc định AN TOÀN là toàn bộ giá trị của
-- mục này. Ba giá trị, tập đóng, không có ô "chưa rõ" nào lọt ra ngoài check.
alter table public.contacts
  add column if not exists marketing_consent text not null default 'unknown';
alter table public.contacts
  add column if not exists marketing_consent_at timestamptz;
alter table public.contacts
  add column if not exists marketing_consent_withdrawn_at timestamptz;
-- Mốc để tính luật "vừa nhận tin trong 7 ngày" (mục 4).
alter table public.contacts
  add column if not exists marketing_last_sent_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_marketing_consent_hop_le') then
    alter table public.contacts add constraint contacts_marketing_consent_hop_le
      check (marketing_consent in ('unknown', 'granted', 'withdrawn'));
  end if;
  -- "Đã rút" mà không có mốc rút thì không chứng minh được với ai là đã rút lúc
  -- nào — Nghị định 13 đòi chứng minh được, và khách khiếu nại cũng hỏi đúng câu đó.
  if not exists (select 1 from pg_constraint where conname = 'contacts_moc_rut_bat_buoc') then
    alter table public.contacts add constraint contacts_moc_rut_bat_buoc
      check (marketing_consent <> 'withdrawn' or marketing_consent_withdrawn_at is not null);
  end if;
end;
$$;

create index if not exists contacts_marketing_consent_idx
  on public.contacts (tenant_id, marketing_consent);

comment on column public.contacts.marketing_consent is
  'unknown = chua hoi (MAC DINH, KHONG duoc gui) | granted = da dong y | withdrawn = da rut. not null co y: nullable thi moi cau loc se cho null di qua va ca tep khach chua ai hoi y se bi gui tin.';

-- ════════════════════════════════════════════════════════════════════
-- 3. GỬI TIN — máy tự trừ, và không có nút bỏ qua
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.campaign_sends (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  -- Mốc gửi — cột mà luật khung giờ 21h–8h bám vào.
  send_at     timestamptz not null default now(),
  body        text check (body is null or length(body) <= 1000),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists campaign_sends_campaign_idx
  on public.campaign_sends (tenant_id, campaign_id, send_at desc);

-- ── KHUNG GIỜ 21h–8h ────────────────────────────────────────────────
-- Thẻ, mục "Ranh giới": "Không gửi tin ngoài giờ. 21h–8h là không gửi, KỂ CẢ
-- BẠN BẤM GỬI." Chữ "kể cả bạn bấm gửi" là lý do đây phải là trigger CSDL chứ
-- không phải một điều kiện trên nút bấm: nút bấm chỉ chặn được người đi qua nút.
--
-- Phải là TRIGGER chứ không phải `check`: giờ địa phương cần đọc
-- `tenants.timezone`, mà `check` không được truy vấn bảng khác. Múi giờ theo
-- TIỆM, không theo máy chủ — cùng quy ước với lịch hẹn (#83) và giờ mở cửa (#80).
create or replace function public.campaign_send_khung_gio_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz  text;
  v_gio integer;
begin
  select t.timezone into v_tz from public.tenants t where t.id = new.tenant_id;
  v_gio := extract(hour from (new.send_at at time zone coalesce(v_tz, 'Asia/Ho_Chi_Minh')))::integer;
  if v_gio < 8 or v_gio >= 21 then
    raise exception 'ngoai_khung_gio_gui'
      using detail = format('gio tiem=%s, chi gui trong 08:00-20:59 (tz=%s)', v_gio, coalesce(v_tz, 'Asia/Ho_Chi_Minh'));
  end if;
  return new;
end;
$$;
revoke execute on function public.campaign_send_khung_gio_guard() from public, anon;

drop trigger if exists campaign_sends_khung_gio on public.campaign_sends;
create trigger campaign_sends_khung_gio
  before insert or update of send_at on public.campaign_sends
  for each row execute function public.campaign_send_khung_gio_guard();

create table if not exists public.campaign_send_recipients (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  send_id    uuid not null references public.campaign_sends(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Một đợt gửi không nhắn hai lần cho cùng một người.
create unique index if not exists campaign_send_recipients_unique
  on public.campaign_send_recipients (send_id, contact_id);
create index if not exists campaign_send_recipients_contact_idx
  on public.campaign_send_recipients (tenant_id, contact_id, created_at desc);

-- ── BA PHÉP TRỪ, CHẶN Ở CSDL ────────────────────────────────────────
-- Thẻ: "Không có nút 'gửi hết' để bỏ qua bước này." Ẩn nút trên giao diện KHÔNG
-- chặn được ai gọi thẳng PostgREST — nên ba phép trừ nằm ở đây, trên đường ghi,
-- và mọi lối vào (server action, gọi thẳng endpoint, SQL tay) đều đi qua.
--
-- Ba lỗi tách riêng chứ không gộp một: thẻ hiện ba dòng trừ khác nhau
-- (−318 chưa đồng ý · −47 đã rút · −92 vừa nhận tin), và ba lý do đó cần ba cách
-- xử lý khác nhau ở tầng người dùng.
create or replace function public.campaign_recipient_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_kh public.contacts;
begin
  select * into v_kh from public.contacts
   where id = new.contact_id and tenant_id = new.tenant_id;
  if not found then raise exception 'contact_not_found'; end if;

  if v_kh.marketing_consent = 'withdrawn' then
    raise exception 'khach_da_rut_dong_y';
  end if;
  if v_kh.marketing_consent <> 'granted' then
    raise exception 'khach_chua_dong_y_nhan_tin';
  end if;
  -- Thẻ: "Khách chặn tiệm một lần là mất luôn kênh đó — không lấy lại được bằng
  -- cách nào." Nên luật dội bom là chặn cứng, không phải cảnh báo.
  if v_kh.marketing_last_sent_at is not null
     and v_kh.marketing_last_sent_at > now() - interval '7 days' then
    raise exception 'vua_nhan_tin_trong_7_ngay';
  end if;
  return new;
end;
$$;
revoke execute on function public.campaign_recipient_guard() from public, anon;

drop trigger if exists campaign_send_recipients_guard on public.campaign_send_recipients;
create trigger campaign_send_recipients_guard
  before insert on public.campaign_send_recipients
  for each row execute function public.campaign_recipient_guard();

-- Đóng dấu mốc nhận tin ngay khi người nhận được thêm vào đợt. Không có bước
-- này thì luật 7 ngày ở trên không có gì để đo, và mọi đợt gửi đều đi qua.
create or replace function public.campaign_recipient_dong_dau()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_moc timestamptz;
begin
  select s.send_at into v_moc from public.campaign_sends s where s.id = new.send_id;
  update public.contacts
     set marketing_last_sent_at = greatest(coalesce(marketing_last_sent_at, '-infinity'::timestamptz), v_moc)
   where id = new.contact_id;
  return new;
end;
$$;
revoke execute on function public.campaign_recipient_dong_dau() from public, anon;

drop trigger if exists campaign_send_recipients_dong_dau on public.campaign_send_recipients;
create trigger campaign_send_recipients_dong_dau
  after insert on public.campaign_send_recipients
  for each row execute function public.campaign_recipient_dong_dau();

-- ── RPC thêm người nhận: trả về ĐÚNG bốn dòng của thẻ ────────────────
-- Trigger ở trên là chốt chặn; hàm này là chỗ nói cho chủ tiệm biết vì sao tệp
-- 1.284 người chỉ còn 827. Bỏ đi trong im lặng thì chủ tiệm tưởng máy hỏng.
create or replace function public.campaign_send_add_recipients(
  p_send_id     uuid,
  p_contact_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_send   public.campaign_sends;
  v_chon   integer;
  v_chua   integer;
  v_rut    integer;
  v_gan    integer;
  v_gui    integer;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'forbidden'; end if;

  select * into v_send from public.campaign_sends
   where id = p_send_id and tenant_id = v_tenant;
  if not found then raise exception 'send_not_found'; end if;

  with chon as (
    select c.* from public.contacts c
     where c.tenant_id = v_tenant
       and c.id = any(p_contact_ids)
       and c.deleted_at is null
  )
  select count(*),
         count(*) filter (where marketing_consent = 'unknown'),
         count(*) filter (where marketing_consent = 'withdrawn'),
         count(*) filter (where marketing_consent = 'granted'
                            and marketing_last_sent_at is not null
                            and marketing_last_sent_at > now() - interval '7 days')
    into v_chon, v_chua, v_rut, v_gan
    from chon;

  insert into public.campaign_send_recipients (tenant_id, send_id, contact_id)
  select v_tenant, p_send_id, c.id
    from public.contacts c
   where c.tenant_id = v_tenant
     and c.id = any(p_contact_ids)
     and c.deleted_at is null
     and c.marketing_consent = 'granted'
     and (c.marketing_last_sent_at is null
          or c.marketing_last_sent_at <= now() - interval '7 days')
  on conflict (send_id, contact_id) do nothing;
  get diagnostics v_gui = row_count;

  return jsonb_build_object(
    'tep_chon',        v_chon,
    'tru_chua_dong_y', v_chua,
    'tru_da_rut',      v_rut,
    'tru_gan_day',     v_gan,
    'that_su_gui',     v_gui
  );
end;
$$;
revoke execute on function public.campaign_send_add_recipients(uuid, uuid[]) from public, anon;
grant  execute on function public.campaign_send_add_recipients(uuid, uuid[]) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 4. TỔNG KẾT — luôn có cả cái giá phải trả
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.campaign_summary (
  campaign_id  uuid primary key references public.campaigns(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  generated_at timestamptz not null default now(),

  -- Quyết định 1: con số đáng nhìn là CÒN LẠI, sau khi trừ cả ba khoản.
  revenue_vnd  bigint not null default 0,
  discount_vnd bigint not null default 0 check (discount_vnd >= 0),
  ad_cost_vnd  bigint not null default 0 check (ad_cost_vnd >= 0),
  cogs_vnd     bigint not null default 0 check (cogs_vnd >= 0),
  net_vnd      bigint not null default 0,

  uses_count          integer not null default 0 check (uses_count >= 0),
  new_customer_count  integer not null default 0 check (new_customer_count >= 0),
  -- Quyết định 2: phần THẬT SỰ tăng thêm so với nền, không phải tổng lượt.
  incremental_count   integer not null default 0,

  -- ⚠️ `not null default 0` — đây là quyết định 5 của thẻ, và cái `not null` mới
  -- là phần có tác dụng. Nullable thì mỗi bản tổng kết chưa kịp đếm sẽ mang null,
  -- và báo cáo hiển thị ô trống thay vì số 0 — dòng khó chịu nhất của cả bản
  -- tổng kết lặng lẽ biến mất đúng lúc nó cần được nhìn thấy. Thẻ: "mỗi đợt gửi
  -- tin đều đốt một ít thiện chí; không đo thì không biết mình đang đốt bao nhiêu".
  opt_out_count integer not null default 0 check (opt_out_count >= 0)
);
create index if not exists campaign_summary_tenant_idx
  on public.campaign_summary (tenant_id, generated_at desc);

comment on column public.campaign_summary.opt_out_count is
  'So nguoi rut dong y nhan tin sau dot nay. not null default 0 co y (quyet dinh 5 the man-su-kien-marketing): nullable thi bao cao lang le bo mat dong kho chiu nhat.';

-- ════════════════════════════════════════════════════════════════════
-- 5. QUYỀN — xem điểm (4) đầu file: THẺ KHÔNG NÓI, đây là mặc định tự chọn
-- ════════════════════════════════════════════════════════════════════
alter table public.campaigns               enable row level security;
alter table public.campaign_sends          enable row level security;
alter table public.campaign_send_recipients enable row level security;
alter table public.campaign_summary        enable row level security;

-- ĐỌC: cả tiệm. Nhân viên đứng quầy phải biết đang chạy ưu đãi gì.
create policy campaigns_select on public.campaigns
  for select using (tenant_id = (select public.current_tenant_id()));
-- SỬA: quản lý trở lên — chiến dịch là chỗ cho đi tiền, cùng mức với `vouchers`.
create policy campaigns_manage on public.campaigns
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

create policy campaign_sends_select on public.campaign_sends
  for select using (tenant_id = (select public.current_tenant_id()));
create policy campaign_sends_manage on public.campaign_sends
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

create policy campaign_send_recipients_select on public.campaign_send_recipients
  for select using (tenant_id = (select public.current_tenant_id()));
-- Policy này KHÔNG phải chốt chặn của ba phép trừ — trigger
-- `campaign_send_recipients_guard` mới là chốt, và nó chặn cả owner.
create policy campaign_send_recipients_manage on public.campaign_send_recipients
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

create policy campaign_summary_select on public.campaign_summary
  for select using (tenant_id = (select public.current_tenant_id()));
create policy campaign_summary_manage on public.campaign_summary
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );
