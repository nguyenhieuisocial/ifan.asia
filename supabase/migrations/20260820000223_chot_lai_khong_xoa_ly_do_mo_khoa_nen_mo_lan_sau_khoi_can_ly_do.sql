-- Chốt lại kỳ lương KHÔNG xoá lý do mở khoá ⇒ lần sau mở khỏi cần lý do.
--
-- ═══════════════════════════════════════════════════════════════════
-- LUẬT TỤT HẠNG TỪ "MỖI LẦN PHẢI CÓ LÝ DO" XUỐNG "MỘT LẦN LÀ ĐỦ"
-- ═══════════════════════════════════════════════════════════════════
-- Chốt chặn `payroll_close_guard` nói rõ ý định: kỳ lương đã chốt thì đường
-- sửa DUY NHẤT là mở khoá **kèm lý do**.
--
--     if new.status = 'draft' and new.unlock_reason is not null
--        and length(trim(new.unlock_reason)) > 0 then return new; end if;
--     raise exception 'payroll_locked';
--
-- Nhưng khi chốt LẠI, `unlock_reason` **không bị xoá** — cả trigger lẫn đường
-- chốt trong app (`app/app/payroll/actions.ts`) đều không dọn nó. Cột đó nằm
-- lại vĩnh viễn trên hàng dữ liệu.
--
-- ⇒ Lần mở khoá thứ hai chỉ cần `update ... set status='draft'` là qua, vì
-- `new.unlock_reason` vẫn mang lý do CŨ từ lần trước. Không ai phải giải thích
-- gì nữa. Một kỳ lương từng mở một lần thì **mở tự do mãi mãi**.
--
-- ═══════════════════════════════════════════════════════════════════
-- ĐO ĐƯỢC 20/08
-- ═══════════════════════════════════════════════════════════════════
--     4 kỳ lương đang ở trạng thái ĐÃ CHỐT mà vẫn còn `unlock_reason`.
--
-- Phát hiện tình cờ: một phép ĐỐI CHỨNG được viết để chứng minh chốt chặn còn
-- sống lại **báo là nó hỏng**. Đọc kỹ thì phép thử sai (nó update trên hàng đã
-- có sẵn lý do cũ) — nhưng chính cái "sai" ấy mới là kịch bản thật của người
-- muốn lách. Đối chứng có giá trị kể cả khi nó bắt nhầm.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO XOÁ Ở TRIGGER CHỨ KHÔNG Ở APP
-- ═══════════════════════════════════════════════════════════════════
-- Sửa trong app thì chỉ đúng cho đúng nút Chốt của app. Bất kỳ đường nào khác
-- — bộ nạp dữ liệu, câu lệnh tay, một màn mới viết sau này — đều để lại lỗ y
-- như cũ. Trigger `before update` thì mọi đường ghi đều đi qua.
--
-- Lý do mở khoá của lần trước **không mất**: nó đã nằm trong nhật ký kiểm toán
-- (`record_audit`) tại thời điểm mở. Cột này chỉ là chỗ giữ tạm cho một lần mở,
-- không phải quyển sổ lịch sử.

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
    -- #223: DỌN lý do mở khoá khi chốt lại. Không dọn thì lần mở sau chỉ cần
    -- `set status='draft'` là qua, vì lý do CŨ vẫn còn nằm trên hàng — luật
    -- "mỗi lần mở phải nêu lý do" tụt thành "nêu một lần là đủ mãi mãi".
    -- Lý do cũ không mất: nó đã vào nhật ký kiểm toán lúc mở.
    new.unlock_reason := null;
  end if;

  -- (b) Chốt rồi thì khoá. Đường sửa duy nhất: mở khoá kèm lý do.
  if old.status = 'closed' then
    -- #223: cho phép ĐÚNG MỘT việc trên kỳ đang đóng — dọn dấu vết lý do mở
    -- khoá cũ. Phải liệt kê tường minh từng cột không được đổi, nếu không đây
    -- lại thành cửa hậu sửa tiền trên kỳ đã chốt. Đây là đường dọn hợp lệ, để
    -- không phải TẮT chốt chặn đi mà dọn — tắt chốt chặn là thói quen chết
    -- người, lần sau ai đó sẽ tắt vì lý do kém hơn nhiều.
    if new.status = 'closed'
       and new.unlock_reason is null and old.unlock_reason is not null
       and new.total_vnd  is not distinct from old.total_vnd
       and new.closed_by  is not distinct from old.closed_by
       and new.closed_at  is not distinct from old.closed_at
       and new.period     is not distinct from old.period
       and new.tenant_id  is not distinct from old.tenant_id then
      return new;
    end if;
    if new.status = 'draft' and new.unlock_reason is not null
       and length(trim(new.unlock_reason)) > 0 then
      return new;
    end if;
    raise exception 'payroll_locked';
  end if;
  return new;
end;
$function$;

-- Dọn các hàng đang mang lý do thừa. Đi qua đúng đường vừa mở ở trên — không
-- tắt trigger, không `alter table`. Câu này chạy được chính là bằng chứng
-- đường dọn hợp lệ đã có; nếu nó lỗi `payroll_locked` thì chốt chặn viết sai.
update public.payroll_periods
   set unlock_reason = null
 where status = 'closed' and unlock_reason is not null;

comment on function public.payroll_close_guard() is
  'Chan chot ky luong khi con bang cong DANG SUA, va khoa ky da chot (mo lai phai kem ly do). #222: khong doi bang cong o nguoi da nghi TRUOC khi ky bat dau. #223: DON `unlock_reason` khi chot lai — khong don thi lan mo thu hai khoi can ly do vi ly do cu con nam tren hang, luat tut tu "moi lan phai co ly do" xuong "mot lan la du". Do duoc 20/08: 4 ky da chot van con ly do mo khoa. Dat o TRIGGER chu khong o app, de moi duong ghi deu di qua.';
