-- V6 integrations (19/08/2026) — Webhook gửi ra ngoài + khoá API.
-- Thẻ design: design-system/man-webhook-api.html (5 quyết định đã chốt).
--
-- BA LUẬT CỦA ĐƯỜNG BÁO RA, đóng đinh ở đây vì lúc code rất dễ bỏ nhánh:
--   1. Bên nhận hỏng KHÔNG được làm hỏng iFan (bất biến 12). Trigger phát tin
--      nuốt mọi lỗi của chính nó — tiệm vẫn bán hàng bình thường.
--   2. Gửi lại được là chuyện thường. Mỗi tin có mã riêng, và một sự kiện chỉ
--      sinh ĐÚNG MỘT phiếu gửi cho mỗi đường báo (chỉ mục unique).
--   3. Hỏng lâu thì BÁO. Đường báo chết im lặng là thứ tệ nhất — mọi người
--      tưởng dữ liệu vẫn chảy.

-- ════════════════════════════════════════════════════════════════════
-- 1. KHOÁ API
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.api_keys (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 100),

  -- Khoá gốc KHÔNG bao giờ được lưu. Chỉ giữ bản băm để đối chiếu, cộng vài ký
  -- tự đầu/cuối để người dùng nhận ra khoá nào là khoá nào trên danh sách.
  key_hash   text not null unique,
  key_prefix text not null,   -- 'ifan_sk_7Kd9'
  key_suffix text not null,   -- 'bH1'

  -- Mặc định RỖNG = không làm được gì. Muốn cho đọc phải bật từng quyền một;
  -- không có nút "cho tất cả" (quyết định 2). Khoá lỡ lộ mà chỉ đọc thì thiệt
  -- hại khác hẳn khoá ghi được.
  scopes     text[] not null default '{}',

  status     text not null default 'active' check (status in ('active', 'revoked')),
  -- Cột QUAN TRỌNG NHẤT của màn này (quyết định 3): khoá không ai dùng mà vẫn
  -- sống là cửa mở bỏ quên. Máy tự gắn nhãn nghi ngờ, không đợi người nhớ dọn.
  last_used_at timestamptz,
  call_count   bigint not null default 0,
  revoked_at   timestamptz,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),

  constraint api_keys_scopes_hop_le check (
    scopes <@ array['read:orders', 'read:contacts', 'read:appointments']::text[]
  )
);

create index if not exists api_keys_tenant_idx on public.api_keys (tenant_id, status);
-- Đối chiếu khoá lúc gọi API phải nhanh và KHÔNG quét theo tiệm (lúc đó chưa
-- biết tiệm nào) — tra thẳng bằng băm, unique index ở trên lo việc đó.

