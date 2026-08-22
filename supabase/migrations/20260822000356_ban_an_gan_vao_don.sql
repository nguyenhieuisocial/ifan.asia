-- ═══════════════════════════════════════════════════════════════════
-- BÁN TẠI QUẦY CHO QUÁN ĂN & CAFE — mối nối đơn ↔ bàn
-- (thẻ thiết kế `man-ban-quan-an`, mục 5)
-- ═══════════════════════════════════════════════════════════════════
--
-- Khối F&B là khoảng trống lớn nhất còn lại sau khi đo cả 20 khối MISA:
-- 0 bảng, 0 màn. Trong khi đó Cafe Góc Phố là 1 trong 6 tiệm mẫu và đã có
-- 7.983 đơn — tức đang bán mà không có khái niệm bàn nào.
--
-- ⚠️ BÀN ĐÃ CÓ SẴN, KHÔNG DỰNG BẢNG MỚI. `resources` với `kind='table'` đã
--   chạy từ lâu (dùng cho phòng/giường của spa), và quán mẫu đã khai đủ 17
--   bàn: Bàn 01–12, 4 bàn sân vườn, quầy bar. Màn Cài đặt → Dịch vụ & Tài
--   nguyên sửa được danh sách đó từ trước. Thiếu duy nhất là MỐI NỐI.
--
-- ⚠️ VÒNG ĐỜI ĐƠN CŨNG ĐÃ ĐÚNG SẴN. Đơn `draft` cho thêm/bớt dòng thoải mái;
--   hoa hồng, trừ kho, tích điểm chỉ chạy khi chuyển sang `completed`. Đó
--   đúng là vòng đời một bàn ăn: mở bàn → gọi dần → tính tiền. Không cần
--   luồng đơn thứ hai, và KHÔNG được dựng luồng thứ hai — hai luồng cùng ghi
--   một bảng thì sớm muộn cũng lệch luật nhau.
--
-- Ba cột thêm vào, mỗi cột một lý do đo được:
--   · `orders.resource_id`      — bàn nào
--   · `orders.tam_tinh_luc`     — nuôi trạng thái bàn "đã in tạm tính", tức
--                                 "khách đã xin tính tiền, bàn sắp trống".
--                                 Đây là tín hiệu vận hành đắt nhất trên màn
--                                 bàn (học từ tài liệu vận hành KiotViet FnB).
--   · `order_lines.ghi_chu`     — "ít đường", "không đá", "mang về". Thiếu nó
--                                 thì nhân viên hét vào bếp và bếp làm sai.
--                                 Cũng là thứ khiến hai ly cùng loại phải là
--                                 HAI DÒNG riêng.

alter table public.orders
  add column if not exists resource_id uuid references public.resources(id) on delete set null,
  add column if not exists tam_tinh_luc timestamptz;

alter table public.order_lines
  add column if not exists ghi_chu text;

alter table public.order_lines
  drop constraint if exists order_lines_ghi_chu_do_dai;
alter table public.order_lines
  add constraint order_lines_ghi_chu_do_dai
  check (ghi_chu is null or char_length(ghi_chu) <= 200);

comment on column public.orders.resource_id is
  'Bàn (resources.kind=''table'') mà đơn này đang mở. NULL với đơn không ngồi bàn — spa, bán lẻ, mang về (#356).';
comment on column public.orders.tam_tinh_luc is
  'Lúc in phiếu tạm tính. Có giá trị = khách đã xin tính tiền ⇒ ô bàn đổi trạng thái (#356).';
comment on column public.order_lines.ghi_chu is
  'Ghi chú của riêng dòng này: "ít đường", "không đá", "mang về". Hai dòng cùng món khác ghi chú là HAI dòng (#356).';

-- ── Chỉ mục tra bàn ─────────────────────────────────────────────────
-- Màn bàn hỏi "bàn này đang có đơn nào mở không" cho TỪNG bàn, mỗi lần vẽ lại.
-- Không có chỉ mục thì mỗi lượt vẽ quét toàn bộ bảng đơn (93.076 dòng).
create index if not exists orders_resource_dang_mo
  on public.orders (resource_id)
  where resource_id is not null and status in ('draft', 'confirmed') and deleted_at is null;

