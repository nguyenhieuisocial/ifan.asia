-- V6 retention (19/08/2026) — Voucher + Tích điểm.
-- Thẻ design: design-system/man-voucher-tich-diem.html (5 quyết định đã chốt).
--
-- Hai luật cứng của mảng này, đóng đinh ở CSDL chứ không chỉ nhắc trên màn hình:
--   1. Voucher phải có ĐỦ BA TRẦN. "Giảm 15%" không trần tiền gặp đơn 20 triệu
--      là mất 3 triệu trong một lần bấm, và không ai biết cho tới cuối tháng.
--   2. Điểm là NỢ, không phải quà. 1.240 điểm của khách = tiệm sẽ phải trả bằng
--      hàng. Nên sổ điểm là append-only, và có chỗ đọc ra TỔNG NỢ.

-- ════════════════════════════════════════════════════════════════════
-- 1. VOUCHER
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.vouchers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  code           text not null check (length(trim(code)) between 3 and 32),
  -- 'percent' = giảm theo %, 'amount' = giảm số tiền cố định
  kind           text not null check (kind in ('percent', 'amount')),
  percent_off    smallint check (percent_off between 1 and 100),
  amount_off_vnd bigint check (amount_off_vnd > 0),

  -- ── BA TRẦN BẮT BUỘC (quyết định 1 của thẻ design) ──
  -- `not null` ở đây là chốt chặn THẬT: bỏ trống thì CSDL từ chối, không phải
  -- "giao diện có nhắc rồi thôi". Đây là chỗ mất tiền nhanh nhất của sản phẩm.
  max_uses         integer     not null check (max_uses > 0),
  max_discount_vnd bigint      not null check (max_discount_vnd > 0),
  expires_at       timestamptz not null,

  min_order_vnd      bigint  not null default 0 check (min_order_vnd >= 0),
  -- null = không giới hạn số lần mỗi khách
  per_customer_limit integer check (per_customer_limit > 0),
  new_customer_only  boolean not null default false,
  status             text    not null default 'active' check (status in ('active', 'paused')),

  note       text check (note is null or length(note) <= 500),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Đúng một trong hai giá trị giảm, khớp với `kind` — không để tồn tại voucher
  -- 'percent' mà percent_off rỗng (áp vào đơn sẽ ra giảm 0đ trong im lặng).
  constraint vouchers_gia_tri_khop_kind check (
    (kind = 'percent' and percent_off is not null and amount_off_vnd is null) or
    (kind = 'amount'  and amount_off_vnd is not null and percent_off is null)
  )
);

-- Mã là thứ nhân viên gõ tay ⇒ so khớp KHÔNG phân biệt hoa thường, và không cho
-- một tiệm có hai mã chỉ khác nhau chữ hoa (gõ "he2026" phải ra đúng một mã).
create unique index if not exists vouchers_code_unique
  on public.vouchers (tenant_id, upper(code));
create index if not exists vouchers_tenant_idx
  on public.vouchers (tenant_id, status, expires_at desc);

drop trigger if exists vouchers_touch on public.vouchers;
create trigger vouchers_touch before update on public.vouchers
  for each row execute function public.touch_updated_at();

-- Mỗi lần một mã được dùng thật. Đây là bảng ĐẾM: "62/200 lượt" đọc từ đây,
-- không lưu bộ đếm riêng trên bảng vouchers (bộ đếm rời luôn lệch với sự thật).
create table if not exists public.voucher_redemptions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  voucher_id   uuid not null references public.vouchers(id) on delete cascade,
  order_id     uuid not null references public.orders(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete set null,
  discount_vnd bigint not null check (discount_vnd > 0),
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- Một đơn chỉ mang MỘT voucher (thẻ design: khối "chồng ưu đãi" có đúng một mã).
create unique index if not exists voucher_redemptions_order_unique
  on public.voucher_redemptions (order_id);
create index if not exists voucher_redemptions_voucher_idx
  on public.voucher_redemptions (voucher_id);
create index if not exists voucher_redemptions_contact_idx
  on public.voucher_redemptions (tenant_id, contact_id);

-- ════════════════════════════════════════════════════════════════════
-- 2. TÍCH ĐIỂM
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.loyalty_config (
  tenant_id          uuid primary key references public.tenants(id) on delete cascade,
  is_active          boolean not null default false,
  -- "Mua 10.000đ = 1 điểm"
  vnd_per_point      bigint  not null default 10000 check (vnd_per_point > 0),
  -- "1.000 điểm đổi 100.000đ"
  redeem_points_unit integer not null default 1000 check (redeem_points_unit > 0),
  redeem_value_vnd   bigint  not null default 100000 check (redeem_value_vnd > 0),
  referral_points    integer not null default 200 check (referral_points >= 0),
  -- Hạn điểm BẮT BUỘC có (không cho vô hạn): điểm không hạn là nợ vĩnh viễn.
  expire_months      smallint not null default 12 check (expire_months between 1 and 120),
  updated_at         timestamptz not null default now()
);

drop trigger if exists loyalty_config_touch on public.loyalty_config;
create trigger loyalty_config_touch before update on public.loyalty_config
  for each row execute function public.touch_updated_at();

-- Sổ điểm — APPEND-ONLY (không có policy update/delete bên dưới).
--
-- Mỗi dòng CỘNG là một "lô điểm" mang hạn dùng riêng và `remaining` = phần chưa
-- tiêu của chính lô đó. Dòng TRỪ ghi việc tiêu, và lúc tiêu thì hàm
-- `loyalty_redeem` trừ dần `remaining` của các lô SẮP HẾT HẠN TRƯỚC.
--
-- Vì sao theo lô chứ không để một con số dư: thẻ design đòi trả lời "sẽ hết hạn
-- trong 90 ngày: 42.000 điểm". Một con số dư duy nhất không trả lời được câu đó,
-- và cũng không nói được điểm nào đã tiêu, điểm nào chưa.
create table if not exists public.loyalty_ledger (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  delta_points integer not null check (delta_points <> 0),
  reason       text not null check (reason in ('order', 'redeem', 'referral', 'manual', 'adjust')),
  order_id     uuid references public.orders(id) on delete set null,
  note         text check (note is null or length(note) <= 300),
  -- Chỉ dòng CỘNG mới có hạn + phần còn lại; dòng TRỪ để null/0.
  expires_at   timestamptz,
  remaining    integer not null default 0 check (remaining >= 0),
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),

  constraint loyalty_ledger_lo_hop_le check (
    (delta_points > 0 and expires_at is not null and remaining <= delta_points) or
    (delta_points < 0 and remaining = 0)
  )
);