-- ════════════════════════════════════════════════════════════════════
-- 2. ĐƯỜNG BÁO RA (webhook endpoint)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.webhook_endpoints (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name      text not null check (length(trim(name)) between 1 and 100),
  url       text not null check (url ~ '^https://'),   -- chỉ HTTPS, không http trần
  -- Bí mật để ký từng tin: bên nhận đối chiếu chữ ký mới biết tin đến THẬT từ
  -- iFan chứ không phải ai đó biết địa chỉ rồi gửi bừa.
  secret    text not null,

  event_types text[] not null default '{}' check (array_length(event_types, 1) > 0),
  status      text not null default 'active' check (status in ('active', 'paused')),

  -- Sức khoẻ đường báo — hiện NGAY trên danh sách, không phải đi tìm.
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_success_at timestamptz,
  last_error      text,
  last_error_at   timestamptz,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_endpoints_tenant_idx
  on public.webhook_endpoints (tenant_id, status);

drop trigger if exists webhook_endpoints_touch on public.webhook_endpoints;
create trigger webhook_endpoints_touch before update on public.webhook_endpoints
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- 3. HÀNG ĐỢI GỬI
-- ════════════════════════════════════════════════════════════════════
-- Khuôn giống `bot_outbox` (đã chạy thật): claim → gửi → ghi kết quả. pg_net bị
-- khoá (#36, cửa SSRF) nên CSDL không tự gọi HTTP — một worker bên ngoài kích
-- theo nhịp, giống /api/bot/outbox.
create table if not exists public.webhook_deliveries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  -- KHÔNG khai khoá ngoại tới `domain_events`. Hai lý do, cái sau quan trọng hơn:
  --   · Sổ sự kiện là append-only (bất biến 11) nên không có dòng nào bị xoá để
  --     mà phải dọn theo.
  --   · Thêm khoá ngoại đòi khoá SHARE ROW EXCLUSIVE trên `domain_events` — bảng
  --     đang có lưu lượng THẬT. Áp thử bị CSDL từ chối vì hết giờ chờ khoá; đây
  --     là chi phí không đáng đổi lấy một ràng buộc chẳng bảo vệ được gì thêm.
  event_id    uuid,
  event_type  text not null,
  payload     jsonb not null,

  status       text not null default 'pending'
               check (status in ('pending', 'sent', 'dead')),
  attempts     integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at   timestamptz,
  sent_at      timestamptz,
  last_error   text,
  created_at   timestamptz not null default now()
);

-- LUẬT 2: một sự kiện chỉ sinh ĐÚNG MỘT phiếu cho mỗi đường báo. Trigger chạy
-- lại (hoặc hai giao dịch song song) cũng không nhân đôi tin gửi cho khách.
create unique index if not exists webhook_deliveries_khong_trung
  on public.webhook_deliveries (endpoint_id, event_id)
  where event_id is not null;
-- Worker lấy việc: chỉ những phiếu tới hạn, cũ nhất trước.
create index if not exists webhook_deliveries_cho_gui_idx
  on public.webhook_deliveries (next_attempt_at)
  where status = 'pending';
create index if not exists webhook_deliveries_endpoint_idx
  on public.webhook_deliveries (tenant_id, endpoint_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════
-- 4. PHÁT TIN TỪ SỰ KIỆN NGHIỆP VỤ — quét theo con trỏ, KHÔNG dùng trigger
-- ════════════════════════════════════════════════════════════════════
-- Bản đầu định gắn AFTER INSERT trigger lên `domain_events`. Áp thử thì CSDL từ
-- chối: "canceling statement due to lock timeout" — thêm trigger cần khoá ACCESS
-- EXCLUSIVE trên một bảng đang có lưu lượng thật (cùng bài học #176).
--
-- Cái khoá đó hoá ra là chỉ dấu đúng cho một thiết kế tốt hơn. Trigger sẽ chạy
-- TRONG MỖI giao dịch bán hàng — dù có nuốt lỗi thì vẫn là thêm việc vào đường
-- đi của tiền. Quét theo con trỏ thì đường bán hàng KHÔNG gánh thêm gì cả, đúng
-- tinh thần bất biến 12 hơn cả bản có trigger:
--
--   sự kiện ghi vào domain_events (không ai đụng vào)
--     → worker gọi webhook_queue_new() theo nhịp
--       → sinh phiếu gửi cho các đường báo có đăng ký loại sự kiện đó
--
-- Đổi lại: tin đi chậm hơn đúng một nhịp worker. Với đường báo ra ngoài thì đó
-- là bình thường, không phải nhược điểm.
create table if not exists public.webhook_fanout_cursor (
  -- Một dòng duy nhất cho cả nền tảng. `only_row` khoá cứng điều đó.
  only_row      boolean primary key default true check (only_row),
  last_event_at timestamptz not null default now(),
  last_event_id uuid,
  updated_at    timestamptz not null default now()
);
insert into public.webhook_fanout_cursor (only_row) values (true) on conflict do nothing;

-- Sinh phiếu gửi cho mọi sự kiện MỚI kể từ con trỏ. Chỉ worker (service role)
-- gọi được. Trả về số phiếu vừa sinh.
create or replace function public.webhook_queue_new(p_max integer default 500)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_at   timestamptz;
  v_id   uuid;
  v_moi  integer := 0;
  v_cuoi record;
begin
  select last_event_at, last_event_id into v_at, v_id
    from public.webhook_fanout_cursor where only_row for update;

  -- Con trỏ GHÉP (thời điểm + mã dòng): nhiều sự kiện trùng mốc thời gian là
  -- chuyện thường (chốt đơn 5 món sinh 5 dòng cùng khoảnh khắc). Con trỏ chỉ
  -- theo thời gian sẽ LÀM RƠI sự kiện — đúng lỗi #167 đã đo được.
  with moi as (
    select e.* from public.domain_events e
     where (e.created_at, e.id) > (v_at, coalesce(v_id, '00000000-0000-0000-0000-000000000000'::uuid))
     order by e.created_at, e.id
     limit p_max
  ),
  chen as (
    insert into public.webhook_deliveries
      (tenant_id, endpoint_id, event_id, event_type, payload)
    select m.tenant_id, w.id, m.id, m.event_type, m.payload
      from moi m
      join public.webhook_endpoints w
        on w.tenant_id = m.tenant_id
       and w.status = 'active'
       and m.event_type = any(w.event_types)
    on conflict do nothing
    returning 1
  )
  select count(*)::integer into v_moi from chen;

  -- Đẩy con trỏ tới sự kiện CUỐI CÙNG đã xét — kể cả khi không đường báo nào
  -- quan tâm. Không đẩy thì lần sau quét lại y hệt, càng ngày càng chậm.
  select e.created_at, e.id into v_cuoi
    from public.domain_events e
   where (e.created_at, e.id) > (v_at, coalesce(v_id, '00000000-0000-0000-0000-000000000000'::uuid))
   order by e.created_at desc, e.id desc
   limit 1;

  if v_cuoi.created_at is not null then
    update public.webhook_fanout_cursor
       set last_event_at = v_cuoi.created_at, last_event_id = v_cuoi.id, updated_at = now()
     where only_row;
  end if;

  return v_moi;
end;
$$;
revoke execute on function public.webhook_queue_new(integer) from public, anon, authenticated;

alter table public.webhook_fanout_cursor enable row level security;
-- Không policy nào: đây là sổ nội bộ của worker, client không có việc gì ở đây.

-- ════════════════════════════════════════════════════════════════════
-- 5. QUYỀN
-- ════════════════════════════════════════════════════════════════════
alter table public.api_keys           enable row level security;
alter table public.webhook_endpoints  enable row level security;
alter table public.webhook_deliveries enable row level security;

-- Khoá API và đường báo ra là cấu hình HẠ TẦNG của tiệm: chỉ chủ/quản trị.
-- Nhân viên không có việc gì với chúng, và lộ ra là lộ đường vào dữ liệu.
create policy api_keys_manage on public.api_keys
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );

create policy webhook_endpoints_manage on public.webhook_endpoints
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );

-- Nhật ký gửi: chỉ ĐỌC (xem đường báo có khoẻ không). Ghi là việc của worker,
-- chạy bằng service role — không policy ghi cho client.
create policy webhook_deliveries_select on public.webhook_deliveries
  for select using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );
