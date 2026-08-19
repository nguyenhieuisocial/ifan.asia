-- V8 projects (19/08/2026) — Dự án · việc dự án · việc chặn việc · chi phí dự án.
-- Thẻ design: design-system/man-du-an.html (5 quyết định đã chốt).
--
-- ════════════════════════════════════════════════════════════════════
-- BA ĐIỂM MÔ HÌNH CHỐT TRƯỚC KHI GÕ — ghi lại để người sau không mở lại
-- ════════════════════════════════════════════════════════════════════
--
-- (1) VIỆC DỰ ÁN DÙNG LẠI `activities`, KHÔNG dựng bảng việc thứ hai. Điểm này
--     đã khai trước ở migration #166 (điểm 2) — đây là chỗ thi công nó. Thẻ đòi
--     "việc dự án HIỆN CHUNG với việc hằng ngày trên màn hình của họ": một bảng
--     thì điều đó tự động đúng, không phải làm gì thêm. Hai bảng thì phải viết
--     view gộp — mà view gộp vẫn lệch ở sắp xếp, ở đếm, ở quyền, và mỗi màn
--     hình mới lại phải nhớ gộp. Luật D1: một loại dữ liệu, một nơi ghi.
--
-- (2) CHI PHÍ DỰ ÁN KHÔNG CÓ BẢNG RIÊNG — chỉ thêm `cash_entries.project_id`.
--     Thẻ ghi đích danh: "Mỗi khoản ở đây là MỘT PHIẾU CHI THẬT TRONG SỔ QUỸ,
--     gắn nhãn dự án — không phải bảng tính riêng. Luật D1." Bảng chi phí riêng
--     nghĩa là tiền dự án tiêu rồi mà sổ quỹ không biết, rồi hai con số cùng
--     nói về một lần chi và không ai biết tin con nào.
--
-- (3) NGÀY XONG DO MÁY TÍNH, KHÔNG CÓ Ô GÕ TAY. Quyết định 2 của thẻ: ngày
--     khai trương "không phải con số gõ vào rồi để đó". Nếu cột đó nhận được
--     giá trị từ client thì lúc trễ người ta gõ lại ngày cũ cho báo cáo đẹp, và
--     cả quyết định 2 mất nghĩa. ⇒ TRIGGER ghi đè, y như `attendance_punches.
--     out_of_range` ở migration #166: cột nào là KẾT LUẬN CỦA MÁY thì máy ghi,
--     không tin ô nhập. Chặn ở giao diện thì đúng một request là lách xong.

-- ════════════════════════════════════════════════════════════════════
-- 1. DỰ ÁN
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 160),
  description text check (description is null or length(description) <= 2000),
  started_on  date not null default current_date,

  -- ⚠️ HAI CỘT DƯỚI ĐÂY DO TRIGGER GHI (điểm 3 ở đầu file). Client gửi gì cũng
  -- bị ghi đè — xem `projects_chot_ngay_xong`.
  --
  -- `due_on` = hạn của VIỆC TRỄ NHẤT thuộc dự án. NULL = dự án chưa có việc nào
  -- có hạn ⇒ chưa có ngày xong để nói, khác hẳn với "xong hôm nay".
  due_on      date,
  -- Mốc để đo "đã đẩy bao nhiêu ngày" (thẻ: chỉ báo khi đẩy quá 3 ngày).
  -- CỐ Ý KHÔNG phải "giá trị ngay trước đó": so với giá trị liền trước thì bốn
  -- lần đẩy 1 ngày (mỗi lần ≤ 3) không bao giờ báo, dù đã trôi 4 ngày — đúng
  -- thứ chủ tiệm cần biết mà lại im. Mốc chỉ nhảy KHI ĐÃ BÁO, nên độ trôi được
  -- cộng dồn giữa hai lần báo.
  due_on_baseline date,

  -- Dự trù ban đầu (thẻ: "Dự trù ban đầu 220.000.000 ₫"). Mặc định 0 để cột
  -- not null dùng được ngay lúc mới mở dự án, chưa kịp tính tiền.
  budget_vnd  bigint not null default 0 check (budget_vnd >= 0),

  -- Thẻ KHÔNG nói bộ trạng thái của dự án. Chọn 3 giá trị tối thiểu, cùng khuôn
  -- với `orders.status`/`purchases.status` đã có trong kho. Thêm giá trị sau là
  -- migration một dòng; sống chung với một trạng thái luôn rỗng thì đắt hơn.
  status      text not null default 'active'
              check (status in ('active', 'done', 'cancelled')),

  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_tenant_idx
  on public.projects (tenant_id, status, due_on);

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