create index if not exists loyalty_ledger_contact_idx
  on public.loyalty_ledger (tenant_id, contact_id, created_at desc, id desc);
-- Cho phép tiêu lô sắp hết hạn trước mà không phải quét cả sổ.
create index if not exists loyalty_ledger_lo_con_idx
  on public.loyalty_ledger (tenant_id, contact_id, expires_at)
  where remaining > 0;
-- Một đơn chỉ tích điểm MỘT lần (thu tiền hai lần cho cùng đơn không nhân đôi điểm).
create unique index if not exists loyalty_ledger_order_unique
  on public.loyalty_ledger (order_id)
  where reason = 'order';

-- Ví điểm từng khách: chỉ tính lô CÒN HẠN và CÒN phần chưa tiêu.
create or replace view public.loyalty_balances as
select tenant_id,
       contact_id,
       sum(remaining)::bigint as diem_con,
       coalesce(sum(remaining) filter (where expires_at < now() + interval '90 days'), 0)::bigint
         as diem_sap_het_han
from public.loyalty_ledger
where remaining > 0 and expires_at > now()
group by tenant_id, contact_id;

-- Tổng NỢ điểm của tiệm — con số chủ tiệm không bao giờ tự tính (thẻ design).
-- Quy ra tiền NGAY TẠI ĐÂY để không nơi nào tự nhân lại rồi ra số khác (#18).
create or replace view public.loyalty_debt as
select b.tenant_id,
       sum(b.diem_con)::bigint         as diem_chua_tieu,
       count(*)::bigint                as so_khach,
       sum(b.diem_sap_het_han)::bigint as diem_sap_het_han,
       (sum(b.diem_con) * c.redeem_value_vnd / c.redeem_points_unit)::bigint as no_vnd
from public.loyalty_balances b
join public.loyalty_config c on c.tenant_id = b.tenant_id
group by b.tenant_id, c.redeem_value_vnd, c.redeem_points_unit;

-- ════════════════════════════════════════════════════════════════════
-- 3. QUYỀN
-- ════════════════════════════════════════════════════════════════════
alter table public.vouchers            enable row level security;
alter table public.voucher_redemptions enable row level security;
alter table public.loyalty_config      enable row level security;
alter table public.loyalty_ledger      enable row level security;

-- Voucher: ai trong tiệm cũng ĐỌC được (nhân viên phải tra mã lúc bán hàng),
-- nhưng chỉ quản lý trở lên mới TẠO/SỬA — mã giảm giá là chỗ mất tiền.
create policy vouchers_select on public.vouchers
  for select using (tenant_id = (select public.current_tenant_id()));
create policy vouchers_manage on public.vouchers
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

-- Lượt dùng: đọc trong tiệm; GHI chỉ qua hàm `voucher_apply` (migration kế tiếp)
-- ⇒ KHÔNG có policy insert, không ai chèn tay để lách trần.
create policy voucher_redemptions_select on public.voucher_redemptions
  for select using (tenant_id = (select public.current_tenant_id()));

-- Luật tích điểm: cả tiệm đọc (nhân viên phải nói được luật cho khách),
-- chỉ chủ/quản trị sửa — đổi tỉ lệ tích là đổi món nợ của cả tiệm.
create policy loyalty_config_select on public.loyalty_config
  for select using (tenant_id = (select public.current_tenant_id()));
create policy loyalty_config_manage on public.loyalty_config
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );

-- Sổ điểm: cả tiệm ĐỌC (nhân viên xem ví điểm của khách đang đứng trước mặt).
-- KHÔNG có policy insert/update/delete ⇒ sổ chỉ đi qua hàm, và không ai sửa
-- được dòng đã ghi. Cùng nguyên tắc bất biến với sổ kho.
create policy loyalty_ledger_select on public.loyalty_ledger
  for select using (tenant_id = (select public.current_tenant_id()));