-- ── MỘT BÀN CHỈ ĐƯỢC MỘT ĐƠN ĐANG MỞ ────────────────────────────────
--
-- ⚠️ ÉP Ở CSDL, KHÔNG ÉP Ở MÀN. Hai nhân viên cùng bấm mở "Bàn 03" trên hai
--   máy là chuyện xảy ra hằng ngày ở quán đông. Nếu chỉ kiểm ở màn thì cả hai
--   lượt đều thấy bàn trống, cả hai đều tạo đơn, và đơn thứ hai thành ĐƠN MỒ
--   CÔI: nó có dòng hàng, có tiền, nhưng màn bàn chỉ hiện một đơn nên không
--   ai mở lại nó nữa. Tiền của quán nằm trong một đơn không ai thấy.
create unique index if not exists orders_mot_ban_mot_don_mo
  on public.orders (resource_id)
  where resource_id is not null and status in ('draft', 'confirmed') and deleted_at is null;

-- ── CHỐT CHÉO TIỆM ──────────────────────────────────────────────────
--
-- ⚠️ MỌI CỘT KHOÁ NGOẠI MỚI TRÊN BẢNG CÓ `tenant_id` ĐỀU PHẢI CÓ CHỐT NÀY.
--   RLS chỉ kiểm `tenant_id` của chính dòng đang ghi — nó KHÔNG nhìn sang
--   bảng cha. Nên tiệm A ghi được một đơn `tenant_id = A` trỏ vào bàn của
--   tiệm B, và RLS cho qua.
--   Đúng một tiếng trước bản #354 đã tự tạo ra lỗ y hệt và cổng
--   `soat-canh-cheo-tiem` bắt ngay lượt CI kế tiếp. Chép khuôn có sẵn (#205,
--   #355), không nghĩ khuôn mới.
create or replace function public.orders_resource_tenant_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  if new.resource_id is null then
    return new;
  end if;
  select tenant_id into v_tenant from public.resources where id = new.resource_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'orders.resource_id phải cùng tiệm với đơn (bàn % thuộc tiệm khác)',
      new.resource_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_resource_tenant_guard on public.orders;
create trigger orders_resource_tenant_guard
  before insert or update of tenant_id, resource_id on public.orders
  for each row execute function public.orders_resource_tenant_guard();

comment on function public.orders_resource_tenant_guard() is
  'Chặn ghi đơn trỏ sang bàn của tiệm khác. RLS chỉ kiểm tenant_id nên không thấy đường này (#356).';

-- ── KHÁCH LẺ ────────────────────────────────────────────────────────
--
-- Quán cafe bán cho người đi đường, không hỏi tên. Nhưng `orders.contact_id`
-- đang BẮT BUỘC (đo: 0/93.076 đơn để trống).
--
-- ⚠️ ĐÃ CÂN NHẮC CHO CỘT ĐÓ NHẬN RỖNG RỒI BỎ. Đo được: 4 hàm CSDL đang NỐI
--   TRONG với bảng khách (`campaign_tong_ket`, `trash_list`,
--   `source_revenue_report`, `cong_no_khach`) — nối trong sẽ ÂM THẦM bỏ rơi
--   mọi đơn khách lẻ khỏi doanh thu, cộng 51 file mã phải soát lại. Kiểu hỏng
--   đó IM LẶNG: báo cáo vẫn ra số, chỉ là thiếu, và không có gì báo đỏ.
--
-- ⇒ Mỗi tiệm một khách tên "Khách lẻ", tạo lúc cần. Không đổi lược đồ, không
--   sửa hàm nào, mọi báo cáo giữ nguyên. Đánh đổi phải nói ra: danh sách khách
--   có thêm một dòng không phải người thật — nên đặt tên đúng là "Khách lẻ" để
--   không ai nhầm. Và nếu một đơn khách lẻ chưa thu đủ thì nó hiện ở Công nợ
--   dưới tên ấy: điều đó ĐÚNG, quán cần biết còn bàn nào chưa trả tiền.
create or replace function public.khach_le_cua_tiem()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tiem uuid := public.current_tenant_id();
  v_id uuid;
begin
  if v_tiem is null then
    raise exception 'khong_thuoc_tiem_nao' using errcode = '42501';
  end if;

  select id into v_id
  from public.contacts
  where tenant_id = v_tiem and full_name = 'Khách lẻ' and deleted_at is null
  order by created_at
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.contacts (tenant_id, full_name, lifecycle)
  values (v_tiem, 'Khách lẻ', 'customer')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.khach_le_cua_tiem() from public;
grant execute on function public.khach_le_cua_tiem() to authenticated;

comment on function public.khach_le_cua_tiem() is
  'Trả mã khách "Khách lẻ" của tiệm hiện tại, tạo nếu chưa có. Dùng cho đơn bán tại quầy không hỏi tên khách (#356).';
