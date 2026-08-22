-- ═══════════════════════════════════════════════════════════════════
-- TÀI SẢN & THIẾT BỊ — đợt 1 (thẻ thiết kế `man-tai-san`)
-- ═══════════════════════════════════════════════════════════════════
--
-- Khối 12 trong bản đồ COS: 0 bảng, 0 màn. Spa có 6 giường và 3 máy xông,
-- quán có máy pha và tủ mát — ai đang giữ, bảo hành tới bao giờ, tháng trước
-- sửa hết bao nhiêu. Hôm nay iFan không trả lời được câu nào.
--
-- ═══════════════════════════════════════════════════════════════════
-- ĐIỀU HỌC ĐƯỢC ĐẮT NHẤT, VÀ NÓ ĐỊNH HÌNH CẢ LƯỢC ĐỒ NÀY
-- ═══════════════════════════════════════════════════════════════════
-- **"Đã giao" KHÔNG PHẢI một trạng thái ngang hàng với "Hỏng".**
--
-- Đọc mã nguồn Snipe-IT (mã nguồn mở, mảng này mạnh nhất) mới thấy: họ tách
-- HAI TRỤC — `tinh_trang` (vật lý: dùng được · đang sửa · hỏng · đã thanh lý)
-- × `đang giao cho ai` (suy từ bản ghi bàn giao còn mở). Nhét cả hai vào một
-- danh sách thì một cái giường *đang giao cho phòng 2 nhưng vừa gãy chân* chỉ
-- mang được MỘT nhãn — và ta mất đúng thông tin cần nhất.
--
-- ⇒ Bảng này KHÔNG có giá trị trạng thái nào tên là "đang dùng"/"đã giao".
--   Chỗ giao suy ra từ `asset_assignments` còn mở, y như bàn ăn suy ra từ đơn
--   còn mở (#356). Hai chỗ cùng nhớ một sự thật thì sớm muộn cũng lệch nhau.
--
-- ⚠️ VÌ SAO KHÔNG NHÉT VÀO `resources`. Bảng đó đang giữ 45 dòng (bàn, phòng,
--   giường, máy) và trả lời câu "đặt lịch được cái gì" — nó đang nuôi Lịch hẹn
--   VÀ màn Bán tại quầy vừa dựng hôm nay. `assets` trả lời câu khác hẳn: "tiệm
--   sở hữu cái gì, ai giữ, hỏng chưa, bảo hành tới bao giờ". Chồng lấn đúng 6
--   cái máy là chấp nhận được, hơn là một bảng phải chiều hai việc.

create table if not exists public.assets (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Mã dán lên máy. Tiệm tự đặt hoặc để trống; DUY NHẤT trong tiệm khi có.
  ma text,
  ten text not null,
  -- Loại do TIỆM TỰ ĐẶT ("Máy móc", "Nội thất", "Thiết bị điện"). CỐ Ý không
  -- dùng phân loại TSCĐ/CCDC theo chuẩn kế toán: đó là phân loại THUẾ, không
  -- phải phân loại vận hành, và tiệm nhỏ thuê kế toán ngoài lo phần đó.
  loai text,
  vi_tri text,
  ngay_mua date,
  gia_mua_vnd bigint check (gia_mua_vnd is null or gia_mua_vnd >= 0),
  bao_hanh_den date,
  -- Đường dẫn ảnh trong kho `tenant-files` (kho đã chạy sẵn cho ảnh chứng từ
  -- phiếu chi, kèm phép chặn đường dẫn leo thư mục — #352/#353).
  anh text,
  ghi_chu text check (ghi_chu is null or char_length(ghi_chu) <= 500),
  /**
   * TÌNH TRẠNG VẬT LÝ — trục thứ nhất. Bộ ĐÓNG bốn giá trị.
   * ⚠️ Không có "đang dùng" ở đây. Xem chú thích đầu file.
   */
  tinh_trang text not null default 'dung_duoc'
    check (tinh_trang in ('dung_duoc', 'dang_sua', 'hong', 'da_thanh_ly')),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists assets_ma_duy_nhat_trong_tiem
  on public.assets (tenant_id, ma)
  where ma is not null and deleted_at is null;

create index if not exists assets_theo_tiem on public.assets (tenant_id) where deleted_at is null;
-- Nuôi khối "sắp hết bảo hành" ở đầu màn.
create index if not exists assets_bao_hanh on public.assets (tenant_id, bao_hanh_den)
  where bao_hanh_den is not null and deleted_at is null;

comment on table public.assets is
  'Tài sản/thiết bị tiệm sở hữu. KHÔNG lưu "đang giao cho ai" — suy từ asset_assignments còn mở (#358).';

-- ── BÀN GIAO ────────────────────────────────────────────────────────
--
-- ⚠️ PHẢI CÓ NGƯỜI BẤM XÁC NHẬN ĐÃ NHẬN. Đây là ranh giới giữa "quản lý tài
--   sản" và "một bảng Excel đẹp" — học từ MISA: biên bản chưa được nhân viên
--   xác nhận thì mọi nghiệp vụ sau bị chặn. Không có bước này thì lúc mất đồ
--   không ai chịu trách nhiệm.
create table if not exists public.asset_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  -- Giao cho MỘT NGƯỜI hoặc cho MỘT CHỖ (bộ phận/phòng). Đúng một trong hai.
  employee_id uuid references public.employees(id) on delete set null,
  bo_phan text,
  giao_luc timestamptz not null default now(),
  giao_boi uuid references auth.users(id) on delete set null,
  -- NULL = người nhận CHƯA xác nhận.
  xac_nhan_luc timestamptz,
  -- NULL = còn đang giữ. Có giá trị = đã thu hồi.
  thu_hoi_luc timestamptz,
  thu_hoi_boi uuid references auth.users(id) on delete set null,
  ghi_chu text check (ghi_chu is null or char_length(ghi_chu) <= 500),
  created_at timestamptz not null default now(),
  constraint asset_assignments_giao_cho_ai
    check (num_nonnulls(employee_id, bo_phan) = 1)
);

-- ⚠️ MỘT TÀI SẢN CHỈ ĐƯỢC MỘT LƯỢT GIAO ĐANG MỞ. Ép ở CSDL, không ép ở màn —
--   cùng lớp bệnh với "một bàn một đơn đang mở" (#356). Hai người cùng bấm
--   giao trên hai máy thì lượt thứ hai phải bị chặn, nếu không sổ bàn giao
--   nói cái máy đang ở hai chỗ.
create unique index if not exists asset_mot_luot_giao_dang_mo
  on public.asset_assignments (asset_id)
  where thu_hoi_luc is null;

create index if not exists asset_assignments_theo_ts
  on public.asset_assignments (asset_id, giao_luc desc);

comment on table public.asset_assignments is
  'Sổ bàn giao tài sản. `xac_nhan_luc` NULL = người nhận chưa xác nhận; `thu_hoi_luc` NULL = còn đang giữ (#358).';

-- ── RLS ─────────────────────────────────────────────────────────────
-- Khuôn giống `resources`: mọi vai trong tiệm ĐỌC được (nhân viên cần biết
-- mình đang giữ gì), nhưng chỉ owner/admin/manager mới SỬA.
alter table public.assets enable row level security;
alter table public.asset_assignments enable row level security;

drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets for select
  using (tenant_id = (select public.current_tenant_id()));

drop policy if exists assets_manage on public.assets;
create policy assets_manage on public.assets for all
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

drop policy if exists asset_assignments_select on public.asset_assignments;
create policy asset_assignments_select on public.asset_assignments for select
  using (tenant_id = (select public.current_tenant_id()));

/**
 * ⚠️ NGƯỜI NHẬN PHẢI TỰ XÁC NHẬN ĐƯỢC — nếu không thì "xác nhận" chỉ là quản
 *   lý tự tick hộ, và cả cơ chế mất nghĩa. Nhưng họ CHỈ được sửa đúng dòng
 *   giao cho chính mình, và chỉ đặt được `xac_nhan_luc`.
 *
 * Phần còn lại (tạo lượt giao, thu hồi) vẫn là việc của quản lý trở lên.
 */
drop policy if exists asset_assignments_manage on public.asset_assignments;
create policy asset_assignments_manage on public.asset_assignments for all
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

drop policy if exists asset_assignments_tu_xac_nhan on public.asset_assignments;
create policy asset_assignments_tu_xac_nhan on public.asset_assignments for update
  using (
    tenant_id = (select public.current_tenant_id())
    and employee_id in (
      select e.id from public.employees e
      where e.tenant_id = (select public.current_tenant_id()) and e.user_id = auth.uid()
    )
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and employee_id in (
      select e.id from public.employees e
      where e.tenant_id = (select public.current_tenant_id()) and e.user_id = auth.uid()
    )
  );

-- ── CHỐT CHÉO TIỆM ──────────────────────────────────────────────────
--
-- ⚠️ MỌI CỘT KHOÁ NGOẠI TRÊN BẢNG CÓ `tenant_id` ĐỀU PHẢI CÓ CHỐT NÀY. RLS chỉ
--   kiểm `tenant_id` của chính dòng đang ghi, KHÔNG nhìn sang bảng cha — nên
--   tiệm A ghi được một lượt bàn giao `tenant_id = A` trỏ vào tài sản hoặc
--   nhân viên của tiệm B, và RLS cho qua. Chép khuôn #205/#355/#356.
create or replace function public.asset_assignments_tenant_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.assets where id = new.asset_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'asset_assignments.asset_id phải cùng tiệm với lượt bàn giao (tài sản % thuộc tiệm khác)',
      new.asset_id using errcode = '23514';
  end if;

  if new.employee_id is not null then
    select tenant_id into v_tenant from public.employees where id = new.employee_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'asset_assignments.employee_id phải cùng tiệm với lượt bàn giao (nhân viên % thuộc tiệm khác)',
        new.employee_id using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists asset_assignments_tenant_guard on public.asset_assignments;
create trigger asset_assignments_tenant_guard
  before insert or update of tenant_id, asset_id, employee_id on public.asset_assignments
  for each row execute function public.asset_assignments_tenant_guard();

comment on function public.asset_assignments_tenant_guard() is
  'Chặn lượt bàn giao trỏ sang tài sản hoặc nhân viên của tiệm khác. RLS không thấy đường này (#358).';

-- ── GIỮ `updated_at` ĐÚNG ───────────────────────────────────────────
create or replace function public.assets_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists assets_touch_updated_at on public.assets;
create trigger assets_touch_updated_at
  before update on public.assets
  for each row execute function public.assets_touch_updated_at();
