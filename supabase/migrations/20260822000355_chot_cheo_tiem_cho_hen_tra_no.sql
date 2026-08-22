-- ════════════════════════════════════════════════════════════════════
-- #355 — CHỐT CHÉO TIỆM CHO `hen_tra_no`
-- ════════════════════════════════════════════════════════════════════
-- Bảng `hen_tra_no` (#354) có `tenant_id` và `contact_id`, nhưng RLS chỉ kiểm
-- `tenant_id` — nó KHÔNG kiểm rằng khách đó có thuộc chính tiệm ấy không.
--
-- ĐÃ ĐO THẬT, KHÔNG SUY ĐOÁN. Dựng hai tiệm trong một giao dịch, đóng vai chủ
-- tiệm A rồi ghi một dòng `tenant_id = A` nhưng `contact_id` trỏ sang khách của
-- tiệm B: **GHI ĐƯỢC**. RLS thấy `tenant_id` khớp nên cho qua.
--
-- ⚠️ TÔI TỰ TẠO RA LỖ NÀY CÁCH ĐÂY MỘT TIẾNG, ở chính bản #354. Cổng
--   `soat-canh-cheo-tiem` bắt được ngay lượt CI kế tiếp — đó đúng là việc của
--   nó. Ghi lại đây vì bài học không phải "nhớ kiểm chéo tiệm" mà là: **mọi
--   bảng mới có hai cột `tenant_id` + khoá ngoại đều phải có chốt này**, và kho
--   đã có sẵn khuôn từ #205 — chép khuôn, đừng nghĩ khuôn mới.
--
-- Hại thật nếu để nguyên: tiệm A ghi được một cái hẹn gắn vào mã khách của tiệm
-- B. Tiệm B không đọc được dòng đó (RLS chặn chiều đọc), nhưng tiệm A thì tạo
-- ra một tham chiếu sang dữ liệu tiệm khác — và mọi phép đếm "khách này thất
-- hẹn mấy lần" của `hen_tra_gan_nhat` lọc theo `contact_id` chứ không theo
-- tiệm, nên hai tiệm dùng chung một mã khách sẽ cộng chung số lần thất hẹn.

create or replace function public.hen_tra_no_tenant_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.contacts where id = new.contact_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'hen_tra_no.contact_id phải cùng tiệm với cái hẹn (khách % thuộc tiệm khác)',
      new.contact_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists hen_tra_no_tenant_guard on public.hen_tra_no;
create trigger hen_tra_no_tenant_guard
  before insert or update of tenant_id, contact_id on public.hen_tra_no
  for each row execute function public.hen_tra_no_tenant_guard();

comment on function public.hen_tra_no_tenant_guard() is
  'Chặn ghi một cái hẹn trỏ sang khách của tiệm khác. RLS chỉ kiểm tenant_id nên không thấy đường này (#355).';
