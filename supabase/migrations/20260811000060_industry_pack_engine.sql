-- ============================================================
-- iFan.asia — Migration #60: Industry Pack Engine (V1a — Quy hoạch hợp nhất
-- 10-08, mục 11 + 15 + 16 + 35). CHỌN NGÀNH LÀ CHỌN TEMPLATE THÔNG MINH:
-- một bộ dữ liệu (từ vựng, module bật/tắt, KPI gợi ý, dữ liệu mẫu) đè lên
-- app — KHÔNG một nhánh code riêng cho từng ngành (luật D1: một codebase).
--
-- VA CHẠM ĐÃ XỬ LÝ (đọc trước khi sửa file này lần sau):
-- tenants.industry trước đây chỉ nhận 4 giá trị cũ qua seed_industry_template
-- (migration #12): spa_clinic / education / retail_online / other. 6 pack mới
-- theo Quy hoạch mục 16 là: spa / shop / kham / pet / fnb / retail. Ánh xạ
-- KHÔNG MẤT DỮ LIỆU: spa_clinic→spa (đúng nội dung tag "Chăm da, Triệt lông"),
-- retail_online→shop (đúng nội dung "Chốt đơn, Giao hàng"); education giữ
-- nguyên làm pack thứ 7 (NGOÀI 6 ngành mũi nhọn, chưa làm sâu — nội dung y hệt
-- bản cũ, không đổi hành vi tenant đang dùng); other là pack trung tính.
-- seed_industry_template() (migration #12) bị THAY THẾ bởi apply_industry_pack()
-- — có đủ hành vi cũ (set industry + seed tags/quick_replies) CỘNG pack engine.
-- ============================================================

-- ---------- A. Bất biến 11: xóa mềm + Thùng rác (chuẩn hoá cho contacts/deals/companies) ----------
-- 3 bảng này đã có deleted_at (migration #4/#14/#18) — chỉ còn thiếu công cụ
-- TRA CỨU chung + job dọn thật sau 30 ngày. KHÔNG tạo cột mới, KHÔNG đổi RLS
-- hiện có (các policy _select đã lọc deleted_at is null ở đa số nơi — hàm dưới
-- đọc thẳng bảng cho owner/admin, có kiểm quyền riêng, không đi qua RLS ẩn).

create or replace function public.trash_list(p_limit int default 100)
returns table (
  entity_type text, entity_id uuid, title text, deleted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
begin
  if v_tenant is null or (select public.app_role()) not in ('owner','admin') then
    raise exception 'forbidden';
  end if;
  return query
    select 'contact'::text, c.id, c.full_name, c.deleted_at
      from public.contacts c
      where c.tenant_id = v_tenant and c.deleted_at is not null
    union all
    select 'deal'::text, d.id, d.title, d.deleted_at
      from public.deals d
      where d.tenant_id = v_tenant and d.deleted_at is not null
    union all
    select 'company'::text, co.id, co.name, co.deleted_at
      from public.companies co
      where co.tenant_id = v_tenant and co.deleted_at is not null
    order by 4 desc
    limit p_limit;
end;
$$;
revoke execute on function public.trash_list(int) from public, anon;
grant execute on function public.trash_list(int) to authenticated;

create or replace function public.trash_restore(p_entity_type text, p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
begin
  if v_tenant is null or (select public.app_role()) not in ('owner','admin') then
    raise exception 'forbidden';
  end if;
  if p_entity_type = 'contact' then
    update public.contacts set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  elsif p_entity_type = 'deal' then
    update public.deals set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  elsif p_entity_type = 'company' then
    update public.companies set deleted_at = null, updated_at = now()
      where id = p_entity_id and tenant_id = v_tenant;
  else
    raise exception 'invalid_entity_type';
  end if;
end;
$$;
revoke execute on function public.trash_restore(text, uuid) from public, anon;
grant execute on function public.trash_restore(text, uuid) to authenticated;

-- Dọn thật sau 30 ngày — job đêm (nối chuông báo #44 nếu lỗi vì domain_events
-- trigger phụ thuộc; DELETE trực tiếp không qua outbox vì đây là dọn rác).
create or replace function public.trash_purge_expired()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.contacts where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.deals where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.companies where deleted_at is not null and deleted_at < now() - interval '30 days';
end;
$$;
revoke execute on function public.trash_purge_expired() from public, anon, authenticated;

select cron.schedule('trash-purge-nightly', '17 3 * * *', $$select public.trash_purge_expired()$$);

-- ---------- B. Hợp đồng 24k: tệp đính kèm (dùng LẠI bucket tenant-files sẵn có #2) ----------

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  path text not null, -- object path trong bucket tenant-files: {tenant_id}/{...}
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (tenant_id, entity_type, entity_id) where deleted_at is null;
alter table public.attachments enable row level security;
create policy attachments_select on public.attachments for select
  using (tenant_id = (select public.current_tenant_id()));
create policy attachments_insert on public.attachments for insert
  with check (tenant_id = (select public.current_tenant_id()));
create policy attachments_delete on public.attachments for delete
  using (tenant_id = (select public.current_tenant_id()));
revoke all on public.attachments from anon;
grant select, insert, delete on public.attachments to authenticated;

comment on table public.attachments is
  'Hợp đồng 24k — MỘT bảng đa hình cho mọi tệp đính kèm (ảnh Hộp thư, hồ sơ ca, logo tiệm...). Object thật nằm trong storage bucket tenant-files (RLS theo (storage.foldername(name))[1] = tenant_id, migration #2) — bảng này chỉ là chỉ mục + liên kết entity. Module mới cần đính kèm file PHẢI dùng bảng này, cấm tự chế.';

-- ---------- C. Hợp đồng 24q: nhật ký theo bản ghi ----------

create table public.record_audit (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null, -- 'created' | 'updated' | 'deleted' | 'restored' | 'exported' | 'viewed_sensitive'
  diff jsonb,
  at timestamptz not null default now()
);
create index record_audit_entity_idx on public.record_audit (tenant_id, entity_type, entity_id, at desc);
alter table public.record_audit enable row level security;
create policy record_audit_select on public.record_audit for select
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin'));
revoke all on public.record_audit from anon;
grant select on public.record_audit to authenticated;
-- Ghi chỉ qua RPC (dưới), không insert trực tiếp từ client — tránh giả mạo actor_id.

create or replace function public.record_audit_log(
  p_entity_type text, p_entity_id uuid, p_action text, p_diff jsonb default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  insert into public.record_audit (tenant_id, entity_type, entity_id, actor_id, action, diff)
    values (v_tenant, p_entity_type, p_entity_id, auth.uid(), p_action, p_diff);
end;
$$;
revoke execute on function public.record_audit_log(text, uuid, text, jsonb) from public, anon;
grant execute on function public.record_audit_log(text, uuid, text, jsonb) to authenticated;

comment on table public.record_audit is
  'Hợp đồng 24q — MỘT đường ghi nhật ký cho mọi bản ghi. Module mới cần audit gọi record_audit_log(), không tự chế bảng log riêng.';

-- ---------- D. Industry Pack Engine ----------

create table public.industry_packs (
  key text primary key, -- 'spa' | 'shop' | 'kham' | 'pet' | 'fnb' | 'retail' | 'education' | 'other'
  version int not null default 1,
  -- 8 mảnh theo Quy hoạch mục 11, gộp 1 cột jsonb (đơn giản hoá — đủ cho V1a,
  -- tách bảng riêng nếu sau này cần lọc/tìm theo mảnh):
  --   terminology, modules, kpi_presets, pipeline_stages, playbooks,
  --   custom_fields, dashboard_layout, sample_data
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Đọc công khai trong app (mọi tenant đọc được danh sách pack để chọn/xem trước) —
-- không có dữ liệu tenant nào trong bảng này, RLS bật nhưng cho SELECT rộng.
alter table public.industry_packs enable row level security;
create policy industry_packs_select on public.industry_packs for select
  using (true);
revoke all on public.industry_packs from anon;
grant select on public.industry_packs to authenticated;

create table public.tenant_pack_overrides (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  -- Mảnh nào tiệm đã tự sửa thì nằm ở đây (key = tên mảnh, value = nội dung đã
  -- sửa) — nâng version pack gốc KHÔNG đè lên mảnh đã customized.
  overrides jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.tenant_pack_overrides enable row level security;
create policy tenant_pack_overrides_select on public.tenant_pack_overrides for select
  using (tenant_id = (select public.current_tenant_id()));
create policy tenant_pack_overrides_manage on public.tenant_pack_overrides for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin'));
revoke all on public.tenant_pack_overrides from anon;
grant select, insert, update on public.tenant_pack_overrides to authenticated;

-- Cửa DUY NHẤT đọc pack đã resolve (pack gốc + override tiệm) — mọi màn (nav,
-- Tổng quan, tìm kiếm...) gọi hàm này, KHÔNG tự query industry_packs (luật D1
-- + bất biến 12/13). security invoker vì chỉ đọc theo RLS hiện có, không cần
-- vượt quyền.
create or replace function public.tenant_pack_view()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(ip.content, '{}'::jsonb) || coalesce(
    (select o.overrides from public.tenant_pack_overrides o
      where o.tenant_id = (select public.current_tenant_id())),
    '{}'::jsonb
  )
  from public.tenants t
  left join public.industry_packs ip on ip.key = t.industry
  where t.id = (select public.current_tenant_id());
$$;
grant execute on function public.tenant_pack_view() to authenticated;

comment on function public.tenant_pack_view() is
  'Hợp đồng D1: MỘT nguồn đọc pack cho mọi màn — trả về content của pack (theo tenants.industry) đè bởi tenant_pack_overrides. Trả {} nếu tenant chưa chọn ngành (industry null) — caller tự coi là "chưa có pack".';

-- Thay thế seed_industry_template() (migration #12): set industry + seed
-- tags/quick_replies THEO PACK (không hardcode danh sách ngành — đọc từ
-- industry_packs, D1). Đổi ngành KHÔNG xoá dữ liệu đã có — chỉ chèn thêm tag/
-- quick-reply MẪU (on conflict do nothing), pipeline/deal/contact giữ nguyên.
create or replace function public.apply_industry_pack(p_pack_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_sample jsonb;
  v_tag text;
  v_qr jsonb;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if (select public.app_role()) not in ('owner','admin') then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.industry_packs where key = p_pack_key) then
    raise exception 'invalid_pack_key';
  end if;

  update public.tenants set industry = p_pack_key where id = v_tenant;

  select content -> 'sample_data' into v_sample from public.industry_packs where key = p_pack_key;

  -- Tags mẫu
  for v_tag in select jsonb_array_elements_text(coalesce(v_sample -> 'tags', '[]'::jsonb))
  loop
    insert into public.tags (tenant_id, name) values (v_tenant, v_tag)
      on conflict (tenant_id, name) do nothing;
  end loop;

  -- Câu trả lời nhanh mẫu
  for v_qr in select jsonb_array_elements(coalesce(v_sample -> 'quick_replies', '[]'::jsonb))
  loop
    insert into public.quick_replies (tenant_id, title, content, sort_order)
      values (v_tenant, v_qr ->> 'title', v_qr ->> 'content', coalesce((v_qr ->> 'sort_order')::int, 0))
      on conflict (tenant_id, title) do nothing;
  end loop;

  perform public.record_audit_log('tenant', v_tenant, 'pack_applied', jsonb_build_object('pack_key', p_pack_key));
end;
$$;
revoke execute on function public.apply_industry_pack(text) from public, anon;
grant execute on function public.apply_industry_pack(text) to authenticated;

-- seed_industry_template (migration #12) hết vai trò — apply_industry_pack làm
-- mọi việc nó từng làm CỘNG pack engine. Xoá để không tồn hàm chết trùng chức
-- năng (Section 3 — nhánh CHÍNH TÔI thay thế, không phải dead code người khác).
drop function if exists public.seed_industry_template(text);

-- ---------- E. Data migration: ánh xạ 4 giá trị cũ → 8 giá trị pack mới ----------

alter table public.tenants drop constraint if exists tenants_industry_check;

update public.tenants set industry = 'spa' where industry = 'spa_clinic';
update public.tenants set industry = 'shop' where industry = 'retail_online';
-- education, other, null: giữ nguyên.

alter table public.tenants
  add constraint tenants_industry_check
  check (industry is null or industry in ('spa','shop','kham','pet','fnb','retail','education','other'));

comment on column public.tenants.industry is
  'Pack ngành đang áp (khớp industry_packs.key) — null = chưa chọn. Đổi qua apply_industry_pack(), KHÔNG update tay (bỏ lỡ seed tag/quick-reply + audit log).';
