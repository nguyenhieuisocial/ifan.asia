-- ════════════════════════════════════════════════════════════════════
-- "KHÁCH LẺ" ĐANG ĐỂ VAI CHỈ-XEM GHI ĐƯỢC VÀO BẢNG KHÁCH
-- ════════════════════════════════════════════════════════════════════
--
-- Cổng `Ham quyen-chu khong duoc xoa mat phan vai cua RLS` bắt được:
--   `khach_le_cua_tiem()` là `security definer` (chạy bằng quyền người tạo hàm,
--   bỏ qua mọi luật bảo vệ hàng) và nó **CHÈN** một dòng vào `contacts`, nhưng
--   không hỏi người gọi là vai gì.
--
-- ⚠️ VÌ SAO ĐÂY LÀ LỖ THẬT, không phải lo xa: nút "Xem demo nhanh" là **công
--   khai** — nó đưa người lạ vào tiệm mẫu với vai **chỉ-xem**. Nên mọi chỗ vai
--   đó ghi được đều là chỗ **người lạ ẩn danh ghi được**. Sổ sự thật đã ghi hẳn
--   một mục về bốn cửa cùng loại tìm được trước đây; đây là cửa thứ năm, sinh ra
--   cùng đợt bán-tại-quầy (#356).
--
-- ⚠️ CHẶN BẰNG `<> 'viewer'`, KHÔNG dùng danh sách vai trắng — đúng luật đã ghi
--   trong sổ. Lý do: hàm loại này còn được gọi từ trigger và việc chạy nền, lúc
--   ấy vai là `null`; danh sách trắng sẽ làm mọi việc nền gãy IM LẶNG.
--
-- ⚠️ Giữ nguyên phần còn lại của hàm từng chữ. Chép lại từ bản ĐANG CHẠY trên
--   kho thật, không chép từ file migration cũ (bất biến 2: create-or-replace ghi
--   đè toàn bộ, chép bản cũ là lặng lẽ lùi mọi bản vá sau đó).

create or replace function public.khach_le_cua_tiem()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $ham$
declare
  v_tiem uuid := public.current_tenant_id();
  v_id uuid;
begin
  if v_tiem is null then
    raise exception 'khong_thuoc_tiem_nao' using errcode = '42501';
  end if;

  -- CHỐT VAI. Hàm này TẠO dữ liệu; vai chỉ-xem không được tạo gì.
  if public.app_role() = 'viewer' then
    raise exception 'forbidden' using errcode = '42501';
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
$ham$;

comment on function public.khach_le_cua_tiem() is
  'Trả về (hoặc tạo) hồ sơ "Khách lẻ" của tiệm đang chọn. Vai chỉ-xem bị chặn: hàm này security definer và có INSERT, mà nút "Xem demo nhanh" là công khai — không chặn thì người lạ ẩn danh ghi được vào bảng khách (#370).';
