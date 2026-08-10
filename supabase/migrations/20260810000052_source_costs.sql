-- #52 — Chi phí theo nguồn (source_costs) + RPC upsert_source_cost
--
-- Vì sao: báo cáo "Nguồn nào ra tiền" mới kể nửa câu chuyện — nguồn ra 10 triệu
-- nhưng đốt 15 triệu quảng cáo vẫn là nguồn LỖ. Chủ tiệm nhập chi phí THEO THÁNG
-- cho từng nguồn (một dòng = một nguồn × một tháng), màn báo cáo trừ ra cột
-- Lời/Lỗ + ROAS. Không nhập thì màn hiện "—", không đoán mò.
--
-- Chuẩn theo #4: tiền bigint VNĐ, timestamptz, RLS bật ngay khi tạo bảng,
-- policy bọc (select ...) cache initplan, unique dẫn đầu tenant_id, FK có index.
-- search_path ghim `public, pg_temp` (chốt #40).

create table public.source_costs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_id uuid not null references public.lead_sources(id) on delete cascade,
  -- Luôn là NGÀY 1 của tháng — RPC bên dưới tự chuẩn hóa, check chặn ghi thẳng sai
  month date not null check (month = date_trunc('month', month)::date),
  amount bigint not null check (amount >= 0), -- VNĐ
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source_id, month)
);
-- unique ở trên đã phủ truy vấn chính (tenant_id, source_id, month);
-- index riêng cho FK source_id (chuẩn "mọi FK có index" của #4)
create index source_costs_source_idx on public.source_costs (source_id);

alter table public.source_costs enable row level security;
-- Bảng số liệu cả tiệm: mọi thành viên tenant đọc được (màn báo cáo đã chặn
-- staff ở tầng app theo REPORT_ROLES); ghi chỉ owner/admin/manager — khớp
-- đúng nhóm được xem báo cáo nguồn.
create policy source_costs_select on public.source_costs for select
  using (tenant_id = (select public.current_tenant_id()));
create policy source_costs_manage on public.source_costs for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger source_costs_touch before update on public.source_costs
  for each row execute function public.touch_updated_at();

-- ---------- RPC upsert_source_cost ----------
-- Gộp "chưa có thì thêm, có rồi thì sửa" vào một lệnh — tầng web không phải tự
-- phân nhánh. SECURITY INVOKER: RLS của bảng vẫn là chốt quyền thật; kiểm role
-- ở đây chỉ để trả lỗi mã ngắn rõ ràng (kiểu handoff_conversation #24) thay vì
-- "new row violates row-level security policy".
create function public.upsert_source_cost(
  p_source_id uuid,
  p_month     date,
  p_amount    bigint
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if (select public.current_tenant_id()) is null or auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if (select public.app_role()) not in ('owner','admin','manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_source_id is null or p_month is null then
    raise exception 'source_and_month_required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  insert into public.source_costs (tenant_id, source_id, month, amount)
  values ((select public.current_tenant_id()), p_source_id,
          date_trunc('month', p_month)::date, p_amount)
  on conflict (tenant_id, source_id, month)
    do update set amount = excluded.amount;
end;
$$;

revoke execute on function public.upsert_source_cost(uuid, date, bigint) from public, anon;
grant execute on function public.upsert_source_cost(uuid, date, bigint) to authenticated;