comment on column public.projects.due_on is
  'Thẻ man-du-an quyết định 2. DO TRIGGER TÍNH từ hạn việc trễ nhất — KHÔNG phải ô gõ tay. Client ghi vào đây thì bị ghi đè.';
comment on column public.projects.due_on_baseline is
  'Mốc đo độ trôi. Chỉ nhảy khi ĐÃ phát thông báo ⇒ nhiều lần đẩy nhỏ vẫn cộng dồn tới ngưỡng 3 ngày, không bị reset mỗi lần.';

-- ════════════════════════════════════════════════════════════════════
-- 2. VIỆC DỰ ÁN = `activities` (điểm 1) — nới ràng buộc, không dựng bảng mới
-- ════════════════════════════════════════════════════════════════════
alter table public.activities
  add column if not exists project_id uuid references public.projects(id) on delete cascade;

-- `on delete cascade` chứ không `set null`: một việc chỉ-thuộc-dự-án mà mất
-- project_id sẽ vi phạm chính `activities_need_link` bên dưới ⇒ lệnh xoá dự án
-- chết giữa chừng. Xoá dự án là xoá cả việc của nó — đó mới là ý người bấm.
create index if not exists activities_project_idx
  on public.activities (project_id) where project_id is not null;

-- Ràng buộc gốc (migration #4) chỉ cho phép việc gắn contact hoặc deal. Việc dự
-- án không có cả hai ⇒ NỚI, chứ KHÔNG bỏ: bỏ hẳn thì việc mồ côi (không gắn gì)
-- lại ghi được, và không màn nào hiện nó ra.
alter table public.activities drop constraint if exists activities_need_link;
alter table public.activities add constraint activities_need_link
  check (contact_id is not null or deal_id is not null or project_id is not null);

-- Quyết định 3 của thẻ: "Mỗi việc có ĐÚNG MỘT người chịu. Giao cho phòng kỹ
-- thuật là giao cho không ai." Cột đó ĐÃ CÓ và ĐÃ `not null` từ migration #4:
-- `activities.owner_id`. KHÔNG thêm cột `assignee` — thêm là dựng cách thứ hai
-- để nói cùng một chuyện, rồi hai màn hình đọc hai cột khác nhau.
comment on column public.activities.owner_id is
  'Thẻ man-du-an quyết định 3: ĐÚNG MỘT người chịu mỗi việc. not null từ migration #4 — đây là cột giao việc DUY NHẤT, không thêm cột assignee.';

-- Thẻ đếm "11/26 việc xong · 3 đang làm" ⇒ phải phân biệt được "đang làm" với
-- "chưa ai đụng". `activities` chỉ có `done_at`. Thêm MỘT cột mốc thay vì một
-- cột `status`: status là cách thứ hai để nói "đã xong", và nó sẽ lệch với
-- `done_at` ngay lần đầu ai đó quên cập nhật một trong hai.
--   chưa bắt đầu = started_at null
--   đang làm     = started_at not null và done_at null
--   xong         = done_at not null
alter table public.activities
  add column if not exists started_at timestamptz;
comment on column public.activities.started_at is
  'Mốc "bắt đầu làm". "Đang làm" = started_at not null và done_at null — KHÔNG dựng cột status riêng để khỏi lệch với done_at.';

-- ════════════════════════════════════════════════════════════════════
-- 3. VIỆC CHẶN VIỆC — MỘT TẦNG, cố ý
-- ════════════════════════════════════════════════════════════════════
-- Thẻ quyết định 5: "không phụ thuộc nhiều tầng". Chuỗi lồng nhau kéo theo dò
-- vòng, tính đường găng, và một màn hình không ai đọc nổi — đúng thứ "thêm tính
-- năng cho giống phần mềm lớn là cách nhanh nhất để không ai dùng".
create table if not exists public.task_blocks (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  blocker_id uuid not null references public.activities(id) on delete cascade,
  blocked_id uuid not null references public.activities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  -- Việc tự chặn chính nó là thứ không bao giờ gỡ được.
  constraint task_blocks_khong_tu_chan check (blocker_id <> blocked_id),
  -- Khai hai lần cùng một cặp làm số "chặn 6 việc" trên thẻ đếm sai.
  constraint task_blocks_khong_trung unique (blocker_id, blocked_id)
);
create index if not exists task_blocks_blocked_idx on public.task_blocks (blocked_id);
create index if not exists task_blocks_tenant_idx  on public.task_blocks (tenant_id);

-- MỘT TẦNG là ràng buộc CSDL, không phải lời nhắc trên màn hình: chỉ chặn ở
-- giao diện thì một lệnh gọi API là dựng được chuỗi A→B→C, và trigger "chặn bắt
-- đầu" bên dưới sẽ trả lời sai (nó chỉ nhìn một tầng).
create or replace function public.task_blocks_mot_tang()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_blocker uuid;
  v_tenant_blocked uuid;
begin
  -- Hai việc phải cùng tiệm với dòng chặn. RLS chỉ soi `tenant_id` của chính
  -- dòng này; không kiểm ở đây thì client gắn được id việc của tiệm khác.
  select tenant_id into v_tenant_blocker from public.activities where id = new.blocker_id;
  select tenant_id into v_tenant_blocked from public.activities where id = new.blocked_id;
  if v_tenant_blocker is distinct from new.tenant_id
     or v_tenant_blocked is distinct from new.tenant_id then
    raise exception 'task_block_cross_tenant';
  end if;

  -- Việc đang BỊ chặn thì không được đứng ra chặn việc khác…
  if exists (select 1 from public.task_blocks b
              where b.blocked_id = new.blocker_id and b.id <> new.id) then
    raise exception 'task_block_one_level';
  end if;
  -- …và việc đang CHẶN người khác thì không nhận thêm người chặn nó.
  if exists (select 1 from public.task_blocks b
              where b.blocker_id = new.blocked_id and b.id <> new.id) then
    raise exception 'task_block_one_level';
  end if;

  return new;
end;
$$;
drop trigger if exists task_blocks_mot_tang on public.task_blocks;
create trigger task_blocks_mot_tang before insert or update on public.task_blocks
  for each row execute function public.task_blocks_mot_tang();

comment on table public.task_blocks is
  'Thẻ man-du-an: "việc nào đang chặn và chặn bao nhiêu việc khác". MỘT TẦNG — trigger task_blocks_mot_tang từ chối chuỗi lồng (quyết định 5: không phụ thuộc nhiều tầng).';

-- ════════════════════════════════════════════════════════════════════
-- 4. CHẶN BẮT ĐẦU KHI VIỆC CHẶN NÓ CHƯA XONG
-- ════════════════════════════════════════════════════════════════════
-- Thẻ: "Nhập thiết bị đợt 1 — Chờ việc Ký hợp đồng xong mới bắt đầu được."
-- Đây là RÀNG BUỘC CSDL. Nút bị mờ trên màn hình chỉ ngăn người bấm nhầm; một
-- request thẳng vào API vẫn bắt đầu được, và lúc đó cả cơ chế chặn thành trang
-- trí.
create or replace function public.activities_chan_bat_dau()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Chỉ soi ĐÚNG lúc chuyển sang "đang làm". Việc đã bắt đầu rồi thì sửa tiêu
  -- đề, đổi hạn… vẫn phải làm được — nếu không, một việc chặn quay lại trạng
  -- thái chưa xong sẽ khoá cứng mọi thao tác trên việc đang dở.
  if new.started_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.started_at is not null then return new; end if;

  if exists (
    select 1
      from public.task_blocks tb
      join public.activities a on a.id = tb.blocker_id
     where tb.blocked_id = new.id
       and a.done_at is null
  ) then
    raise exception 'task_blocked';
  end if;

  return new;
end;
$$;
drop trigger if exists activities_chan_bat_dau on public.activities;
create trigger activities_chan_bat_dau before insert or update on public.activities
  for each row execute function public.activities_chan_bat_dau();

-- ════════════════════════════════════════════════════════════════════
-- 5. NGÀY XONG TỰ TÍNH + THÔNG BÁO KHI ĐẨY QUÁ 3 NGÀY
-- ════════════════════════════════════════════════════════════════════
-- Cả việc tính lẫn việc báo nằm trong MỘT trigger BEFORE trên `projects`. Đặt ở
-- đây (chứ không ở phía `activities`) vì như vậy mọi đường ghi vào `projects` —
-- kể cả client cố gõ tay `due_on` — đều đi qua đúng một chỗ quyết định.
--
-- ⚠️ MỘT LỖI ĐO ĐƯỢC LÚC KIỂM, ghi lại vì nó không hiển nhiên: bản đầu báo mỗi
-- khi `due_on` nhảy quá 3 ngày, BẤT KỂ vì sao. Chạy thử thì lúc lập kế hoạch —
-- thêm việc thứ hai có hạn muộn hơn việc thứ nhất — đã bắn thông báo, dù chưa
-- ai trễ gì cả. Lập một dự án 26 việc như thẻ mô tả sẽ đẻ ra hàng chục thông
-- báo rác, đúng thứ thẻ chặn ("Báo ít thì người ta còn đọc").
-- ⇒ Phải phân biệt NGUYÊN NHÂN: ngày đẩy vì MỘT VIỆC CÓ SẴN TRỄ HẠN (báo) khác
--   hẳn ngày đẩy vì DANH SÁCH VIỆC TO RA (im lặng, chỉ đặt lại mốc). Trigger
--   trên `projects` không tự biết nguyên nhân, nên phía `activities` truyền
--   sang bằng một biến phiên (`set_config(..., true)` = chỉ sống trong
--   transaction đó). Client không với tới biến này: PostgREST chỉ gọi được hàm
--   trong schema `public`, mà `set_config` nằm ở `pg_catalog`.
create or replace function public.projects_chot_ngay_xong()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_moc    date;
  v_do_tre boolean := coalesce(current_setting('ifan.du_an_viec_tre', true), '') = '1';
begin
  -- Ngày xong LUÔN tính lại từ việc thật, bất kể client gửi gì lên.
  select max(a.due_at)::date into new.due_on
    from public.activities a where a.project_id = new.id;

  if tg_op = 'INSERT' then
    new.due_on_baseline := new.due_on;
    return new;
  end if;

  v_moc := old.due_on_baseline;

  -- Kế hoạch to ra / nhỏ đi (thêm việc, xoá việc, chuyển việc sang dự án khác)
  -- KHÔNG phải "bị đẩy": ghi ngày mới, dời mốc, im lặng.
  if not v_do_tre then
    new.due_on_baseline := new.due_on;
    return new;
  end if;

  new.due_on_baseline := v_moc;

  -- Lần đầu dự án có ngày xong không phải là "bị đẩy" — đặt mốc, không báo.
  if v_moc is null then
    new.due_on_baseline := new.due_on;
    return new;
  end if;

  if new.due_on is not null and new.due_on > v_moc + 3 then
    new.due_on_baseline := new.due_on;   -- dời mốc: lần sau đo từ đây

    -- Thẻ nói đích danh "CHỦ TIỆM nhận thông báo" ⇒ chỉ vai owner. Không tự ý
    -- thêm admin/manager: báo cho nhiều người hơn thẻ yêu cầu là đi ngược quyết
    -- định "báo ít thì người ta còn đọc".
    insert into public.notifications (tenant_id, user_id, type, title, body, link)
    select new.tenant_id, tm.user_id, 'project_due_pushed',
           left('Dự án "' || new.name || '" lùi ngày xong', 200),
           'Ngày xong đẩy từ ' || to_char(v_moc, 'DD/MM')
             || ' sang ' || to_char(new.due_on, 'DD/MM')
             || ' vì việc trong dự án trễ hạn.',
           '/app/tasks?project=' || new.id::text
      from public.tenant_members tm
     where tm.tenant_id = new.tenant_id
       and tm.role = 'owner'
       and tm.status = 'active';
  end if;

  return new;
end;
$$;
drop trigger if exists projects_chot_ngay_xong on public.projects;
create trigger projects_chot_ngay_xong before insert or update on public.projects
  for each row execute function public.projects_chot_ngay_xong();

-- Việc đổi hạn / đổi dự án / bị xoá thì phải đánh thức dự án tính lại. Chỉ cần
-- "chạm" vào dòng dự án — mọi phép tính nằm ở trigger trên.
-- `security definer` vì người sửa việc thường là nhân viên, mà quyền GHI dự án
-- chỉ owner/admin/manager (mục 7). Không có definer thì nhân viên dời hạn xong
-- ngày khai trương đứng im — im lặng, đúng kiểu lỗi khó thấy nhất.
create or replace function public.activities_day_ngay_xong()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tre boolean := false;
begin
  -- NGUYÊN NHÂN, truyền sang trigger của `projects` (xem chú thích dài ở trên).
  -- Chỉ đúng một ca là "việc trễ": một việc CÓ SẴN, vẫn thuộc dự án cũ, bị dời
  -- hạn. Thêm việc / xoá việc / chuyển dự án đều là kế hoạch đổi, không phải trễ.
  -- Nhánh `if` riêng chứ không viết gộp vào một biểu thức: SQL không hứa
  -- short-circuit, mà đọc `new.*` trong trigger DELETE là lỗi runtime.
  if tg_op = 'UPDATE' then
    v_tre := (new.project_id is not distinct from old.project_id
              and new.due_at is distinct from old.due_at);
  end if;
  perform set_config('ifan.du_an_viec_tre', case when v_tre then '1' else '0' end, true);

  if tg_op <> 'INSERT' and old.project_id is not null then
    update public.projects set updated_at = now() where id = old.project_id;
  end if;
  if tg_op <> 'DELETE' and new.project_id is not null
     and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id) then
    update public.projects set updated_at = now() where id = new.project_id;
  end if;

  -- Trả cờ về 0 ngay: một câu UPDATE khác trong cùng transaction, đi thẳng vào
  -- `projects`, không được thừa hưởng cờ của câu này.
  perform set_config('ifan.du_an_viec_tre', '0', true);
  return null;
