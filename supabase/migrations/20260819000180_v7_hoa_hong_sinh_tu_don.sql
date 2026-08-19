-- V7 hoa hồng (19/08/2026) — ĐƯỜNG GHI cho `commission_entries`.
-- Thẻ design: design-system/man-hoa-hong.html (5 quyết định đã chốt).
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO CÓ BẢN NÀY
-- ════════════════════════════════════════════════════════════════════
-- #167 dựng bảng `commission_entries` và màn Bảng lương ĐỌC nó đúng (mỗi khoản
-- một dòng, có gốc, bấm về được tận đơn). Nhưng KHÔNG có đường nào GHI vào bảng
-- đó: không màn nào, không trigger nào. Hệ quả đo được: cột hoa hồng trên mọi
-- phiếu lương LUÔN BẰNG 0, và chú thích #167 nói thẳng "hoa hồng là đầu vào bắt
-- buộc của bảng lương". Một cấu phần lương luôn bằng 0 không phân biệt được với
-- một cấu phần chưa tồn tại.
--
-- ════════════════════════════════════════════════════════════════════
-- TỰ ĐỘNG hay GHI TAY — thẻ đã trả lời, không phải chỗ tự quyết
-- ════════════════════════════════════════════════════════════════════
-- Thẻ có hẳn một khối "Đặt tỉ lệ" với bảng tỉ lệ THEO LOẠI VIỆC (quyết định 1),
-- một khối "Cách tính" trải ra `doanh số × tỉ lệ` từng dòng, và nhãn "Tạm tính
-- tới hôm nay". Ba thứ đó chỉ có nghĩa khi máy TỰ SINH theo tỉ lệ cấu hình.
-- Ghi tay thì không cần bảng tỉ lệ, và "tạm tính tới hôm nay" thành vô nghĩa.
-- ⇒ TỰ ĐỘNG khi đơn chuyển sang `completed`, theo tỉ lệ trong `commission_rates`.
--
-- Đường GHI TAY vẫn còn (policy `commission_manage` của #167 cho owner/admin/
-- manager insert) — dùng cho khoản thưởng ngoài luật. Không bịt, không mở rộng.
--
-- ════════════════════════════════════════════════════════════════════
-- BỐN CHỖ THẺ KHÔNG NÓI — chọn ở đây, ghi lại để người sau không mở lại
-- ════════════════════════════════════════════════════════════════════
--
-- (1) LOẠI VIỆC "Khách tự đặt online · 0%" CỐ Ý KHÔNG DỰNG. Kho không có dấu
--     hiệu nào phân biệt ca khách tự đặt: `appointments.source` chỉ có 'chat'
--     và 'calendar', và chú thích của chính #83 đã ghi rõ giá trị 'public' để
--     dành cho trang tự đặt "thêm giá trị lúc đó, không khai trước một giá trị
--     chưa ai ghi (luật D2)". Dựng một loại việc mà không câu lệnh nào xếp được
--     dòng nào vào là dựng một ô cấu hình nói dối. Ba loại còn lại của thẻ có
--     dữ liệu thật ⇒ dựng đủ ba.
--
-- (2) AI LÀ NGƯỜI ĐƯỢC HƯỞNG. Thẻ nói "dịch vụ TỰ LÀM" nhưng không nói lấy tên
--     người từ đâu. Đo trong kho: cột `order_lines.performed_by_user_id` (dựng ở
--     #127 đúng cho việc này) CHƯA TỪNG được tầng web ghi — 0 chỗ gán. Nếu chỉ
--     dựa vào nó thì bản này sinh ra đúng 0 khoản, tức là không sửa được gì.
--     Chuỗi ba bậc, dừng ở bậc đầu tiên có dữ liệu:
--       a. `order_lines.performed_by_user_id` — cột đúng nghĩa nhất, tôn trọng
--          trước để ngày tầng web ghi nó thì mọi thứ tự đúng, không phải sửa lại.
--       b. `appointments.staff_user_id` qua `order_lines.appointment_id` — người
--          LÀM ca. Đây là bậc có thật hôm nay cho dòng dịch vụ.
--       c. `orders.created_by` — người lập đơn. Bậc cuối cho dòng bán hàng hoá
--          (không gắn ca nào): người bấm ra đơn là người bán thêm.
--     Không có bậc nào ⇒ KHÔNG sinh khoản. Đoán bừa người hưởng là trả tiền cho
--     người không làm, tệ hơn hẳn so với việc màn hình nói "chưa ghi người làm".
--
-- (3) PHIẾU HOÀN TRỪ VỀ ĐÚNG NGƯỜI ĐÃ ĐƯỢC HƯỞNG. Quyết định 3 của thẻ bắt trừ
--     lại, nhưng phiếu hoàn do NGƯỜI KHÁC xử là chuyện thường. Ở bậc (c), lấy
--     `created_by` của ĐƠN GỐC (`parent_order_id`) chứ không phải của phiếu hoàn
--     — không thì tiền bị trừ vào người ngồi quầy hôm khách trả hàng.
--     Không cần luật riêng để trừ: dòng của phiếu hoàn mang `qty` ÂM (chốt chặn
--     `order_lines_sign_guard` của #127), nên CÙNG một công thức ra số ÂM.
--
-- (4) CHƯA DỰNG "CHỐT THÁNG HOA HỒNG" (nửa sau quyết định 5 của thẻ). Đây là
--     chỗ CỐ Ý lệch thẻ, và lý do phải đứng vững:
--     Một khoá thứ HAI trên cùng số tiền, độc lập với `payroll_periods`, sinh ra
--     một bẫy cứng: đơn lập tháng 7 mà chốt tháng 8 sẽ sinh khoản mang
--     `earned_on` tháng 7 — kỳ đã khoá ⇒ trigger từ chối ⇒ KHÔNG CHỐT ĐƯỢC ĐƠN.
--     Mất khả năng chốt đơn để đổi lấy một cái khoá mà `payroll_periods` đã làm
--     rồi (chốt lương là lúc tiền thật sự đứng yên; `payroll_close_guard` +
--     `payslip_locked_guard` của #167 đã khoá) là một đánh đổi tồi.
--     Phần CÓ ÍCH của quyết định 5 — "cảnh báo đơn treo, không chặn cứng" — vẫn
--     giao đủ, ở màn `/app/commissions` (đếm đơn còn draft/confirmed trong kỳ).

-- ════════════════════════════════════════════════════════════════════
-- 1. TỈ LỆ THEO LOẠI VIỆC
-- ════════════════════════════════════════════════════════════════════
-- Khoá chính (tenant_id, job_type): tỉ lệ đặt THEO LOẠI VIỆC, không theo người
-- (quyết định 1). Không có cột employee_id, và đó là toàn bộ giá trị của bảng —
-- có cột đó thì hôm sau sẽ có người điền vào, rồi so bì bắt đầu.
create table if not exists public.commission_rates (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  job_type   text not null check (job_type in ('service', 'product', 'package')),
  -- Phần trăm trên doanh số dòng. 0 = loại việc này không có hoa hồng (đường
  -- TẮT hợp lệ), không phải "chưa cấu hình" — nên `not null`.
  percent    numeric(5, 2) not null check (percent >= 0 and percent <= 100),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, job_type)
);

comment on table public.commission_rates is
  'Thẻ man-hoa-hong quyet dinh 1: ti le dat THEO LOAI VIEC, khong theo nguoi. Ba loai co du lieu that trong kho: service (dich vu tu lam) · product (ban them hang hoa) · package (ban goi lieu trinh). Loai "khach tu dat online 0%" cua the KHONG dung: kho khong co dau hieu nao phan biet (appointments.source chi co chat/calendar).';

comment on column public.commission_rates.percent is
  'Muc mac dinh khi seed lay DUNG tu the design: service 8 · product 5 · package 3. Goi 3% chu khong 8% vi tien goi phan lon CHUA PHAI doanh thu ma la no dich vu (quyet dinh 2) — tra 8% ngay la tra hoa hong tren tien chua kiem duoc.';

alter table public.commission_rates enable row level security;

drop trigger if exists commission_rates_touch on public.commission_rates;
create trigger commission_rates_touch before update on public.commission_rates
  for each row execute function public.touch_updated_at();

-- ĐỌC: cả tiệm. Nhân viên phải xem được tỉ lệ để tự đối chiếu con số của mình —
-- đó chính là lý do quyết định 4 của thẻ cho họ xem phần của mình ("cho họ tự
-- tra là hết chuyện"). Tỉ lệ là chính sách của tiệm, không phải dữ liệu cá nhân.
create policy commission_rates_select on public.commission_rates
  for select using (tenant_id = (select public.current_tenant_id()));
-- ĐẶT TỈ LỆ: CHỈ owner/admin. Thẻ, bảng "Ai xem được gì": quản lý xem cả đội
-- nhưng KHÔNG đặt tỉ lệ — "cả đội + đặt tỉ lệ" là dòng của CHỦ TIỆM.
create policy commission_rates_manage on public.commission_rates
  for all using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  ) with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );
revoke all on public.commission_rates from anon;

-- ── Mức mặc định: ĐÚNG bảng tỉ lệ của thẻ ───────────────────────────
-- Vì sao seed chứ không để trống: bảng trống ⇒ mọi tỉ lệ = 0 ⇒ tính năng ra
-- đúng 0 khoản, tức là chưa sửa gì cả. Seed thì con số hiện ra ngay TRÊN MÀN
-- (khối "Đặt tỉ lệ"), chủ tiệm nhìn thấy và sửa được. Và tiền vẫn KHÔNG tự chảy
-- vào lương: khoản hoa hồng chỉ vào phiếu lương khi có người bấm "Tính lại kỳ
-- lương" (#167 actions.ts) — bản này không đụng vào đường đó.
insert into public.commission_rates (tenant_id, job_type, percent)
select t.id, x.job_type, x.percent
  from public.tenants t
 cross join (values ('service', 8.00), ('product', 5.00), ('package', 3.00))
       as x(job_type, percent)
on conflict (tenant_id, job_type) do nothing;

-- Tiệm mới cũng phải có bảng tỉ lệ, không thì mảng này chết lặng với mọi tiệm
-- đăng ký sau hôm nay.
create or replace function public.commission_rates_seed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.commission_rates (tenant_id, job_type, percent)
  values (new.id, 'service', 8.00), (new.id, 'product', 5.00), (new.id, 'package', 3.00)
  on conflict (tenant_id, job_type) do nothing;
  return new;
end;
$$;
revoke execute on function public.commission_rates_seed() from public, anon;

drop trigger if exists tenants_seed_commission_rates on public.tenants;
create trigger tenants_seed_commission_rates after insert on public.tenants
  for each row execute function public.commission_rates_seed();

-- ════════════════════════════════════════════════════════════════════
-- 2. `commission_entries` — CHỤP LẠI cách tính, không chỉ số tiền
-- ════════════════════════════════════════════════════════════════════
-- Thẻ có khối "Cách tính" trải theo loại việc ("Dịch vụ tự làm · 8% →
-- 2.592.000") và cột "Doanh số" bên cạnh cột "Hoa hồng". Không chụp lại
-- doanh số/tỉ lệ/loại việc lúc sinh thì hai khối đó phải tính ngược từ đơn —
-- mà tỉ lệ đổi sau sẽ cho ra số khác với số đã trả. Cùng kỷ luật đã áp cho
-- `order_lines.unit_price_vnd` và `order_line_costs.cost_vnd` (#127): sổ ghi
-- SỰ THẬT LÚC ĐÓ, không tính lại từ cấu hình hôm nay.
--
-- Cả ba cột nullable: khoản GHI TAY không có loại việc/tỉ lệ nào, và các dòng
-- có trước bản này (nếu có) không thể suy ngược.
alter table public.commission_entries
  add column if not exists job_type text;
alter table public.commission_entries
  add column if not exists base_vnd bigint;
alter table public.commission_entries
  add column if not exists percent numeric(5, 2);
-- Bán gói KHÔNG đi qua `order_lines`: gói bán bằng `contracts` (#154, bảng
-- riêng, không sinh dòng hàng nào). Không có cột này thì quyết định 2 của thẻ
-- (gói 3%) không có chỗ bám và bảng tỉ lệ có một dòng chết.
alter table public.commission_entries
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;
-- Chỉ dùng cho gói. Phiếu hoàn của ĐƠN đã có dòng hàng riêng mang qty âm nên
-- tự phân biệt; hợp đồng bị huỷ thì KHÔNG sinh dòng nào mới, nên cần cờ này để
-- khoản trừ không đụng khoá duy nhất của khoản cộng.
alter table public.commission_entries
  add column if not exists is_reversal boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'commission_job_type_hop_le') then
    alter table public.commission_entries add constraint commission_job_type_hop_le
      check (job_type is null or job_type in ('service', 'product', 'package'));
  end if;
end;
$$;

-- Cùng luật với `commission_mot_dong_mot_nguoi` (#167) nhưng cho gói: một hợp
-- đồng sinh ĐÚNG MỘT khoản cộng và ĐÚNG MỘT khoản trừ cho một người. Huỷ rồi mở
-- lại rồi huỷ tiếp không trừ hai lần.
create unique index if not exists commission_mot_hop_dong_mot_nguoi
  on public.commission_entries (contract_id, employee_id, is_reversal)
  where contract_id is not null;

comment on column public.commission_entries.base_vnd is
  'Doanh so cua dong hang / gia goi tai thoi diem sinh khoan. Chup lai de khoi "Cach tinh" cua the va cot "Doanh so" khong phai tinh nguoc — ti le doi sau se cho ra so khac voi so da tra.';

-- ════════════════════════════════════════════════════════════════════
-- 3. SINH KHOẢN TỪ MỘT ĐƠN
-- ════════════════════════════════════════════════════════════════════
-- `security definer`: hàm phải đọc `employees`, `appointments`, `items` và ghi
-- `commission_entries` cho NGƯỜI KHÁC (nhân viên làm dịch vụ, không phải người
-- đang bấm nút). RLS `commission_manage` chỉ cho owner/admin/manager ghi —
-- nhưng người chốt đơn thường là `staff`, và họ phải chốt được đơn.
--
-- KHÔNG có `delete`/`update` nào trong hàm này (cổng scripts/soat-xoa-khong-
-- dieu-kien.mjs). Chống trùng bằng `on conflict do nothing` dựa trên chỉ mục
-- duy nhất của #167 — chốt đơn hai lần không nhân đôi tiền.
create or replace function public.commission_sinh_cho_don(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
begin
  insert into public.commission_entries (
    tenant_id, employee_id, order_line_id, order_id,
    earned_on, amount_vnd, job_type, base_vnd, percent, note, created_by
  )
  select
    d.tenant_id,
    d.employee_id,
    d.line_id,
    d.order_id,
    d.earned_on,
    d.tien,
    d.job_type,
    d.doanh_so,
    d.percent,
    null,
    d.created_by
  from (
    select
      o.tenant_id,
      e.id                                                     as employee_id,
      l.id                                                     as line_id,
      o.id                                                     as order_id,
      (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date      as earned_on,
      round(l.qty * l.unit_price_vnd - l.discount_vnd)::bigint  as doanh_so,
      r.percent                                                as percent,
      case when i.kind = 'service' then 'service' else 'product' end as job_type,
      round((l.qty * l.unit_price_vnd - l.discount_vnd) * r.percent / 100)::bigint as tien,
      o.created_by
    from public.orders o
    join public.order_lines l on l.order_id = o.id
    join public.items i       on i.id = l.item_id
    -- Chuỗi ba bậc của điểm (2) đầu file. `left join` + `coalesce` chứ không
    -- `join`: dòng không tra ra người nào phải BIẾN MẤT khỏi kết quả (bậc cuối
    -- `coalesce` ra null ⇒ `e.id` null ⇒ bị `join employees` loại), không được
    -- rơi vào một người mặc định nào.
    left join public.appointments a on a.id = l.appointment_id
    -- Điểm (3): phiếu hoàn trừ về người của ĐƠN GỐC, không phải người xử hoàn.
    left join public.orders parent   on parent.id = o.parent_order_id
    join public.employees e
      on e.tenant_id = o.tenant_id
     and e.user_id = coalesce(
           l.performed_by_user_id,
           a.staff_user_id,
           case when o.kind = 'return' then coalesce(parent.created_by, o.created_by)
                else o.created_by end)
    join public.commission_rates r
      on r.tenant_id = o.tenant_id
     and r.job_type = case when i.kind = 'service' then 'service' else 'product' end
    where o.id = p_order_id
      and o.status = 'completed'
      and o.deleted_at is null
  ) d
  -- `amount_vnd <> 0` là CHECK của #167: tỉ lệ 0% hoặc doanh số quá nhỏ làm tròn
  -- về 0 thì KHÔNG ghi dòng nào (ghi sẽ vỡ cả giao dịch chốt đơn).
  where d.tien <> 0
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.commission_sinh_cho_don(uuid) from public, anon;

comment on function public.commission_sinh_cho_don(uuid) is
  'Sinh khoan hoa hong cho moi dong hang cua mot don DA COMPLETED. Idempotent nho chi muc commission_mot_dong_mot_nguoi (#167) + on conflict do nothing: chot don hai lan khong nhan doi tien. Phieu hoan (kind=return) co qty AM nen cung cong thuc ra so AM — quyet dinh 3 cua the.';

create or replace function public.orders_sinh_hoa_hong()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.commission_sinh_cho_don(new.id);
  return new;
end;
$$;
revoke execute on function public.orders_sinh_hoa_hong() from public, anon;

drop trigger if exists orders_sinh_hoa_hong on public.orders;
-- `after` chứ không `before`: dòng hàng phải đã nằm đủ trong bảng.
-- Điều kiện `old.status is distinct from 'completed'` không cần thiết cho tính
-- đúng (chỉ mục duy nhất đã lo) nhưng tránh chạy hàm vô ích mỗi lần sửa đơn.
create trigger orders_sinh_hoa_hong
  after update of status on public.orders
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.orders_sinh_hoa_hong();

-- ════════════════════════════════════════════════════════════════════
-- 4. SINH KHOẢN TỪ MỘT HỢP ĐỒNG GÓI
-- ════════════════════════════════════════════════════════════════════
-- Quyết định 2 của thẻ. Người hưởng: `contracts.created_by` — bảng `contracts`
-- (#154) không có cột người bán nào khác, và người lập hợp đồng LÀ người bán gói.
create or replace function public.commission_sinh_cho_hop_dong(
  p_contract_id uuid,
  p_reversal    boolean
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
begin
  insert into public.commission_entries (
    tenant_id, employee_id, contract_id, is_reversal,
    earned_on, amount_vnd, job_type, base_vnd, percent, created_by
  )
  select
    d.tenant_id, d.employee_id, d.contract_id, p_reversal,
    d.earned_on, d.tien, 'package', d.doanh_so, d.percent, d.created_by
  from (
    select
      k.tenant_id,
      e.id                                                    as employee_id,
      k.id                                                    as contract_id,
      case when p_reversal
           then (now() at time zone 'Asia/Ho_Chi_Minh')::date
           else (k.created_at at time zone 'Asia/Ho_Chi_Minh')::date end as earned_on,
      k.price_paid_vnd                                        as doanh_so,
      r.percent                                               as percent,
      -- Khoản TRỪ mang dấu âm; `abs` để không phụ thuộc dấu của cột nguồn.
      (case when p_reversal then -1 else 1 end
        * round(k.price_paid_vnd * r.percent / 100))::bigint  as tien,
      k.created_by
    from public.contracts k
    join public.employees e
      on e.tenant_id = k.tenant_id and e.user_id = k.created_by
    join public.commission_rates r
      on r.tenant_id = k.tenant_id and r.job_type = 'package'
    where k.id = p_contract_id
  ) d
  where d.tien <> 0
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.commission_sinh_cho_hop_dong(uuid, boolean) from public, anon;

create or replace function public.contracts_sinh_hoa_hong()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.commission_sinh_cho_hop_dong(new.id, false);
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    -- Quyết định 3 áp cho gói: huỷ hợp đồng thì TRỪ lại, cùng lý do với đơn hoàn.
    perform public.commission_sinh_cho_hop_dong(new.id, true);
  end if;
  return new;
end;
$$;
revoke execute on function public.contracts_sinh_hoa_hong() from public, anon;

drop trigger if exists contracts_sinh_hoa_hong on public.contracts;
create trigger contracts_sinh_hoa_hong
  after insert or update of status on public.contracts
  for each row execute function public.contracts_sinh_hoa_hong();

-- ════════════════════════════════════════════════════════════════════
-- 5. TÍNH LẠI CẢ KỲ — đường bắt kịp cho dữ liệu có TRƯỚC bản này
-- ════════════════════════════════════════════════════════════════════
-- Trigger ở trên chỉ bắt được đơn chốt TỪ GIỜ TRỞ ĐI. Tiệm đang chạy có sẵn đơn
-- đã chốt tháng này ⇒ mở màn hoa hồng lần đầu sẽ thấy số 0 và tưởng hỏng.
-- CỐ Ý KHÔNG chạy vá hàng loạt trong migration: sinh ngược hoa hồng cho các
-- tháng đã trả lương xong là ném thêm dòng vào kỳ đã chốt. Thay vào đó là một
-- hàm chạy theo YÊU CẦU, cho ĐÚNG một kỳ, người bấm biết mình đang bấm gì.
--
-- Idempotent: chạy bao nhiêu lần cũng ra cùng một tập khoản (chỉ mục duy nhất).
create or replace function public.commission_sinh_ky(p_period date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   text := public.app_role();
  v_dau    date := date_trunc('month', p_period)::date;
  v_cuoi   date := (date_trunc('month', p_period) + interval '1 month')::date;
  v_id     uuid;
  v_n      integer := 0;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- Cùng danh sách vai với `commission_manage` (#167). Hàm `security definer`
  -- bỏ qua RLS nên phải tự dựng lại hàng rào — quên là mở cửa cho `staff` sinh
  -- hoa hồng cả tiệm.
  if v_role not in ('owner', 'admin', 'manager') then raise exception 'forbidden'; end if;

  for v_id in
    select o.id from public.orders o
     where o.tenant_id = v_tenant
       and o.status = 'completed'
       and o.deleted_at is null
       and (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= v_dau
       and (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date <  v_cuoi
  loop
    v_n := v_n + public.commission_sinh_cho_don(v_id);
  end loop;

  for v_id in
    select k.id from public.contracts k
     where k.tenant_id = v_tenant
       and (k.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= v_dau
       and (k.created_at at time zone 'Asia/Ho_Chi_Minh')::date <  v_cuoi
  loop
    v_n := v_n + public.commission_sinh_cho_hop_dong(v_id, false);
  end loop;

  return v_n;
end;
$$;
revoke execute on function public.commission_sinh_ky(date) from public, anon;
grant execute on function public.commission_sinh_ky(date) to authenticated;

comment on function public.commission_sinh_ky(date) is
  'Tinh lai hoa hong cho DUNG mot ky (thang cua p_period), chay theo yeu cau tu man /app/commissions. Idempotent. Tu dung lai hang rao vai owner/admin/manager vi security definer bo qua RLS.';
