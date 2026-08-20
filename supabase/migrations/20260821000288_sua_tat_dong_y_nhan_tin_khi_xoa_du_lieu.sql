-- #288 — Sửa một chỗ ĐOÁN SAI trong #287: cột đồng ý nhận tin là CHỮ, không
-- phải đúng/sai.
--
-- `contacts.marketing_consent` nhận đúng ba giá trị `unknown` · `granted` ·
-- `withdrawn` (có ràng buộc kiểm ở CSDL). Bản #287 ghi `false` vào đó vì tôi
-- nhìn cái tên cột rồi **đoán** là đúng/sai thay vì đo. Ràng buộc bắt được
-- ngay khi chạy thử — nhưng nó chỉ bắt được vì có người chạy thử.
--
-- Ghi lại nguyên văn thay vì lặng lẽ sửa: chỗ này nằm giữa đường XOÁ KHÔNG
-- HOÀN TÁC. Nếu cột kia không có ràng buộc kiểm, lệnh sẽ trôi qua và mỗi lần
-- xoá dữ liệu sẽ ném một giá trị rác vào cột quyết định "được phép gửi tin
-- quảng cáo cho ai" — tức là lỗi rơi đúng vào chỗ Nghị định 13 phạt.
--
-- Bài học đúng bằng một câu: **đọc lược đồ trước khi ghi vào nó**, kể cả khi
-- tên cột nghe như đã tự giải thích.

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
  -- Việc này không sửa sai được, nên hẹp hơn quy ước thường.
  if v_role not in ('owner', 'admin') then raise exception 'forbidden'; end if;

  select * into v_req from public.data_erasure_requests
   where id = p_id and tenant_id = v_tenant and status = 'pending'
   for update;
  if v_req.id is null then raise exception 'request_not_pending'; end if;

  -- Nhãn thay tên: bốn ký tự cuối mã khách, để hai người bị xoá không thành
  -- cùng một cái tên. KHÔNG dùng số thứ tự đếm lên — nó tự nó là một mẩu
  -- thông tin (ai bị xoá trước, ai sau).
  v_nhan := 'Khách đã xoá #' || upper(right(v_req.contact_id::text, 4));

  select count(*) into v_giu_don from public.orders
   where tenant_id = v_tenant and contact_id = v_req.contact_id;
  select count(*) into v_giu_hen from public.appointments
   where tenant_id = v_tenant and contact_id = v_req.contact_id;

  with da as (
    update public.messages m
       set content = '', attachments = '[]'::jsonb
     where m.tenant_id = v_tenant
       and m.conversation_id in (select id from public.conversations
                                  where tenant_id = v_tenant and contact_id = v_req.contact_id)
       and (coalesce(m.content, '') <> '' or coalesce(m.attachments, '[]'::jsonb) <> '[]'::jsonb)
    returning 1)
  select count(*) into v_so_tin from da;

  with da as (
    update public.activities
       set subject = v_nhan, body = null, outcome = null
     where tenant_id = v_tenant and contact_id = v_req.contact_id
    returning 1)
  select count(*) into v_so_ghi from da;

  with da as (
    update public.attachments
       set deleted_at = now()
     where tenant_id = v_tenant and entity_type = 'contact'
       and entity_id = v_req.contact_id and deleted_at is null
    returning 1)
  select count(*) into v_so_dinh from da;

  with da as (
    delete from public.contact_identities
     where tenant_id = v_tenant and contact_id = v_req.contact_id
    returning 1)
  select count(*) into v_so_danh from da;

  update public.contacts
     set full_name = v_nhan,
         phone = null, phone_e164 = null, email = null,
         address = null, province = null, dob = null, gender = null,
         custom = '{}'::jsonb,
         -- ĐÂY là dòng được sửa: giá trị hợp lệ là chữ 'withdrawn'.
         marketing_consent = 'withdrawn',
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

revoke all on function public.erasure_request_apply(uuid) from public, anon;
grant execute on function public.erasure_request_apply(uuid) to authenticated;
