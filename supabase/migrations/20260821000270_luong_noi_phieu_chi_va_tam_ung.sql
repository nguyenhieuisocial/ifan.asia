-- V9 · 21/08/2026 — BẢNG LƯƠNG: nối phiếu chi bằng SỐ PHIẾU, và tạm ứng vào sổ quỹ.
-- Thẻ design: design-system/man-bang-luong.html (khối "Đường tiền khép kín").
--
-- ════════════════════════════════════════════════════════════════════
-- LỖ TIỀN ĐANG NẰM TRONG MÃ — vì sao có bản này
-- ════════════════════════════════════════════════════════════════════
-- `chotKyLuong` (app/app/payroll/actions.ts) chống "chốt lại sinh phiếu chi thứ
-- hai" bằng cách dò `cash_entries` theo ĐÚNG CÂU GHI CHÚ:
--
--     const ghiChu = t("cash.note", { period });   // vi: "Lương kỳ 08/2026"
--     .eq("category", "salary").eq("note", ghiChu)  // en: "Payroll 08/2026"
--
-- Ngôn ngữ KHÔNG phải thuộc tính của tiệm — `i18n/request.ts` đọc nó từ cookie
-- `locale` của TỪNG TRÌNH DUYỆT. Nên:
--
--   Chủ tiệm (tiếng Việt) chốt kỳ 08 ⇒ phiếu chi ghi "Lương kỳ 08/2026".
--   Quản trị viên (tiếng Anh) mở khoá, tính lại, chốt lại ⇒ máy đi tìm
--   "Payroll 08/2026", KHÔNG THẤY ⇒ ghi PHIẾU CHI THỨ HAI.
--   ⇒ Sổ quỹ ghi trả lương HAI LẦN cho cùng một kỳ. Với tiệm 20 người đang đo
--     được ở dữ liệu thật, đó là ~195 triệu ghi khống.
--
-- Cùng lỗi ấy còn giết luôn bản vá đồng bộ đã làm 20/08 (chốt lại thì SỬA số
-- tiền của phiếu cũ): nhánh sửa không bao giờ chạy khi ghi chú không khớp.
--
-- ⇒ Khoá liên kết phải là thứ KHÔNG DỊCH ĐƯỢC: chính số phiếu.
--
-- ════════════════════════════════════════════════════════════════════
-- CHỖ THỨ HAI: TẠM ỨNG RA KHỎI KÉT MÀ SỔ QUỸ KHÔNG BIẾT
-- ════════════════════════════════════════════════════════════════════
-- Đo 21/08 trên sáu tiệm mẫu: `payslip_lines` mang 75 dòng tạm ứng, tổng
-- **157.000.000đ**; `cash_entries` KHÔNG có một phiếu chi nào ứng với số đó
-- (chỉ có 18 phiếu chi lương gộp cuối kỳ, và 20 phiếu 'other_out' đều là "nộp
-- tiền mặt cuối ca về ngân hàng"). Tiền mặt ra khỏi két ngày 12, sổ quỹ chỉ
-- biết vào ngày trả lương tháng sau — đối soát két giữa tháng luôn thiếu đúng
-- số đó, và không có gì giải thích.
--
-- Giá trị `payslip_lines.source_type = 'cash_entry'` ĐÃ CÓ trong CHECK của #167
-- và đã có nhãn i18n ("Từ một phiếu trong sổ quỹ") nhưng CHƯA DÒNG NÀO dùng —
-- nó được dựng đúng cho việc này. Bản này không đổi lược đồ cho phần đó; đường
-- ghi nằm ở tầng web (`themDongTay`). Ghi lại ở đây để người sau biết vì sao
-- một giá trị enum bỗng có dữ liệu.

-- ════════════════════════════════════════════════════════════════════
-- 1. KỲ LƯƠNG GIỮ SỐ PHIẾU CHI CỦA CHÍNH NÓ
-- ════════════════════════════════════════════════════════════════════
-- `on delete set null` chứ không `cascade`: xoá cứng một phiếu quỹ (chỉ xảy ra
-- khi xoá tiệm) không được kéo theo cả kỳ lương. Sổ quỹ xoá MỀM (`deleted_at`)
-- nên đường thường ngày không đụng khoá ngoại này.
alter table public.payroll_periods
  add column if not exists cash_entry_id uuid references public.cash_entries(id) on delete set null;

comment on column public.payroll_periods.cash_entry_id is
  'So phieu chi luong cua ky nay trong so quy. Khoa lien ket phai KHONG DICH DUOC: ban truoc do trung theo cau ghi chu da dich (vi "Luong ky MM/YYYY" / en "Payroll MM/YYYY"), ma ngon ngu nam trong cookie tung trinh duyet ⇒ chot lai o ngon ngu khac sinh phieu chi THU HAI.';

-- Một phiếu chi không được là phiếu của hai kỳ lương.
create unique index if not exists payroll_mot_ky_mot_phieu_chi
  on public.payroll_periods (cash_entry_id) where cash_entry_id is not null;

-- ── Phiếu chi phải cùng tiệm với kỳ lương ───────────────────────────
-- Khoá ngoại không biết `tenant_id`. RLS chặn ĐỌC chéo tiệm nhưng không chặn
-- GHI một id lạ vào cột này (cùng lớp bệnh scripts/soat-canh-cheo-tiem.mjs canh).
create or replace function public.payroll_cash_entry_cung_tiem()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_phai_kiem boolean := false;
begin
  -- Rẽ nhánh TƯỜNG MINH chứ không gộp vào một biểu thức `or`: PL/pgSQL không
  -- hứa cắt ngắn `or`, mà `old` chưa gán ở nhánh INSERT.
  if new.cash_entry_id is not null then
    if tg_op = 'INSERT' then
      v_phai_kiem := true;
    elsif new.cash_entry_id is distinct from old.cash_entry_id then
      v_phai_kiem := true;
    end if;
  end if;

  if v_phai_kiem and not exists (
       select 1 from public.cash_entries ce
        where ce.id = new.cash_entry_id and ce.tenant_id = new.tenant_id) then
    raise exception 'cash_entry_cross_tenant';
  end if;
  return new;
end;
$$;
revoke execute on function public.payroll_cash_entry_cung_tiem() from public, anon;

drop trigger if exists payroll_cash_entry_tiem on public.payroll_periods;
create trigger payroll_cash_entry_tiem before insert or update on public.payroll_periods
  for each row execute function public.payroll_cash_entry_cung_tiem();

-- ════════════════════════════════════════════════════════════════════
-- 2. NỚI KHOÁ KỲ ĐÃ CHỐT — ĐÚNG MỘT KHE, không hơn
-- ════════════════════════════════════════════════════════════════════
-- Thứ tự thao tác của `chotKyLuong` là CHỐT TRƯỚC rồi mới ghi phiếu quỹ, và thứ
-- tự đó có lý do đã ghi ở #167: ghi tiền trước khi kỳ chốt được thì lần bấm thứ
-- hai là chi tiền lần thứ hai. Nhưng nó kéo theo: lúc biết số phiếu chi thì kỳ
-- ĐÃ `closed`, mà `payroll_close_guard` chặn MỌI update lên kỳ đã chốt.
--
-- Nới đúng một khe: NHẬN số phiếu chi khi kỳ chưa có phiếu nào còn hiệu lực
-- (chưa có, hoặc phiếu cũ đã bị xoá mềm khỏi Sổ quỹ). Không cho đổi từ một
-- phiếu đang sống sang phiếu khác, không cho đổi kèm bất cứ con số tiền nào.
-- Mọi thứ khác của hàm giữ NGUYÊN văn #167.
create or replace function public.payroll_close_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'closed' and old.status = 'draft' then
    if exists (
      select 1 from public.payslips p
       where p.period_id = new.id
         and not exists (
           select 1 from public.timesheets t
            where t.employee_id = p.employee_id
              and t.period = new.period
              and t.status = 'closed')
    ) then
      raise exception 'timesheet_not_closed';
    end if;
  end if;

  if old.status = 'closed' then
    if new.status = 'draft' and new.unlock_reason is not null
       and length(trim(new.unlock_reason)) > 0 then
      return new;
    end if;
    -- KHE DUY NHẤT trên kỳ đã chốt: nhận số phiếu chi khi kỳ CHƯA CÓ phiếu nào
    -- còn hiệu lực. Không cho đổi từ phiếu đang sống sang phiếu khác. Phải tính
    -- cả trường hợp phiếu cũ bị xoá khỏi Sổ quỹ (xoá mềm): không cho nối lại
    -- thì lần chốt sau ghi phiếu mới mà kỳ không nhớ nổi — đúng cái lỗ "hai
    -- phiếu chi cho một kỳ" mà bản này sinh ra để bịt.
    -- Mọi cột mang tiền/dấu vết chốt phải y nguyên — liệt kê tường minh chứ
    -- không dùng `new.* is not distinct from old.*` để người sau thêm cột mới
    -- phải nghĩ một lần.
    if new.status = 'closed'
       and new.cash_entry_id is not null
       and (old.cash_entry_id is null
            or not exists (select 1 from public.cash_entries ce
                            where ce.id = old.cash_entry_id and ce.deleted_at is null))
       and new.total_vnd     =                old.total_vnd
       and new.period        =                old.period
       and new.tenant_id     =                old.tenant_id
       and new.closed_by     is not distinct from old.closed_by
       and new.closed_at     is not distinct from old.closed_at
       and new.unlock_reason is not distinct from old.unlock_reason then
      return new;
    end if;
    raise exception 'payroll_locked';
  end if;
  return new;
end;
$$;

comment on function public.payroll_close_guard() is
  'Chot ky luong: bat bang cong da chot (#167) + khoa ky da chot. #270 noi DUNG MOT KHE tren ky da chot: nhan cash_entry_id khi ky chua co phieu chi nao con hieu luc (chua co, hoac phieu cu da bi xoa mem khoi so quy), moi cot tien giu nguyen. Duong sua so van la mo khoa kem ly do.';

-- ── Nối lại MỘT LẦN cho kỳ đã chốt từ trước ─────────────────────────
-- Khớp theo cả hai câu chữ đang tồn tại trong kho (`messages/vi.json` +
-- `messages/en.json`). Đây là lần DUY NHẤT máy nhìn vào chữ; sau bản này mọi
-- lần chốt đều đi bằng số phiếu. Cố ý so BẰNG khớp chính xác chứ không `like`:
-- `like '%MM/YYYY'` sẽ vơ luôn phiếu "Tạm ứng lương kỳ MM/YYYY" mà bản này vừa
-- mở đường sinh ra — nhận nhầm phiếu tạm ứng làm phiếu chi cả kỳ thì lần chốt
-- sau sẽ GHI ĐÈ 500.000đ thành 45 triệu.
update public.payroll_periods p
   set cash_entry_id = ce.id
  from public.cash_entries ce
 where p.cash_entry_id is null
   and ce.tenant_id  = p.tenant_id
   and ce.category   = 'salary'
   and ce.direction  = 'out'
   and ce.deleted_at is null
   and ce.note in (
         'Lương kỳ ' || to_char(p.period, 'MM/YYYY'),
         'Payroll '  || to_char(p.period, 'MM/YYYY'))
   -- Phiếu đã bị kỳ khác nhận thì bỏ qua (không thể xảy ra vì ghi chú mang
   -- tháng, nhưng chỉ mục duy nhất ở trên sẽ làm cả migration đỏ nếu có).
   and not exists (select 1 from public.payroll_periods q where q.cash_entry_id = ce.id);


-- ════════════════════════════════════════════════════════════════════
-- 3. GHI LẠI Ý NGHĨA MỚI CỦA `source_type = 'cash_entry'`
-- ════════════════════════════════════════════════════════════════════
comment on column public.payslip_lines.source_type is
  'Goc cua dong tien. timesheet/commission: may sinh, xoa sach moi lan Tinh lai. manual: nguoi ghi tay, bat buoc co nhan + nguoi ghi (#167). cash_entry (#270, bat dau co du lieu tu 21/08): dong tam ung co PHIEU CHI that trong so quy — source_id tro thang toi cash_entries.id, xoa dong thi xoa mem phieu do. Tinh lai ky luong KHONG dung toi hai loai sau.';
