-- V6 csatQc (19/08/2026) — Bảng đánh giá hài lòng sau lịch hẹn.
-- Mỗi lần nhân viên bấm "Hoàn thành" → 1 bản ghi survey tự sinh kèm token.
-- Khách nhận link /survey/[token] → đánh 1-5 sao + bình luận (không cần đăng nhập).

create table if not exists public.satisfaction_surveys (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  -- ⚠️ KHÔNG dùng encode(...,'base64url'): bảng mã đó chỉ có từ PostgreSQL 18,
  -- CSDL thật đang chạy 17.6 → migration gãy ngay lúc áp (đo 19/08 trước khi áp).
  -- 'hex' có ở mọi phiên bản, an toàn trong URL, 18 byte = 144 bit không đoán nổi.
  token          text not null unique default encode(gen_random_bytes(18), 'hex'),
  rating         smallint check (rating between 1 and 5),
  comment        text check (comment is null or length(comment) <= 1000),
  submitted_at   timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists satisfaction_surveys_tenant_idx
  on public.satisfaction_surveys (tenant_id, submitted_at desc nulls last);
create index if not exists satisfaction_surveys_appointment_idx
  on public.satisfaction_surveys (appointment_id);
-- token đã có unique index tự động

alter table public.satisfaction_surveys enable row level security;

-- ĐỌC: chỉ vai quản lý — khớp đúng chốt chặn ở màn /app/csat. Trước đây chỉ lọc
-- theo tiệm, nghĩa là vai "Chỉ xem" cũng đọc được bình luận khách qua API dù màn
-- hình chặn. Cùng họ với ba lỗ đã vá 18/08 (#170 · #172 · #173).
drop policy if exists satisfaction_surveys_select on public.satisfaction_surveys;
create policy satisfaction_surveys_select on public.satisfaction_surveys
  for select using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

-- GHI: nhân viên bấm "Hoàn thành" cũng phát được phiếu → có 'staff'.
-- Vai "Chỉ xem" bị loại: không có việc gì để đánh dấu xong.
drop policy if exists satisfaction_surveys_insert on public.satisfaction_surveys;
create policy satisfaction_surveys_insert on public.satisfaction_surveys
  for insert with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager', 'staff')
  );

-- Không có policy update/delete → khách chỉ gửi được qua RPC bên dưới,
-- và không ai trong tiệm sửa/xoá được đánh giá đã nhận (bất biến: phiếu là sự thật).

-- RPC công khai: khách gửi đánh giá theo token (không cần đăng nhập)
create or replace function public.submit_survey(
  p_token  text,
  p_rating smallint,
  p_comment text default null
)
returns text   -- 'ok' hoặc mã lỗi
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comment text;
begin
  -- NULL phải chặn TƯỜNG MINH: `null not between 1 and 5` cho ra NULL (không phải
  -- true), nên bản đầu để lọt xuống UPDATE rồi vỡ ở check constraint — khách nhận
  -- lỗi 500 thay vì lời nhắn dễ hiểu.
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return 'invalid_rating';
  end if;

  v_comment := nullif(left(trim(coalesce(p_comment, '')), 1000), '');

  update public.satisfaction_surveys
  set rating       = p_rating,
      comment      = v_comment,
      submitted_at = now()
  where token        = p_token
    and submitted_at is null;   -- ngăn gửi lại

  if not found then
    return 'not_found_or_done';
  end if;

  return 'ok';
end;
$$;

-- RPC công khai: lấy thông tin phiếu theo token (cho trang /survey/[token])
create or replace function public.get_survey_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'shop_name',         t.name,
    'item_name',         i.name,
    'already_submitted', s.submitted_at is not null,
    'rating',            s.rating
  )
  into v_result
  from public.satisfaction_surveys s
  join public.appointments a on a.id = s.appointment_id
  join public.tenants      t on t.id = s.tenant_id
  left join public.items   i on i.id = a.item_id
  where s.token = p_token
  limit 1;

  return v_result;  -- null nếu token không tồn tại
end;
$$;

-- Hàm mới mặc định cho PUBLIC gọi được — thu về rồi cấp lại đích danh, để đọc
-- code là thấy rõ ai gọi được (quy ước rà soát 17/08, việc #134).
revoke execute on function public.submit_survey(text, smallint, text) from public;
revoke execute on function public.get_survey_info(text) from public;
grant execute on function public.submit_survey(text, smallint, text) to anon, authenticated;
grant execute on function public.get_survey_info(text) to anon, authenticated;
