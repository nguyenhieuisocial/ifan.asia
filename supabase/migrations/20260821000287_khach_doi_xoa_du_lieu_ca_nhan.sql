-- #287 — KHÁCH ĐÒI XOÁ DỮ LIỆU CÁ NHÂN (Nghị định 13). Nền + đường xoá thật.
--
-- ════════════════════════════════════════════════════════════════════
-- CÁCH LÀM ĐÃ ĐƯỢC CHỐT TỪ TRƯỚC, KHÔNG PHẢI NGHĨ MỚI Ở ĐÂY
-- ════════════════════════════════════════════════════════════════════
--
-- Thẻ `design-system/man-xuat-du-lieu-pdpl.html` đã vẽ xong và tự dán nhãn
-- "CHƯA CÓ CODE". Nó chốt sẵn nguyên tắc, gọi tên là **XOÁ NGƯỜI, GIỮ SỐ**:
--
--   XOÁ   tên · số điện thoại · email · địa chỉ · ngày sinh · giới tính
--         ảnh trước–sau · ghi chú tư vấn · TOÀN BỘ nội dung hội thoại
--   GIỮ   đơn hàng · số tiền · ngày · thuế — nhưng tên người mua đổi thành
--         "Khách đã xoá #1284"
--
-- Lý do giữ, chép nguyên văn từ thẻ: *"Xoá luôn đơn hàng là sổ sách thủng lỗ,
-- doanh thu năm ngoái tự giảm — vừa sai luật kế toán vừa hỏng báo cáo."*
--
-- Hạn xử lý **30 ngày** cũng nằm sẵn trên thẻ (nó vẽ "nhận 16/08 · còn 26
-- ngày"). Một sổ việc trước đây ghi hai điều này là "chờ founder quyết" — ghi
-- SAI, quyết định đã có; đã đính chính.
--
-- ════════════════════════════════════════════════════════════════════
-- ĐÂY LÀ ĐƯỜNG XOÁ KHÔNG HOÀN TÁC ĐƯỢC — bốn chốt tương xứng
-- ════════════════════════════════════════════════════════════════════
--
-- (1) HAI BƯỚC, KHÔNG MỘT BƯỚC. Ghi nhận yêu cầu là một việc; thi hành là
--     việc khác, phải có người bấm lần thứ hai. Một nút "xoá sạch khách này"
--     bấm nhầm một lần là mất vĩnh viễn.
--
-- (2) CHỤP LẠI SỐ TRƯỚC KHI XOÁ. Yêu cầu giữ lại một bản tóm tắt *không có
--     thông tin cá nhân* (xoá bao nhiêu tin nhắn, bao nhiêu ghi chú, giữ lại
--     bao nhiêu đơn). Không có nó thì sau này không chứng minh được đã làm gì
--     — mà chứng minh được chính là thứ Nghị định 13 đòi.
--
-- (3) CHỈ CHỦ TIỆM VÀ QUẢN TRỊ VIÊN. Không phải vì quản lý kém tin cậy hơn,
--     mà vì việc này không thể sửa sai.
--
-- (4) TỪ CHỐI ĐƯỢC, VÀ PHẢI GHI LÝ DO. Có yêu cầu không hợp lệ (đòi xoá dữ
--     liệu của người khác chẳng hạn). Từ chối im lặng thì đúng bằng không trả
--     lời.
--
-- Cột đồng ý nhận tin (`marketing_consent`, `marketing_consent_at`,
-- `marketing_consent_withdrawn_at`) ĐÃ CÓ SẴN trên `contacts` — không dựng
-- lại, chỉ nhớ tắt nó khi xoá.

create table if not exists public.data_erasure_requests (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  requested_at  timestamptz not null default now(),
  -- Hạn 30 ngày theo thẻ. Tính lúc ghi nhận và ĐÓNG BĂNG: hạn mà tự trôi theo
  -- ngày đọc thì không bao giờ quá hạn, và cái đếm ngược thành đồ trang trí.
  deadline_at   timestamptz not null default (now() + interval '30 days'),
  status        text not null default 'pending',
  note          text,
  reject_reason text,
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  -- Tóm tắt SAU KHI xoá, cố ý không chứa một mẩu thông tin cá nhân nào.
  summary       jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint data_erasure_status_hop_le check (status in ('pending', 'done', 'rejected'))
);

create index if not exists data_erasure_theo_tiem
  on public.data_erasure_requests (tenant_id, status, deadline_at);

-- Một khách chỉ có MỘT yêu cầu đang chờ. Hai yêu cầu song song nghĩa là hai
-- người cùng bấm thi hành, và cái thứ hai chạy trên dữ liệu đã bị xoá.
create unique index if not exists data_erasure_mot_yeu_cau_cho
  on public.data_erasure_requests (tenant_id, contact_id) where status = 'pending';

alter table public.data_erasure_requests enable row level security;

-- Đọc: người trong tiệm đọc được yêu cầu của tiệm mình (để biết còn hạn bao
-- lâu). Ghi/sửa: KHÔNG qua bảng — chỉ qua ba hàm bên dưới, để mọi lượt đều đi
-- qua chốt vai và đều ghi sổ.
drop policy if exists data_erasure_select on public.data_erasure_requests;
create policy data_erasure_select on public.data_erasure_requests
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

comment on table public.data_erasure_requests is
  'Yêu cầu xoá dữ liệu cá nhân của khách (Nghị định 13). Hạn 30 ngày, đóng băng '
  'lúc ghi nhận. Chỉ ghi qua hàm — xem #287.';

-- ── Ghi nhận một yêu cầu ───────────────────────────────────────────────────
create or replace function public.erasure_request_create(p_contact uuid, p_note text default null)
returns uuid
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_id     uuid;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'forbidden'; end if;

  if not exists (select 1 from public.contacts
                  where id = p_contact and tenant_id = v_tenant and deleted_at is null) then
    raise exception 'contact_not_found';
  end if;

  insert into public.data_erasure_requests (tenant_id, contact_id, note, created_by)
  values (v_tenant, p_contact, nullif(btrim(p_note), ''), auth.uid())
  returning id into v_id;

  perform public.record_audit_log('data_erasure', v_id, 'created',
    jsonb_build_object('contact_id', p_contact));
  return v_id;
end;
$$;

-- ── Từ chối, kèm lý do ─────────────────────────────────────────────────────
create or replace function public.erasure_request_reject(p_id uuid, p_reason text)
returns void
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  if v_role not in ('owner', 'admin') then raise exception 'forbidden'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  update public.data_erasure_requests
     set status = 'rejected', reject_reason = btrim(p_reason),
         decided_by = auth.uid(), decided_at = now()
   where id = p_id and tenant_id = v_tenant and status = 'pending';

  if not found then raise exception 'request_not_pending'; end if;

  perform public.record_audit_log('data_erasure', p_id, 'rejected',
    jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

-- ── THI HÀNH: xoá người, giữ số ────────────────────────────────────────────
create or replace function public.erasure_request_apply(p_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_tenant   uuid := (select public.current_tenant_id());
  v_role     text := (select public.app_role());
  v_req      record;
  v_nhan     text;
  v_so_tin   integer := 0;
  v_so_ghi   integer := 0;
  v_so_dinh  integer := 0;
  v_so_danh  integer := 0;
  v_giu_don  integer := 0;
  v_giu_hen  integer := 0;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- CHỐT (3): việc này không sửa sai được, nên hẹp hơn quy ước thường.
  if v_role not in ('owner', 'admin') then raise exception 'forbidden'; end if;

  select * into v_req from public.data_erasure_requests
   where id = p_id and tenant_id = v_tenant and status = 'pending'
   for update;
  if v_req.id is null then raise exception 'request_not_pending'; end if;

  -- Nhãn thay tên: lấy bốn ký tự cuối mã khách để hai người bị xoá không thành
  -- cùng một cái tên trên sổ. KHÔNG dùng số thứ tự đếm lên — nó tự nó là một
  -- mẩu thông tin (ai bị xoá trước, ai sau).
  v_nhan := 'Khách đã xoá #' || upper(right(v_req.contact_id::text, 4));

  -- Đếm phần GIỮ LẠI trước, để tóm tắt nói được cả hai vế.
  select count(*) into v_giu_don from public.orders
   where tenant_id = v_tenant and contact_id = v_req.contact_id;
  select count(*) into v_giu_hen from public.appointments
   where tenant_id = v_tenant and contact_id = v_req.contact_id;

  -- (a) Nội dung hội thoại — thẻ nói TOÀN BỘ, không phải chỉ gỡ liên kết.
  with da as (
    update public.messages m
       set content = '', attachments = '[]'::jsonb
     where m.tenant_id = v_tenant
       and m.conversation_id in (select id from public.conversations
                                  where tenant_id = v_tenant and contact_id = v_req.contact_id)
       and (coalesce(m.content, '') <> '' or coalesce(m.attachments, '[]'::jsonb) <> '[]'::jsonb)
    returning 1)
  select count(*) into v_so_tin from da;

  -- (b) Ghi chú tư vấn.
  with da as (
    update public.activities
       set subject = v_nhan, body = null, outcome = null
     where tenant_id = v_tenant and contact_id = v_req.contact_id
    returning 1)
  select count(*) into v_so_ghi from da;

  -- (c) Ảnh trước–sau và mọi tệp gắn với khách này.
  with da as (
    update public.attachments
       set deleted_at = now()
     where tenant_id = v_tenant and entity_type = 'contact'
       and entity_id = v_req.contact_id and deleted_at is null
    returning 1)
  select count(*) into v_so_dinh from da;

  -- (d) Danh tính kênh chat (số Zalo, tên hiển thị, ảnh đại diện).
  with da as (
    delete from public.contact_identities
     where tenant_id = v_tenant and contact_id = v_req.contact_id
    returning 1)
  select count(*) into v_so_danh from da;

  -- (e) Chính hồ sơ khách: giữ DÒNG (để đơn hàng còn chỗ trỏ về) nhưng không
  --     còn một mẩu thông tin cá nhân nào. Tắt luôn đồng ý nhận tin — xoá rồi
  --     mà vẫn gửi khuyến mãi là vi phạm lần thứ hai.
  update public.contacts
     set full_name = v_nhan,
         phone = null, phone_e164 = null, email = null,
         address = null, province = null, dob = null, gender = null,
         custom = '{}'::jsonb,
         marketing_consent = false,
         marketing_consent_withdrawn_at = now()
   where id = v_req.contact_id and tenant_id = v_tenant;

  update public.data_erasure_requests
     set status = 'done', decided_by = auth.uid(), decided_at = now(),
         summary = jsonb_build_object(
           'xoa_tin_nhan', v_so_tin, 'xoa_ghi_chu', v_so_ghi,
           'xoa_tep', v_so_dinh, 'xoa_danh_tinh_kenh', v_so_danh,
           'giu_don_hang', v_giu_don, 'giu_lich_hen', v_giu_hen,
           'nhan_thay_the', v_nhan)
   where id = p_id;

  perform public.record_audit_log('data_erasure', p_id, 'ended',
    jsonb_build_object('xoa_tin_nhan', v_so_tin, 'xoa_ghi_chu', v_so_ghi,
                       'giu_don_hang', v_giu_don, 'nhan_thay_the', v_nhan));

  return jsonb_build_object(
    'nhan', v_nhan,
    'xoa_tin_nhan', v_so_tin, 'xoa_ghi_chu', v_so_ghi,
    'xoa_tep', v_so_dinh, 'xoa_danh_tinh_kenh', v_so_danh,
    'giu_don_hang', v_giu_don, 'giu_lich_hen', v_giu_hen);
end;
$$;

revoke all on function public.erasure_request_create(uuid, text) from public, anon;
revoke all on function public.erasure_request_reject(uuid, text) from public, anon;
revoke all on function public.erasure_request_apply(uuid) from public, anon;
grant execute on function public.erasure_request_create(uuid, text) to authenticated;
grant execute on function public.erasure_request_reject(uuid, text) to authenticated;
grant execute on function public.erasure_request_apply(uuid) to authenticated;

comment on function public.erasure_request_apply(uuid) is
  'THI HÀNH xoá dữ liệu cá nhân: xoá người, GIỮ số (đơn hàng, tiền, ngày). '
  'Không hoàn tác được — chỉ owner/admin, và phải có yêu cầu đang chờ. Xem #287.';
