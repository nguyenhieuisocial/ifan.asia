-- =============================================================
-- LƯỚI AN TOÀN: tự bật RLS cho MỌI bảng mới trong schema `public`
--
-- Vì sao có migration này: hàm `rls_auto_enable()` + event trigger
-- `ensure_rls` đã tồn tại trên cơ sở dữ liệu Mumbai từ sớm, nhưng KHÔNG nằm
-- trong migration nào — nghĩa là nó chỉ sống trong đúng một cơ sở dữ liệu đó.
-- Phát hiện lúc dựng lại schema sang Singapore: đối chiếu 401 vs 400 hàm, và
-- thứ duy nhất thiếu chính là lưới an toàn này.
--
-- Đó là kiểu mất mát tệ nhất: không ai nhận ra cho tới khi một bảng mới ra đời
-- mà không có hàng rào, trong một cơ sở dữ liệu mới. Nay đưa vào git để mọi
-- lần dựng lại đều có.
--
-- Tác dụng: bất kỳ `create table` nào trong `public` cũng được bật RLS ngay,
-- kể cả khi người viết migration quên. Không thay thế việc viết policy —
-- bảng bật RLS mà chưa có policy thì CHẶN HẾT, tức là fail-closed, an toàn
-- hơn hẳn để hở.
-- =============================================================

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = public, pg_temp as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name in ('public')
       and cmd.schema_name not in ('pg_catalog', 'information_schema')
       and cmd.schema_name not like 'pg_toast%'
       and cmd.schema_name not like 'pg_temp%'
    then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          -- Không được làm gãy DDL của người khác chỉ vì lưới an toàn không áp được
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (schema % ngoai danh sach)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$$;

comment on function public.rls_auto_enable() is
  'Lưới an toàn: tự bật RLS cho mọi bảng mới trong public. Gắn qua event trigger ensure_rls.';

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end
$$;

-- Tự kiểm: thiếu là báo lỗi ngay, không âm thầm bỏ qua
do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    raise exception 'ensure_rls chua duoc tao — luoi an toan RLS khong hoat dong';
  end if;
end
$$;
