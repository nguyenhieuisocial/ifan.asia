-- Migration #94 — khách MỚI từ form mặt tiền không ai được báo.
--
-- LỖI THẬT, loại thất bại im lặng dự án cấm: hàm nhận khách từ trang tiệm có
-- HAI nhánh. Nhánh khách cũ quay lại thì tạo việc cho chủ tiệm. Nhánh **khách
-- mới** — đúng cái đáng tiền nhất — chỉ ghi hồ sơ rồi thôi. Không thông báo,
-- không việc, không sự kiện. Chủ tiệm chỉ biết nếu tình cờ mở danh sách khách.
--
-- Vì sao tạo VIỆC chứ không thêm cơ chế báo mới: nhánh khách cũ ngay bên cạnh
-- đã làm đúng như vậy, và việc quá hạn đã có sẵn đường nhắc qua bot (#25, #85).
-- Thêm một đường báo song song chỉ cho một trường hợp là làm hệ thống rối.
--
-- Chỉ sửa đúng một nhánh; phần còn lại giữ NGUYÊN VĂN bản #80.

create or replace function public.storefront_submit_lead(
  p_slug text,
  p_token_hash text,
  p_ip_hash text,
  p_full_name text,
  p_phone text,
  p_fields jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant public.tenants%rowtype := private.storefront_resolve(p_slug);
  v_sf public.tenant_storefront%rowtype;
  v_name text := left(btrim(coalesce(p_full_name, '')), 120);
  v_phone text := btrim(coalesce(p_phone, ''));
  v_e164 text;
  v_now timestamptz := now();
  v_recent int;
  v_dup uuid;
  v_contact public.contacts%rowtype;
  v_source uuid;
  v_catalog jsonb;
  v_custom jsonb := '{}'::jsonb;
  v_key text;
  v_val text;
  v_field jsonb;
  v_owner uuid;
  v_matched boolean := false;
begin
  if v_tenant.id is null then raise exception 'not_found'; end if;

  select * into v_sf from public.tenant_storefront where tenant_id = v_tenant.id;
  if v_sf.tenant_id is null or not v_sf.storefront_enabled or not v_sf.lead_form_enabled then
    -- "Từ chối lịch sự" (ADR mục 8) là việc của tầng ứng dụng: mã lỗi riêng
    -- biệt với 'not_found' để #88 hiện đúng câu, không lộ là tiệm có tồn tại
    -- hay không khác với việc form đang tắt.
    raise exception 'form_disabled';
  end if;

  -- Gửi lại trong 10 phút CÙNG THIẾT BỊ (token trình duyệt) → "vừa gửi rồi",
  -- không ghi thêm, không tính vào rate-limit IP (thẻ design man-form-nhan-
  -- khach.html, kết cục #4).
  if p_token_hash is not null then
    select id into v_dup from public.storefront_lead_submissions
      where tenant_id = v_tenant.id and token_hash = p_token_hash
        and created_at > v_now - interval '10 minutes'
      limit 1;
    if v_dup is not null then
      return jsonb_build_object('duplicate', true);
    end if;
  end if;

  if v_name = '' then raise exception 'invalid_request'; end if;
  -- Cùng luật chuẩn hoá SĐT VN đang dùng ở app/app/contacts/actions.ts (toE164).
  if v_phone !~ '^0\d{9,10}$' then raise exception 'invalid_phone'; end if;
  v_e164 := '+84' || substring(v_phone from 2);

  -- Chống lụt theo IP — 5 lượt/giờ mỗi (tiệm, IP), độc lập với chốt token ở trên.
  if p_ip_hash is not null then
    select count(*) into v_recent
      from public.storefront_lead_submissions
      where tenant_id = v_tenant.id and ip_hash = p_ip_hash
        and created_at > v_now - interval '1 hour';
    if v_recent >= 5 then raise exception 'rate_limited'; end if;
  end if;

  -- Lọc câu trả lời "Hỏi thêm": chỉ nhận field ĐÃ BẬT + đúng key catalog của
  -- pack + (nếu là select) đúng một trong các lựa chọn — không tin dữ liệu
  -- thô từ client vãng lai.
  select content -> 'lead_form_fields' into v_catalog
    from public.industry_packs where key = v_tenant.industry;
  for v_field in select * from jsonb_array_elements(coalesce(v_catalog, '[]'::jsonb))
  loop
    v_key := v_field ->> 'key';
    continue when not (coalesce(v_sf.lead_form_fields, '[]'::jsonb) ? v_key);
    v_val := p_fields ->> v_key;
    continue when v_val is null or btrim(v_val) = '';
    v_val := left(btrim(v_val), 200);
    if v_field ->> 'type' = 'select'
       and not (coalesce(v_field -> 'options', '[]'::jsonb) ? v_val) then
      continue;
    end if;
    v_custom := v_custom || jsonb_build_object(v_key, v_val);
  end loop;

  select * into v_contact from public.contacts
    where tenant_id = v_tenant.id and phone_e164 = v_e164
    order by created_at limit 1;

  if v_contact.id is not null then
    -- Trùng SĐT khách cũ → GỘP, không tạo bản ghi trùng. Vô hình với khách
    -- (ADR mục 7): trả về y hệt kết cục "thành công" của khách mới.
    v_matched := true;
    update public.contacts
      set custom = coalesce(custom, '{}'::jsonb) || v_custom,
          last_interaction_at = v_now
      where id = v_contact.id
      returning * into v_contact;

    v_owner := v_contact.owner_id;
    if v_owner is null then
      select m.user_id into v_owner from public.tenant_members m
        where m.tenant_id = v_tenant.id and m.role = 'owner' and m.status = 'active'
        order by m.created_at limit 1;
    end if;
    if v_owner is not null then
      insert into public.activities
          (tenant_id, type, subject, contact_id, owner_id, due_at)
        values (v_tenant.id, 'task', 'Khách cũ quay lại qua form mặt tiền',
                v_contact.id, v_owner, v_now);
    end if;
  else
    select id into v_source from public.lead_sources
      where tenant_id = v_tenant.id and name = 'Form/Landing';

    insert into public.contacts (tenant_id, full_name, phone, phone_e164, source_id, custom)
      values (v_tenant.id, v_name, v_phone, v_e164, v_source, v_custom)
      returning * into v_contact;

    -- Khách MỚI cũng phải có người nhận việc. Trước đây nhánh này chỉ ghi hồ
    -- sơ rồi thôi: khách lạ để lại số trên trang tiệm mà KHÔNG AI ĐƯỢC BÁO —
    -- nằm im trong danh sách tới khi có người tình cờ mở ra. Khách mới chính
    -- là lúc ra tiền, để nguội là mất thật.
    select m.user_id into v_owner from public.tenant_members m
      where m.tenant_id = v_tenant.id and m.role = 'owner' and m.status = 'active'
      order by m.created_at limit 1;
    if v_owner is not null then
      insert into public.activities
          (tenant_id, type, subject, contact_id, owner_id, due_at)
        values (v_tenant.id, 'task', 'Khách mới để lại thông tin qua form mặt tiền',
                v_contact.id, v_owner, v_now);
    end if;
  end if;

  insert into public.storefront_lead_submissions
      (tenant_id, token_hash, ip_hash, contact_id, matched_existing)
    values (v_tenant.id, p_token_hash, p_ip_hash, v_contact.id, v_matched);

  return jsonb_build_object('duplicate', false, 'matched_existing', v_matched);
end $$;
