-- Chốt kỳ lương đòi bảng công của cả NGƯỜI ĐÃ NGHỈ TỪ THÁNG TRƯỚC — người
-- không thể có bảng công của kỳ đó.
--
-- ═══════════════════════════════════════════════════════════════════
-- LỖI NÀY LỘ RA VÌ BẢN VÁ #210 — VÀ CHỈ VÌ CHẠY THẬT MỚI THẤY
-- ═══════════════════════════════════════════════════════════════════
-- Sáng 20/08 vá `app/app/payroll/actions.ts`: bảng lương phải kéo thêm người
-- ĐÃ NGHỈ mà vẫn phát sinh hoa hồng trong kỳ (khách trả hàng vào tháng sau ⇒
-- hệ thống đảo ngược hoa hồng của người đã nghỉ ⇒ khoản âm ấy trước đây rơi ra
-- ngoài mọi phiếu lương, tiệm trả dư không thu lại được).
--
-- Bản vá đó đúng. Nhưng khi đem áp lên dữ liệu thật thì **chốt lại kỳ lương
-- không được**, lỗi `timesheet_not_closed`.
--
-- Đọc chốt chặn thì rõ: nó đòi **MỌI phiếu lương trong kỳ** phải có một bảng
-- công ĐÃ CHỐT của đúng người đó, đúng kỳ đó. Người nghỉ việc 30/06 thì **không
-- có bảng công tháng 07** — và không thể có, vì họ không đi làm ngày nào.
--
-- ⇒ Bản vá #210 làm bảng lương ĐÚNG hơn nhưng làm kỳ lương KHÔNG CHỐT ĐƯỢC.
-- Chủ tiệm bấm Chốt, nhận câu "bảng công chưa chốt" cho một người đã nghỉ từ
-- tháng trước, và không có cách nào đi tiếp. Vá một nửa còn tệ hơn không vá.
--
-- ═══════════════════════════════════════════════════════════════════
-- Ý ĐỊNH THẬT CỦA CHỐT CHẶN NÀY LÀ GÌ
-- ═══════════════════════════════════════════════════════════════════
-- "Đừng chốt lương khi bảng công của ai đó CÒN ĐANG SỬA" — vì chốt lương dựa
-- trên số công, mà số công chưa chốt thì còn đổi được.
--
-- Người đã nghỉ trước khi kỳ bắt đầu KHÔNG có số công nào đang sửa. Đòi họ nộp
-- bảng công là đòi một thứ không tồn tại — không bảo vệ được gì, chỉ chặn.
--
-- ⇒ Chỉ đòi bảng công ở những người CÒN LÀM trong kỳ. Đây là siết đúng phạm vi
-- ý định, KHÔNG phải nới lỏng chốt chặn: người còn làm mà thiếu bảng công thì
-- vẫn bị chặn y như cũ.
--
-- Ngày nghỉ so với ĐẦU KỲ (`ended_on < new.period`): nghỉ giữa kỳ thì vẫn có
-- công của những ngày đã làm, nên vẫn phải có bảng công — không nới cho nhóm đó.

create or replace function public.payroll_close_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status = 'closed' and old.status = 'draft' then
    if exists (
      select 1 from public.payslips p
       where p.period_id = new.id
         -- #222: bỏ qua người đã nghỉ TRƯỚC khi kỳ bắt đầu. Họ không đi làm
         -- ngày nào trong kỳ nên không có bảng công, và cũng không có số công
         -- nào đang sửa để phải chờ. Nghỉ GIỮA kỳ thì vẫn đòi như cũ.
         and not exists (
           select 1 from public.employees e
            where e.id = p.employee_id
              and e.ended_on is not null
              and e.ended_on < new.period)
         and not exists (
           select 1 from public.timesheets t
            where t.employee_id = p.employee_id
              and t.period = new.period
              and t.status = 'closed')
    ) then
      raise exception 'timesheet_not_closed';
    end if;
  end if;

  -- (b) Chốt rồi thì khoá. Đường sửa duy nhất: mở khoá kèm lý do.
  if old.status = 'closed' then
    if new.status = 'draft' and new.unlock_reason is not null
       and length(trim(new.unlock_reason)) > 0 then
      return new;
    end if;
    raise exception 'payroll_locked';
  end if;
  return new;
end;
$function$;

comment on function public.payroll_close_guard() is
  'Chan chot ky luong khi con bang cong DANG SUA, va khoa ky da chot (mo lai phai kem ly do). #222: khong doi bang cong o nguoi da nghi TRUOC khi ky bat dau — ho khong di lam ngay nao trong ky nen khong the co bang cong, doi la doi mot thu khong ton tai. Lo ra khi ban va #210 keo nguoi da nghi vao bang luong (de nhan khoan hoa hong bi dao nguoc khi khach tra hang thang sau) va lam ky luong KHONG CHOT DUOC. Nghi GIUA ky thi van doi nhu cu — ho co cong cua nhung ngay da lam.';
