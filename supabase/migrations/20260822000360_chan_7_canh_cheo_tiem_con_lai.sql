-- ════════════════════════════════════════════════════════════════════
-- BẢY CẠNH CHÉO TIỆM CÒN LẠI — CHẶN BẰNG TRIGGER
-- ════════════════════════════════════════════════════════════════════
--
-- Tiếp bản vá #359. Bảy cạnh này KHÔNG dùng được khoá ngoại ghép vì chúng
-- `on delete set null`: khoá ghép sẽ gán null cho CẢ `tenant_id`, mà cột đó
-- `not null` — lệnh xoá bản ghi cha sẽ chết thay vì gỡ liên kết.
--
-- ⚠️ Giữ NGUYÊN khoá ngoại một cột (để `on delete set null` chạy như cũ) và
--   THÊM một trigger kiểm cùng tiệm lúc ghi. Trigger chỉ chạy khi cột liên
--   quan thay đổi, nên không đụng gì tới đường xoá.
--
-- ⚠️ VÌ SAO CẦN: đo 22/08 bằng lệnh ghi thật, cả bảy cạnh này đều LỌT hoặc
--   nằm trong nhóm CHƯA ĐO. Chỗ mù KHÔNG phải chỗ an toàn — chốt luôn.
--
-- `security definer` để trigger đọc được bản ghi cha của tiệm khác; nếu chạy
-- bằng quyền người gọi thì RLS giấu mất dòng đó và trigger tưởng "không có
-- bản ghi nào" rồi cho qua — đúng cái lỗ đang cần bịt.


create or replace function public.cash_entries_cheo_tiem_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  if new.order_id is not null then
    select tenant_id into v_tenant from public.orders where id = new.order_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'cash_entries.order_id phải cùng tiệm (đơn hàng % thuộc tiệm khác)',
        new.order_id using errcode = '23514';
    end if;
  end if;
  if new.project_id is not null then
    select tenant_id into v_tenant from public.projects where id = new.project_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'cash_entries.project_id phải cùng tiệm (dự án % thuộc tiệm khác)',
        new.project_id using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cash_entries_cheo_tiem_guard on public.cash_entries;
create trigger cash_entries_cheo_tiem_guard
  before insert or update of tenant_id, order_id, project_id on public.cash_entries
  for each row execute function public.cash_entries_cheo_tiem_guard();

comment on function public.cash_entries_cheo_tiem_guard() is
  'Chặn cash_entries trỏ sang bản ghi của tiệm khác qua order_id, project_id. Đo 22/08 bằng lệnh ghi thật: lọt. Không dùng khoá ghép được vì các cạnh này on delete set null (#360).';


create or replace function public.contacts_cheo_tiem_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  if new.merged_into_id is not null then
    select tenant_id into v_tenant from public.contacts where id = new.merged_into_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'contacts.merged_into_id phải cùng tiệm (hồ sơ khách được gộp vào % thuộc tiệm khác)',
        new.merged_into_id using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_cheo_tiem_guard on public.contacts;
create trigger contacts_cheo_tiem_guard
  before insert or update of tenant_id, merged_into_id on public.contacts
  for each row execute function public.contacts_cheo_tiem_guard();

comment on function public.contacts_cheo_tiem_guard() is
  'Chặn contacts trỏ sang bản ghi của tiệm khác qua merged_into_id. Đo 22/08 bằng lệnh ghi thật: lọt. Không dùng khoá ghép được vì các cạnh này on delete set null (#360).';


create or replace function public.conversations_cheo_tiem_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  if new.contact_id is not null then
    select tenant_id into v_tenant from public.contacts where id = new.contact_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'conversations.contact_id phải cùng tiệm (khách % thuộc tiệm khác)',
        new.contact_id using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_cheo_tiem_guard on public.conversations;
create trigger conversations_cheo_tiem_guard
  before insert or update of tenant_id, contact_id on public.conversations
  for each row execute function public.conversations_cheo_tiem_guard();

comment on function public.conversations_cheo_tiem_guard() is
  'Chặn conversations trỏ sang bản ghi của tiệm khác qua contact_id. Đo 22/08 bằng lệnh ghi thật: lọt. Không dùng khoá ghép được vì các cạnh này on delete set null (#360).';


create or replace function public.deals_cheo_tiem_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  if new.company_id is not null then
    select tenant_id into v_tenant from public.companies where id = new.company_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'deals.company_id phải cùng tiệm (công ty % thuộc tiệm khác)',
        new.company_id using errcode = '23514';
    end if;
  end if;
  if new.source_id is not null then
    select tenant_id into v_tenant from public.lead_sources where id = new.source_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'deals.source_id phải cùng tiệm (nguồn khách % thuộc tiệm khác)',
        new.source_id using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists deals_cheo_tiem_guard on public.deals;
create trigger deals_cheo_tiem_guard
  before insert or update of tenant_id, company_id, source_id on public.deals
  for each row execute function public.deals_cheo_tiem_guard();

comment on function public.deals_cheo_tiem_guard() is
  'Chặn deals trỏ sang bản ghi của tiệm khác qua company_id, source_id. Đo 22/08 bằng lệnh ghi thật: lọt. Không dùng khoá ghép được vì các cạnh này on delete set null (#360).';


create or replace function public.order_lines_cheo_tiem_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  if new.appointment_id is not null then
    select tenant_id into v_tenant from public.appointments where id = new.appointment_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'order_lines.appointment_id phải cùng tiệm (buổi hẹn % thuộc tiệm khác)',
        new.appointment_id using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists order_lines_cheo_tiem_guard on public.order_lines;
create trigger order_lines_cheo_tiem_guard
  before insert or update of tenant_id, appointment_id on public.order_lines
  for each row execute function public.order_lines_cheo_tiem_guard();

comment on function public.order_lines_cheo_tiem_guard() is
  'Chặn order_lines trỏ sang bản ghi của tiệm khác qua appointment_id. Đo 22/08 bằng lệnh ghi thật: lọt. Không dùng khoá ghép được vì các cạnh này on delete set null (#360).';