end;
$$;
drop trigger if exists activities_day_ngay_xong on public.activities;
create trigger activities_day_ngay_xong
  after insert or update or delete on public.activities
  for each row execute function public.activities_day_ngay_xong();

-- ════════════════════════════════════════════════════════════════════
-- 6. CHI PHÍ DỰ ÁN = NHÃN TRÊN PHIẾU CHI THẬT (điểm 2)
-- ════════════════════════════════════════════════════════════════════
alter table public.cash_entries
  add column if not exists project_id uuid references public.projects(id) on delete set null;
-- `set null` chứ KHÔNG cascade: xoá dự án không được phép làm bốc hơi một phiếu
-- chi 60 triệu trong sổ quỹ. Mất nhãn thì tệ; mất tiền trong sổ thì không sửa
-- được.
create index if not exists cash_entries_project_idx
  on public.cash_entries (project_id) where project_id is not null;
comment on column public.cash_entries.project_id is
  'Thẻ man-du-an quyết định 4 (luật D1): chi phí dự án KHÔNG có bảng riêng — mỗi khoản là một phiếu chi thật trong sổ quỹ, gắn nhãn dự án.';

-- ════════════════════════════════════════════════════════════════════
-- 7. QUYỀN
-- ════════════════════════════════════════════════════════════════════
-- ⚠️ THẺ KHÔNG NÓI GÌ VỀ VAI cho mảng dự án. Đây là MẶC ĐỊNH TỰ CHỌN, ghi rõ ra
-- để người sau biết là chọn chứ không phải trích:
--   · ĐỌC = mọi thành viên tiệm. Thẻ đòi việc dự án hiện chung với việc hằng
--     ngày của nhân viên; không đọc được dự án thì màn đó không hiện tên dự án,
--     không hiện "chặn bao nhiêu việc" — hỏng đúng quyết định 3.
--   · TẠO/SỬA dự án = owner/admin/manager, cùng nhóm đã được tin với ngân sách
--     và sổ quỹ ở khắp kho (item_costs, cash_entries, purchases). Dự án mang
--     `budget_vnd` nên nó thuộc nhóm đó.
-- Nếu founder muốn khác (ví dụ nhân viên tự mở dự án), đó là một quyết định
-- riêng, không phải thứ sửa lén trong migration sau.
alter table public.projects    enable row level security;
alter table public.task_blocks enable row level security;

drop policy if exists projects_select    on public.projects;
drop policy if exists projects_manage    on public.projects;
drop policy if exists task_blocks_select on public.task_blocks;
drop policy if exists task_blocks_manage on public.task_blocks;

create policy projects_select on public.projects for select
  using (tenant_id = (select public.current_tenant_id()));
create policy projects_manage on public.projects for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));

-- Sơ đồ chặn phải đọc được bởi người làm việc bị chặn — nếu không, họ chỉ thấy
-- "không bắt đầu được" mà không biết vì sao.
create policy task_blocks_select on public.task_blocks for select
  using (tenant_id = (select public.current_tenant_id()));
-- Khai "việc nào chặn việc nào" là hành vi lập kế hoạch, cùng nhóm với sửa dự án.
create policy task_blocks_manage on public.task_blocks for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));

revoke all on public.projects    from anon;
revoke all on public.task_blocks from anon;

comment on table public.projects is
  'Thẻ man-du-an (V8, mảng projects). Việc dự án KHÔNG có bảng riêng — dùng lại activities.project_id (luật D1). Chi phí dự án KHÔNG có bảng riêng — cash_entries.project_id.';
