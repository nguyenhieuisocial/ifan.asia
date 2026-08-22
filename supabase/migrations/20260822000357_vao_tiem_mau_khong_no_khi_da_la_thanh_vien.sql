-- ═══════════════════════════════════════════════════════════════════
-- "XEM THỬ TIỆM MẪU" NỔ KHI NGƯỜI DÙNG ĐÃ LÀ THÀNH VIÊN TIỆM MẪU ĐÓ
-- ═══════════════════════════════════════════════════════════════════
--
-- Đo 22/08 trên bản đang chạy: đăng nhập bằng tài khoản chủ các tiệm mẫu →
-- menu → "Xem thử tiệm mẫu" → "Quán ăn / Cafe" → quay về `/app/today?error=
-- workspaceFailed`, tiệm KHÔNG đổi, và màn KHÔNG hiện lời giải thích nào.
-- Người dùng bấm, không có gì xảy ra, không biết vì sao.
--
-- ⚠️ NGUYÊN NHÂN nằm ở hai dòng đứng cạnh nhau trong `enter_sample_tenant`:
--     delete … where tm.role = 'viewer';      -- chỉ dọn phiên THAM QUAN
--     insert into tenant_members … 'viewer';  -- rồi chèn không điều kiện
--   Ai đã là thành viên tiệm mẫu đó với vai KHÁC `viewer` (chủ, quản lý) thì
--   câu `delete` bỏ qua họ, câu `insert` đụng khoá duy nhất (tenant_id,
--   user_id) và ném lỗi. Hàm chết ⇒ `workspaceFailed`.
--
-- ⚠️ ĐIỀU KIỆN `role = 'viewer'` Ở CÂU DELETE LÀ ĐÚNG, KHÔNG ĐƯỢC BỎ. Chú
--   thích ngay trên nó đã ghi: thiếu điều kiện ấy thì hàm xoá NHẦM quyền chủ
--   thật của người dùng nếu tiệm họ làm chủ cũng mang cờ `is_sample`. Sửa
--   đúng chỗ là ở câu INSERT, không phải nới câu DELETE.
--
-- ⚠️ VÀ TUYỆT ĐỐI KHÔNG HẠ VAI. Nếu người đó đang là CHỦ tiệm mẫu ấy, "xem
--   thử" phải mở tiệm ra với đúng vai chủ — không được biến chủ thành người
--   xem. Vì vậy dùng `on conflict do nothing` chứ không `do update`.

create or replace function public.enter_sample_tenant(p_industry text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select id into v_tenant from public.tenants where industry = p_industry and is_sample = true;
  if v_tenant is null then raise exception 'no_sample_tenant'; end if;

  -- Đổi tour: rời tiệm mẫu cũ (nếu có) trước khi vào tiệm mẫu mới — luôn đúng
  -- 1 tour đang mở cho mỗi người, không lẫn dữ liệu 2 tiệm mẫu.
  -- CHỈ dọn phiên tham quan (role='viewer') — khớp đúng exit_sample_tenant().
  -- Thiếu điều kiện role trước đây khiến hàm xoá NHẦM quyền chủ thật của
  -- người dùng nếu tiệm họ làm chủ cũng mang cờ is_sample=true.
  --
  -- ⚠️ Không dọn chính tiệm sắp vào, nếu không thì người đang là CHỦ tiệm ấy
  --   bị xoá vai rồi chèn lại thành người xem.
  delete from public.tenant_members tm
    using public.tenants t
    where tm.tenant_id = t.id and tm.user_id = v_uid and t.is_sample = true
      and tm.role = 'viewer' and tm.tenant_id <> v_tenant;

  -- Đã là thành viên tiệm này rồi (chủ, quản lý, hoặc đang tham quan dở) thì
  -- GIỮ NGUYÊN VAI, chỉ mở tiệm ra. Trước bản này câu insert không điều kiện
  -- nên nó đụng khoá duy nhất và làm chết cả hàm.
  insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
    values (v_tenant, v_uid, 'viewer', 'active', now())
    on conflict (tenant_id, user_id) do nothing;

  update public.profiles set active_tenant_id = v_tenant, updated_at = now()
    where user_id = v_uid;

  return v_tenant;
end;
$$;

comment on function public.enter_sample_tenant(text) is
  'Mở một tiệm mẫu để tham quan. Giữ nguyên vai nếu đã là thành viên — trước #357 câu insert không điều kiện làm hàm nổ với chủ tiệm mẫu (workspaceFailed, không lời giải thích).';
