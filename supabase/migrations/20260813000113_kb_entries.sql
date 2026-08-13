-- ADR-0015 việc 1 — nền Kho tri thức.
--
-- Kho tri thức là NGUỒN SỰ THẬT THỨ 5 của AI trực việc (sau: giờ mở cửa ·
-- dịch vụ & giá · địa chỉ · giới thiệu tiệm). Không dựng luồng AI thứ hai —
-- nó đi qua y nguyên `ai_autopilot_decide()` đã có (bất biến 3).
--
-- ĐO TRƯỚC KHI QUYẾT (13/08, CSDL Singapore): 9 tiệm · trung bình 4 dịch vụ ·
-- **0 tiệm khai giờ mở cửa**. Nghẽn không phải AI thiếu thông minh mà là tiệm
-- chưa nhập gì. Điền 7 ngày × 2 mốc giờ là việc nặng; gõ một đoạn văn xuôi mất
-- 20 giây. Đó là lý do làm cái này.
--
-- VÌ SAO KHÔNG DÙNG VECTOR: trần 200 mục / 60k ký tự ≈ 17k token, lọt thỏm
-- trong cửa sổ 200k của Haiku. Nhét đủ TỐT HƠN truy hồi vì truy hồi có thể
-- TRƯỢT — khách hỏi "có chỗ gửi xe không?" mà kho ghi "bãi đỗ miễn phí" thì
-- khớp từ khoá trượt, AI im lặng DÙ TIỆM ĐÃ KHAI. Đó là hỏng âm thầm.

-- ---------- kb_entries ----------

create table public.kb_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Giới hạn độ dài đặt ở CỘT: một mục dài 10k ký tự tự nó phá trần cả kho.
  question text not null check (length(btrim(question)) between 3 and 200),
  answer   text not null check (length(btrim(answer))   between 3 and 2000),
  -- 'draft' mặc định: mục mới KHÔNG tự động đến tay khách. Chỉ owner/admin
  -- được chuyển sang 'published' — ép bằng trigger bên dưới, không chỉ bằng RPC.
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.kb_entries enable row level security;

-- Đọc: mọi thành viên của tiệm (nhân viên cần đọc để soạn tiếp, và để biết
-- AI đang nói gì với khách của họ).
create policy kb_entries_select on public.kb_entries for select
  using (tenant_id = (select public.current_tenant_id()));

-- Ghi: mọi thành viên soạn được. Chốt "ai được ĐĂNG" nằm ở trigger, không ở
-- đây — vì nhân viên VẪN phải sửa được bản nháp của chính mình.
create policy kb_entries_write on public.kb_entries for all
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

create trigger kb_entries_touch before update on public.kb_entries
  for each row execute function public.touch_updated_at();

revoke all on public.kb_entries from anon;

create index kb_entries_tenant_status_idx
  on public.kb_entries (tenant_id, status, updated_at desc);

comment on table public.kb_entries is
  'ADR-0015. Nguồn sự thật THỨ 5 của AI trực việc. Chỉ mục status=published mới đến tay khách. Trần 200 mục / 60.000 ký tự mỗi tiệm, ép ở CSDL (bất biến 1) — vượt trần thì BÁO LỖI, cấm cắt bớt âm thầm.';

-- ---------- Trần: ép ở CSDL, báo lỗi rõ, KHÔNG cắt âm thầm ----------

create or replace function public.kb_entries_guard()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_so_muc  int;
  v_so_ky_tu bigint;
  v_vai     text;
begin
  -- ① Chỉ owner/admin được ĐĂNG. Nhân viên soạn và sửa nháp thoải mái.
  --    Ép ở đây chứ không chỉ ở RPC: gọi thẳng PostgREST vẫn phải qua trigger.
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    v_vai := (select public.app_role());
    if v_vai not in ('owner', 'admin') then
      raise exception 'kb_publish_forbidden'
        using hint = 'Chỉ chủ tiệm hoặc quản trị viên được đăng mục kho tri thức.';
    end if;
  end if;

  -- ② Trần theo TIỆM. Đếm cả bản nháp: nháp cũng chiếm chỗ và cũng phải soát,
  --    và nếu chỉ đếm bản đã đăng thì tiệm nhồi 5.000 nháp rồi đăng loạt.
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

create trigger kb_entries_guard_trg
  before insert or update on public.kb_entries
  for each row execute function public.kb_entries_guard();

comment on function public.kb_entries_guard() is
  'ADR-0015 mục 5+8. Hai chốt KHÔNG lách được bằng cách gọi thẳng API: (1) chỉ owner/admin đăng được, (2) trần 200 mục / 60k ký tự. Vượt trần raise exception — cấm cắt bớt âm thầm vì tiệm sẽ tưởng đã lưu đủ.';

-- ---------- Lời dặn riêng của tiệm (ADR mục 6) ----------

alter table public.ai_autopilot
  add column if not exists custom_instruction text
    check (custom_instruction is null or length(custom_instruction) <= 1000);

comment on column public.ai_autopilot.custom_instruction is
  'ADR-0015 mục 6. Lời dặn riêng của tiệm — CHỈ đổi giọng (xưng hô, câu chào). Đặt TRƯỚC khối luật cứng iFan trong lời nhắc, nên KHÔNG mở được thứ luật cứng cấm. Trần 1.000 ký tự ép ở CSDL.';

-- ---------- Trả lời xong phải nói được dựa vào mục nào (ADR mục 7) ----------

alter table public.ai_reply_log
  add column if not exists kb_ids uuid[];

comment on column public.ai_reply_log.kb_ids is
  'ADR-0015 mục 7. Mục kho tri thức mà model khai là đã dùng. BẮT BUỘC vì việc #110 (chấm chất lượng khi có 20 hội thoại thật) không làm được nếu không biết câu sai đến từ đâu: "AI kém" và "một mục KB viết sai" chữa bằng hai cách hoàn toàn khác nhau.';

-- ---------- RPC cho worker: lấy kho ĐÃ ĐĂNG của một tiệm ----------

create or replace function public.kb_published_for(p_tenant uuid)
returns table (id uuid, question text, answer text)
language sql
stable
security definer set search_path = public, pg_temp as $$
  select e.id, e.question, e.answer
    from public.kb_entries e
   where e.tenant_id = p_tenant
     and e.status = 'published'
   order by e.updated_at desc
   limit 200
$$;

revoke execute on function public.kb_published_for(uuid) from public, anon, authenticated;
grant execute on function public.kb_published_for(uuid) to service_role;

comment on function public.kb_published_for(uuid) is
  'ADR-0015. Máy quét AI trực việc gọi (service_role, không có JWT tiệm trong ngữ cảnh). CHỈ trả mục đã đăng — bản nháp không bao giờ tới tay khách.';
