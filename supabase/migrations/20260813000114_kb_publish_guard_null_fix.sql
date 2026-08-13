-- ADR-0015 — VÁ CHỐT ĐĂNG: `null not in (...)` là NULL, không phải TRUE.
--
-- Bắt được ngay khi nghiệm thu D3 (bắt buộc thấy ĐỎ trước): ca "đăng mục khi
-- KHÔNG phải owner/admin" **không bị chặn**. Trần ký tự chặn đúng, chỉ chốt
-- quyền hở.
--
-- Vì sao hở: `public.app_role()` trả NULL khi không có JWT tiệm trong ngữ cảnh
-- (service_role, worker nền, hoặc hàng thành viên bị thiếu). Trong SQL,
-- `NULL not in ('owner','admin')` cho ra **NULL** chứ không phải TRUE — mà
-- `if NULL then` không chạy. Nên chốt tự mở toang đúng lúc cần nhất.
--
-- Đây là kiểu hỏng tệ nhất: **code đọc thì thấy có chốt**, chạy thì không có.
-- Cùng họ với bug "chốt chặn spam TỰ MỞ TOANG khi hạ tầng chưa cấu hình"
-- (việc #10) — mặc định phải là ĐÓNG, không phải mở.

create or replace function public.kb_entries_guard()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_so_muc   int;
  v_so_ky_tu bigint;
  v_vai      text;
begin
  -- ① Chỉ owner/admin được ĐĂNG.
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    v_vai := coalesce((select public.app_role()), '');
    -- coalesce về chuỗi rỗng: không xác định được vai ⇒ COI NHƯ KHÔNG CÓ QUYỀN.
    -- Cấm viết `v_vai not in (...)` trần — NULL sẽ làm cả điều kiện thành NULL.
    if v_vai <> 'owner' and v_vai <> 'admin' then
      raise exception 'kb_publish_forbidden'
        using hint = 'Chỉ chủ tiệm hoặc quản trị viên được đăng mục kho tri thức.';
    end if;
  end if;

  -- ② Trần theo TIỆM. Đếm cả bản nháp: nháp cũng chiếm chỗ, và nếu chỉ đếm bản
  --    đã đăng thì tiệm nhồi 5.000 nháp rồi đăng loạt.
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

comment on function public.kb_entries_guard() is
  'ADR-0015 mục 5+8. Hai chốt không lách được: (1) chỉ owner/admin đăng được — vai KHÔNG XÁC ĐỊNH bị coi là KHÔNG có quyền (vá 13/08: null not in (...) là NULL nên if không chạy, chốt tự mở); (2) trần 200 mục / 60k ký tự, vượt thì raise exception, cấm cắt bớt âm thầm.';
