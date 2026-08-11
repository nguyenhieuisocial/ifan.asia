-- #58 — Đếm lượt dùng câu trả lời nhanh (vòng phản hồi màn Cài đặt → Câu trả lời nhanh)
--
-- Vì sao: kho câu mẫu chỉ có chiều "soạn" mà thiếu chiều "có được dùng thật
-- không" — chủ tiệm không biết câu nào đáng giữ, câu nào nên sửa/xóa. Ghi lại
-- MỖI LẦN nhân viên chèn câu mẫu vào composer Hộp thư (nút ⚡), màn Cài đặt
-- hiện "dùng n lần trong 30 ngày".
--
-- Chọn bảng SỰ KIỆN (reply_id + used_at) thay vì cột counter trên quick_replies:
-- counter chỉ trả lời được "tổng từ thuở nào", không trả lời được "30 ngày gần
-- đây" — đúng mẫu sla_events + sla_fired_counts (#17/#31), đếm trong CSDL,
-- không tải về đếm (bệnh cũ đã trị, task #24/#29).
--
-- Chuẩn: security invoker (RLS là chốt quyền thật), search_path ghim
-- `public, pg_temp` (chốt #40), revoke public/anon trước khi grant đích danh.

-- ---------- bảng sự kiện ----------

create table public.quick_reply_usages (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reply_id uuid not null references public.quick_replies(id) on delete cascade,
  used_by uuid not null,
  used_at timestamptz not null default now()
);

comment on table public.quick_reply_usages is
  'Sổ sự kiện: mỗi lần một câu trả lời nhanh được chèn vào composer Hộp thư. Chỉ ghi thêm — không update/delete.';

-- Index trùng khớp câu WHERE của RPC đếm (tenant qua RLS + khung thời gian)
create index quick_reply_usages_count_idx
  on public.quick_reply_usages (tenant_id, reply_id, used_at);

alter table public.quick_reply_usages enable row level security;

-- Mọi thành viên ĐỌC — màn Câu trả lời nhanh mở cho mọi vai (staff chỉ-đọc)
create policy quick_reply_usages_select on public.quick_reply_usages for select
  using (tenant_id = (select public.current_tenant_id()));

-- Ghi: chính mình dùng, đúng tenant của mình — không ai ghi hộ ai
create policy quick_reply_usages_insert on public.quick_reply_usages for insert
  with check (tenant_id = (select public.current_tenant_id())
              and used_by = (select auth.uid()));

-- KHÔNG có policy update/delete: sổ sự kiện chỉ ghi thêm.

-- ---------- ghi một lượt dùng ----------
-- Invoker: policy insert ở trên là chốt thật. Câu không thuộc tenant mình
-- (hoặc đã bị xóa) thì insert 0 dòng — không lỗi, không lộ gì.

create or replace function public.quick_reply_mark_used(p_reply uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  insert into public.quick_reply_usages (tenant_id, reply_id, used_by)
  select r.tenant_id, r.id, auth.uid()
  from public.quick_replies r
  where r.id = p_reply
$$;

comment on function public.quick_reply_mark_used(uuid) is
  'Ghi một lượt dùng câu trả lời nhanh (composer Hộp thư gọi khi chèn câu). Fire-and-forget ở tầng web.';

revoke execute on function public.quick_reply_mark_used(uuid) from public, anon;
grant execute on function public.quick_reply_mark_used(uuid) to authenticated;

-- ---------- đếm lượt dùng mỗi câu từ mốc p_since ----------

create or replace function public.quick_reply_used_counts(p_since timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(reply_id::text, n), '{}'::jsonb)
  from (
    select reply_id, count(*) as n
    from public.quick_reply_usages
    where used_at >= p_since
    group by reply_id) s
$$;

comment on function public.quick_reply_used_counts(timestamptz) is
  'Số lượt dùng mỗi câu trả lời nhanh từ mốc p_since — jsonb {reply_id: n}, đếm trong CSDL (mẫu sla_fired_counts #31).';

revoke execute on function public.quick_reply_used_counts(timestamptz) from public, anon;
grant execute on function public.quick_reply_used_counts(timestamptz) to authenticated;
