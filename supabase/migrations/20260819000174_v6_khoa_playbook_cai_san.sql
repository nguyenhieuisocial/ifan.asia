-- V6 automation — playbook CÀI SẴN không được sửa/xoá, chốt ở CSDL.
--
-- Màn "Quy trình tự động" vừa mở đường Tạo/Sửa/Xoá. Phần app đã chặn hai lớp
-- (đọc-rồi-kiểm + `.eq("is_system", false)` ngay trong câu lệnh). Nhưng RLS
-- `workflows_manage` là `for all`, nên một lời gọi thẳng vẫn xoá được playbook
-- cài sẵn của chính tiệm mình — và KHÔNG có đường nào gieo lại. Mất là mất luôn.
--
-- Luật kho: bất biến nằm ở CSDL, không nằm ở màn hình. Chặn ở đây thì mọi cửa
-- (app · API · lời gọi tay) đều chịu chung một luật.
create or replace function public.workflow_he_thong_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then raise exception 'workflow_he_thong'; end if;
    return old;
  end if;

  -- Sửa: playbook cài sẵn chỉ được BẬT/TẮT. Chủ tiệm tắt playbook không hợp
  -- tiệm mình là chuyện thường; đổi ruột nó thì không.
  if old.is_system then
    if new.name is distinct from old.name
       or new.key is distinct from old.key
       or new.trigger_event is distinct from old.trigger_event
       or new.conditions is distinct from old.conditions
       or new.actions is distinct from old.actions
       or new.is_system is distinct from old.is_system then
      raise exception 'workflow_he_thong';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists workflow_he_thong on public.workflows;
create trigger workflow_he_thong before update or delete on public.workflows
  for each row execute function public.workflow_he_thong_guard();
