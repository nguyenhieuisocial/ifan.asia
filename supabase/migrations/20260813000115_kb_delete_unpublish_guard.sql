-- ADR-0015 — VÁ: xoá và gỡ đăng cũng phải là quyền owner/admin.
--
-- Lộ ra khi vẽ nốt phần thao tác trên từng mục (13/08). Trigger #113/#114 chỉ
-- canh chiều ĐĂNG (draft → published). Còn hai đường khác đang mở toang:
--
--   1. XOÁ: policy `kb_entries_write ... for all` cho MỌI thành viên xoá —
--      kể cả mục đã đăng. Nhân viên xoá một câu trả lời là tiệm mất nội dung
--      mà không ai biết ai xoá.
--   2. GỠ ĐĂNG (published → draft): nhân viên tắt được câu trả lời của tiệm,
--      AI im lặng, và **không có gì báo**. Tệ hơn xoá vì nó âm thầm.
--
-- Nếu chỉ khoá bằng cách ẩn nút trên màn thì gọi thẳng API vẫn làm được —
-- bất biến 1: chốt phải nằm ở chỗ không lách được.

create or replace function public.kb_entries_guard()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_so_muc   int;
  v_so_ky_tu bigint;
  v_vai      text;
begin
  -- Vai KHÔNG XÁC ĐỊNH ⇒ coi như KHÔNG có quyền. Cấm viết `v_vai not in (...)`
  -- trần: NULL sẽ làm cả điều kiện thành NULL và `if` im lặng bỏ qua (bug đã
  -- dính ở #113, vá ở #114).
  v_vai := coalesce((select public.app_role()), '');

  if tg_op = 'DELETE' then
    if v_vai <> 'owner' and v_vai <> 'admin' then
      raise exception 'kb_delete_forbidden'
        using hint = 'Chỉ chủ tiệm hoặc quản trị viên được xoá mục kho tri thức.';
    end if;
    return old;
  end if;

  -- ĐĂNG (draft → published) HOẶC GỠ ĐĂNG (published → draft): cả hai chiều.
  if (new.status = 'published'
      and (tg_op = 'INSERT' or old.status is distinct from 'published'))
     or (tg_op = 'UPDATE'
         and old.status = 'published' and new.status <> 'published') then
    if v_vai <> 'owner' and v_vai <> 'admin' then
      raise exception 'kb_publish_forbidden'
        using hint = 'Chỉ chủ tiệm hoặc quản trị viên được đăng hoặc gỡ đăng mục kho tri thức.';
    end if;
  end if;

  -- Trần theo TIỆM. Đếm cả bản nháp: nháp cũng chiếm chỗ, và nếu chỉ đếm bản
  -- đã đăng thì tiệm nhồi 5.000 nháp rồi đăng loạt.
  select count(*), coalesce(sum(length(question) + length(answer)), 0)
    into v_so_muc, v_so_ky_tu
    from public.kb_entries
   where tenant_id = new.tenant_id
     and (tg_op = 'INSERT' or id <> new.id);

  if v_so_muc + 1 > 200 then
    raise exception 'kb_limit_entries'
      using hint = 'Kho tri thức tối đa 200 mục. Xoá bớt mục cũ trước khi thêm mới.';
  end if;

  if v_so_ky_tu + length(new.question) + length(new.answer) > 60000 then
    raise exception 'kb_limit_chars'
      using hint = 'Kho tri thức tối đa 60.000 ký tự. Rút gọn hoặc xoá bớt mục cũ.';
  end if;

  new.updated_by := auth.uid();
  return new;
end $$;

-- Trigger cũ chỉ bắt INSERT/UPDATE. Dựng lại để bắt cả DELETE.
drop trigger if exists kb_entries_guard_trg on public.kb_entries;
create trigger kb_entries_guard_trg
  before insert or update or delete on public.kb_entries
  for each row execute function public.kb_entries_guard();

comment on function public.kb_entries_guard() is
  'ADR-0015 mục 5+8. Bốn chốt KHÔNG lách được bằng cách gọi thẳng API: chỉ owner/admin được (1) ĐĂNG, (2) GỠ ĐĂNG, (3) XOÁ; và (4) trần 200 mục / 60k ký tự — vượt thì raise exception, cấm cắt bớt âm thầm. Vai không xác định LUÔN bị coi là không có quyền.';
