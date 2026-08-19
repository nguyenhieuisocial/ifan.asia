-- V7 payroll — VÁ: một hàm khoá dùng cho HAI bảng có cột khác nhau.
--
-- LỖI: `payslip_locked_guard()` ở #167 viết
--     coalesce((select period_id from payslips where id = coalesce(new.payslip_id, old.payslip_id)),
--              coalesce(new.period_id, old.period_id))
-- rồi gắn cho CẢ `payslips` lẫn `payslip_lines`. Nhưng `payslips` KHÔNG có cột
-- `payslip_id`, và PL/pgSQL vỡ ngay lúc khởi tạo biến:
--     record "new" has no field "payslip_id"
--
-- Hậu quả nếu không bắt được: KHÔNG ghi được phiếu lương nào cả — cả mảng lương
-- chết ngay từ thao tác đầu tiên. Bộ kiểm `nhan-su-luong-smoke.mjs` bắt được ở
-- ca thứ 12, trước khi có tiệm nào chạm vào.
--
-- Bài học: một hàm trigger dùng chung cho nhiều bảng chỉ an toàn khi nó CHỈ đụng
-- những cột mà MỌI bảng đó đều có. Tiết kiệm một hàm không đáng đổi lấy rủi ro
-- này — tách hẳn hai hàm, mỗi hàm đọc đúng cột của bảng mình.

drop trigger if exists payslips_locked on public.payslips;
drop trigger if exists payslip_lines_locked on public.payslip_lines;
drop function if exists public.payslip_locked_guard();

-- Khoá trên chính bảng phiếu: kỳ nằm ngay ở `period_id`.
create or replace function public.payslips_locked_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.payroll_periods
              where id = coalesce(new.period_id, old.period_id) and status = 'closed') then
    raise exception 'payroll_locked';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger payslips_locked before insert or update or delete on public.payslips
  for each row execute function public.payslips_locked_guard();

-- Khoá trên dòng: phải đi qua phiếu mới tới kỳ.
create or replace function public.payslip_lines_locked_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.payslips p
      join public.payroll_periods k on k.id = p.period_id
     where p.id = coalesce(new.payslip_id, old.payslip_id) and k.status = 'closed'
  ) then
    raise exception 'payroll_locked';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger payslip_lines_locked before insert or update or delete on public.payslip_lines
  for each row execute function public.payslip_lines_locked_guard();
