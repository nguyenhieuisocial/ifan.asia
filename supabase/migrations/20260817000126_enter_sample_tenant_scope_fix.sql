-- ============================================================
-- iFan.asia — Migration #126: enter_sample_tenant() xoá NHẦM quyền chủ tiệm
-- thay vì chỉ dọn phiên tham quan cũ.
--
-- BẮT ĐƯỢC LÚC NÀO — không phải do ai báo: chạy `scripts/rls-smoke.mjs` sau
-- migration #125 (di trú services→items) để nghiệm thu, script crash giữa
-- chừng với lỗi CSDL thật `last_owner_cannot_be_removed`. Truy ngược mới thấy
-- đây là lỗi CÓ SẴN, không liên quan gì tới #125 — chỉ tình cờ lộ ra vì
-- rls-smoke chạy hết được xa hơn sau khi migration #66 sửa fixture tiệm
-- smoke thành is_sample=true (đợt vá "chuông báo giả" trước đó).
--
-- ══ LỖI ══
-- enter_sample_tenant() (migration #66) dọn "phiên tham quan cũ" bằng:
--     delete from tenant_members tm using tenants t
--       where tm.tenant_id=t.id and tm.user_id=v_uid and t.is_sample=true;
-- Câu này xoá MỌI dòng thành viên của người dùng ở MỌI tiệm is_sample=true —
-- không lọc theo vai trò. Nhưng phiên tham quan LUÔN được tạo với
-- role='viewer' (đúng 2 dòng ngay dưới INSERT). Hàm chị em exit_sample_tenant()
-- (cùng migration #66) đã lọc ĐÚNG `and tm.role = 'viewer'` — enter_sample_tenant()
-- thiếu đúng một mệnh đề đó.
--
-- HẬU QUẢ THẬT (không chỉ là lỗi test): nếu MỘT người vừa là CHỦ của một tiệm
-- is_sample=true (tiệm demo do chính họ dựng để thử, hoặc tiệm cờ nhầm),
-- vừa bấm "tham quan tiệm mẫu" ngành khác — enter_sample_tenant() sẽ XOÁ LUÔN
-- quyền chủ tiệm thật của họ, vì dòng đó cũng nằm trong tập "is_sample=true".
-- Trigger tenant_members_owner_guard (migration #2) chỉ chặn được khi họ là
-- CHỦ DUY NHẤT — nếu có đồng chủ thì mất quyền trong im lặng, không ai báo.
--
-- ══ VÁ ══
-- Thêm ĐÚNG mệnh đề exit_sample_tenant() đã có: chỉ dọn dòng role='viewer'.
-- ============================================================

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
  delete from public.tenant_members tm
    using public.tenants t
    where tm.tenant_id = t.id and tm.user_id = v_uid and t.is_sample = true
      and tm.role = 'viewer';

  insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
    values (v_tenant, v_uid, 'viewer', 'active', now());

  update public.profiles set active_tenant_id = v_tenant, updated_at = now()
    where user_id = v_uid;

  return v_tenant;
end;
$$;

comment on function public.enter_sample_tenant(text) is
  'ADR-0005 (migration #64, sửa #66, vá #126). Dọn phiên tham quan CŨ chỉ ở role=''viewer'' — không được đụng vào dòng owner/admin/manager/staff thật, kể cả khi tiệm đó mang cờ is_sample=true.';
