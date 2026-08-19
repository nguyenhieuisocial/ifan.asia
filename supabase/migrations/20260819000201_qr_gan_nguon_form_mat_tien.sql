-- ============================================================
-- iFan.asia — Migration #201: QR tự gắn nguồn ở CỬA THỨ HAI — form mặt tiền
--
-- LỖ THẬT, cùng họ "có móng, không có đường vào". Mã QR của tiệm đã đi được
-- dặm cuối ở MỘT cửa: khách quét /q/<code> → `app/q/[code]/route.ts` gắn
-- `?ifan_qr=<mã>` vào URL đích → nếu đích là trang web có hộp chat iFan thì
-- `livechat_send` gắn nguồn của mã cho khách mới (#57).
--
-- Cửa THỨ HAI thì hụt: đích là trang mặt tiền của chính tiệm (/t/[slug]). Tiệm
-- dán mã ngoài cửa để khách quét-rồi-để-lại-số — đúng cách dùng tự nhiên nhất
-- của một tờ QR ngoài đời — và `storefront_submit_lead` gán CỨNG mọi khách mới
-- vào nguồn 'Form/Landing'. Dấu "mã nào mang khách tới" mất sạch, không gì báo:
-- báo cáo quy kết nguồn vẫn ra số, chỉ là số sai.
--
-- Chép NGUYÊN VĂN thân hàm từ bản MỚI NHẤT (#94) rồi chỉ THÊM khối gắn nguồn —
-- đã đối chiếu md5 thân hàm trong CSDL thật khớp đúng bản #94 trước khi sửa.
-- `create or replace` ghi đè proconfig → ghim lại `set search_path = public,
-- pg_temp` ngay trong định nghĩa (bài học #40).
-- ============================================================

-- Đổi chữ ký (thêm tham số cuối) — phải DROP bản 6 tham số trước: để cả hai bản
-- cùng tồn tại thì lời gọi theo tên tham số của PostgREST khớp cả hai (bản mới
-- có default) → lỗi nhập nhằng. Cùng lý do đã ghi ở #57. Lời gọi 6 tham số hiện
-- có (server action bản cũ, rls-smoke) vẫn chạy với bản mới nhờ default null.
drop function if exists public.storefront_submit_lead(text, text, text, text, text, jsonb);

create function public.storefront_submit_lead(
  p_slug text,
  p_token_hash text,
  p_ip_hash text,
  p_full_name text,
  p_phone text,
  p_fields jsonb default '{}'::jsonb,
  -- Mã QR khách mang theo từ ?ifan_qr trên URL trang mặt tiền (B06) — default
  -- null để mọi lời gọi 6 tham số đang có (tầng web bản cũ, rls-smoke) chạy y
  -- như trước.
  p_qr_code text default null
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
  -- B06: mã QR dặm cuối — chuẩn hoá một lần, chỉ dùng ở nhánh khách MỚI.
  v_qr text := lower(btrim(coalesce(p_qr_code, '')));
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
    -- B06 — dặm cuối của mã QR ở CỬA THỨ HAI. #57 đã nối cửa hộp chat; cửa này
    -- (khách quét mã ngoài cửa tiệm rồi để lại số trên trang mặt tiền) vẫn gán
    -- cứng 'Form/Landing' ⇒ mất sạch dấu mã nào mang khách tới.
    --
    -- Luật xử lý mã CỐ Ý "MỀM", chép đúng tinh thần #57: ?ifan_qr nằm trên URL,
    -- ai cũng sửa được, KHÔNG phải dữ liệu tin cậy. Mã lạ / sai tiệm / đã tắt /
    -- sai định dạng đều rơi xuống nhánh 'Form/Landing' bên dưới — TUYỆT ĐỐI
    -- không trả lỗi: khách đang muốn để lại số, không được chặn vì một tham số
    -- hỏng trên URL. Không truyền p_qr_code thì v_qr là chuỗi rỗng, trượt khuôn
    -- 8-16 ký tự ⇒ hành vi Y HỆT bản #94.
    --
    -- Khối này CHỈ nằm ở nhánh khách MỚI. Khách CŨ KHÔNG bị đụng tới source_id,
    -- KỂ CẢ khi source_id của họ đang để trống.
    --
    -- ⚠️ Đây là chỗ hàm cũ `qr_attribute_contact` làm KHÁC: nó CÓ điền khi
    -- `source_id is null`. Bỏ hành vi đó là CỐ Ý, không phải sót:
    --
    --   `source_id` là nguồn KHÁCH ĐẾN TỪ ĐÂU LẦN ĐẦU — dấu của lúc thu được
    --   khách. Khách đã có hồ sơ nghĩa là việc thu khách XONG TỪ TRƯỚC; ta chỉ
    --   đang không biết nó xảy ra ở đâu. Điền mã họ quét HÔM NAY vào đó là ghi
    --   một PHỎNG ĐOÁN dưới dạng SỰ THẬT, và nó chảy thẳng vào báo cáo quy kết
    --   nguồn — báo cáo sẽ nói "khách này đến từ tem dán cửa" trong khi họ là
    --   khách quen từ lâu. Thà để trống còn hơn điền sai: trống thì đọc ra
    --   "không biết", điền sai thì đọc ra một câu trả lời tin được mà sai.
    --
    -- Cùng luật với #57 (hộp chat cũng không bao giờ đụng khách đã có).
    -- Ca kiểm 13 ghim quyết định này để nó không trôi trong im lặng.
    if v_qr ~ '^[a-z0-9]{8,16}$' then
      select q.source_id into v_source
        from public.qr_codes q
        where q.code = v_qr
          and q.tenant_id = v_tenant.id  -- mã tiệm khác KHÔNG gắn chéo
          and q.is_active;
      -- không thấy → v_source vẫn null: đi tiếp, không lỗi
    end if;

    if v_source is null then
      select id into v_source from public.lead_sources
        where tenant_id = v_tenant.id and name = 'Form/Landing';
    end if;

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
revoke execute on function public.storefront_submit_lead(text, text, text, text, text, jsonb, text)
  from public;
grant execute on function public.storefront_submit_lead(text, text, text, text, text, jsonb, text)
  to anon, authenticated;

-- ============================================================
-- DỌN: `qr_attribute_contact` — hàm ghi mà KHÔNG AI GỌI
-- ============================================================
-- Sinh ra ở #24 (05/08) đúng cho việc gắn nguồn theo mã QR, và từ đó tới nay
-- KHÔNG có lấy một lời gọi nào — trong app/, lib/, script, lẫn trong chính CSDL
-- (kiểm 19/08 ở #192, và grep lại lần nữa hôm nay). #192 đã chọn giữ lại kèm
-- chú thích "CHƯA AI GỌI"; hôm nay điều kiện đó hết hiệu lực, nên bỏ:
--
--   việc gắn nguồn theo mã QR nay chạy TỰ ĐỘNG ở CẢ HAI cửa vào thật —
--   hộp chat (#57) và form mặt tiền (bản này). Không còn chỗ nào cần một hàm
--   gắn tay, mà giữ một hàm ghi không ai gọi CHÍNH LÀ cái bệnh "có móng, không
--   có đường vào" mà bản vá này sinh ra để dứt: người đọc kho thấy nó, tưởng
--   luồng đã nối, rồi không ai nối.
--
-- Nếu sau này muốn màn gắn nguồn BẰNG TAY (nhân viên chọn mã cho một khách đã
-- có hồ sơ) thì dựng lại theo thiết kế lúc đó — chốt vai và cách xử lý khách đã
-- có nguồn sẽ do màn ấy quyết, không phải kế thừa một hàm viết cho ý đồ cũ.
drop function if exists public.qr_attribute_contact(text, uuid);
