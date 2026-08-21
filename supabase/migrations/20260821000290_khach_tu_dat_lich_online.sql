-- ═══════════════════════════════════════════════════════════════════════════
-- KHÁCH TỰ ĐẶT LỊCH TRÊN MẶT TIỀN — cửa công khai, không đăng nhập
-- Thẻ design: man-khach-tu-dat-lich.html · nối tiếp #80 (mặt tiền) · #83 (lịch
-- hẹn + hai EXCLUDE chống trùng) · #209 (bịt lỗ cửa công khai) · #240 (lead).
-- ───────────────────────────────────────────────────────────────────────────
-- BÀI TOÁN: `/t/[slug]` mới chỉ có form ĐỂ LẠI SỐ. Khách muốn đặt giờ phải chờ
-- tiệm gọi lại — mà spa/nail/tóc/nha khoa nào cũng cần khách tự chọn giờ. Ô 34
-- của ma trận 32 ("trang tự đặt của khách") đã được ghi sẵn từ #83, kèm đúng
-- một câu: `appointments.source` sẽ nhận thêm giá trị 'public' khi dựng.
--
-- BỐN QUYẾT ĐỊNH LỚN (chi tiết + lý do nằm ở thẻ design):
--   ① MẶC ĐỊNH TẮT, và KHÔNG có nhánh "chưa cấu hình thì cho qua". Tiệm chưa
--      bật ⇒ RPC ném lỗi. Tiệm bật mà chưa khai giờ mở cửa ⇒ lưới giờ RỖNG
--      (không đẻ ra giờ nào), chứ không phải mở toang cả ngày.
--   ② CHỐNG TRÙNG GIỜ do CSDL quyết, KHÔNG do hàm tự kiểm. `storefront_book`
--      CỐ Ý không hỏi "giờ này còn trống không" trước khi ghi: giữa câu hỏi và
--      câu ghi luôn có một khe, và hai người đặt cùng lúc sẽ LỌT CẢ HAI. Hàm
--      cứ ghi, `appointments_no_overlap_staff` (EXCLUDE, #83/#229) đánh trượt
--      người thứ hai, và hàm dịch mã 23P01 thành 'slot_taken' — đúng chỉ dẫn
--      đã ghi sẵn trong comment của chính ràng buộc đó.
--   ③ SỨC CHỨA TÍNH THEO CẢ TIỆM. Một khung giờ đã có lịch (bất kể của ai) thì
--      cả tiệm coi như bận khung đó — cùng luật với màn Lịch bản điện thoại
--      (`computeFreeBlocks`, lib/booking/schedule.ts) đang chạy. Nhận THIẾU thì
--      tiệm gọi lại thêm được; nhận THỪA là khách tới rồi phải về.
--   ④ MỘT NƠI TÍNH LƯỚI GIỜ. `private.storefront_slot_grid` là bản duy nhất
--      sinh mốc giờ hợp lệ (giờ mở cửa − ngày nghỉ − quá khứ − quá 60 ngày).
--      Cả cửa ĐỌC (`storefront_slots`) lẫn cửa GHI (`storefront_book`) đều đi
--      qua nó ⇒ không có chuyện màn hiện một luật còn lệnh ghi nhận luật khác.
--
-- ⚠️ LỆCH SO VỚI ĐỀ BÀI, ghi rõ để không ai tưởng là sơ ý:
--   · Đề bài viết `storefront_slots(p_tenant uuid, …)`. Ở đây dùng
--     `p_slug text` — GIỐNG `storefront_view` và `storefront_submit_lead`.
--     Lý do: mã tiệm (uuid) HIỆN KHÔNG hề lộ ra ngoài; `storefront_view` trả
--     tên/giờ/địa chỉ chứ không trả `tenants.id`. Nhận uuid ở cửa công khai
--     nghĩa là phải ĐĂNG mã tiệm lên trang công khai để tầng web có cái mà
--     truyền — tức mở rộng bề mặt, và làm hỏng đúng giả định mà #196 dựa vào
--     ("đường khai thác thật: cần biết trước uuid tiệm"). Đổi giả định đó là
--     quyết định cấp kiến trúc, không nên gói ghém trong một tính năng.
--   · Đề bài viết `p_ip`. Ở đây là `p_ip_hash` — cả kho KHÔNG lưu IP thô, chỉ
--     lưu sha256(ip || ':' || slug) do tầng web băm (`ipHashFor`, #23/#80).
--
-- ⚠️ GHI SỔ: KHÔNG gọi được `public.record_audit_log()`. Hàm đó lấy tiệm từ
--   `current_tenant_id()` (thẻ đăng nhập) — người đặt lịch KHÔNG đăng nhập nên
--   nó sẽ ném 'no_tenant_context'. Vẫn ghi vào ĐÚNG bảng `public.record_audit`
--   (một quyển sổ duy nhất, hợp đồng 24q), chỉ là chèn thẳng với tenant_id
--   tường minh và actor_id = NULL — đúng khuôn đã dùng ở #280 và #281 cho các
--   đường ghi không có người đăng nhập.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. Công tắc của tiệm — MẶC ĐỊNH TẮT ──────────────────────────────────
alter table public.tenant_storefront
  add column if not exists booking_enabled boolean not null default false;

comment on column public.tenant_storefront.booking_enabled is
  'Cho khách TỰ ĐẶT LỊCH trên /t/[slug]/dat-lich. Mặc định FALSE: tiệm chưa khai giờ mở cửa mà bật là khách đặt vào giờ tiệm đóng. Bật ở Cài đặt → Mặt tiền, cùng mức quyền owner/admin với storefront_enabled.';

-- ── B. `appointments.source` nhận thêm 'public' ──────────────────────────
-- #83 đã ghi sẵn: "Trang tự đặt của khách ('public', ma trận 32 đường 34) dựng
-- ở V2.5 — thêm giá trị lúc đó, không khai trước một giá trị chưa ai ghi".
-- Đây đúng là "lúc đó".
alter table public.appointments drop constraint appointments_source_check;
alter table public.appointments
  add constraint appointments_source_check
  check (source in ('chat', 'calendar', 'public'));

comment on column public.appointments.source is
  'Ca này đặt từ đâu: chat = khung chat Hộp thư · calendar = màn Lịch · public = KHÁCH TỰ ĐẶT trên mặt tiền (#290). Tách được lịch khách tự đặt khỏi lịch tiệm tự xếp.';

-- ── C. Lưới giờ — BẢN DUY NHẤT sinh mốc giờ hợp lệ ───────────────────────
-- Trả về MỌI mốc giờ mà tiệm CÓ THỂ nhận trong ngày đó, đã trừ: ngày nghỉ,
-- giờ ngoài giờ mở cửa, mốc đã qua, và mốc quá xa (trần 60 ngày).
-- CỐ Ý KHÔNG trừ lịch đã đặt ở đây — xem quyết định ② ở đầu file: cửa ĐỌC tự
-- gắn cờ `taken` để hiển thị, còn cửa GHI phải để EXCLUDE của CSDL phán.
--
-- Mọi phép chia ngày/giờ chạy theo `tenants.timezone`, KHÔNG theo đồng hồ máy
-- chủ (bài học #99 và #192). Cách làm: tính bằng SỐ PHÚT KỂ TỪ 00:00 (thuần số,
-- không dính múi giờ), rồi mới đổi MỘT LẦN sang timestamptz ở câu cuối.
create or replace function private.storefront_slot_grid(
  p_tenant uuid,
  p_item uuid,
  p_date date
) returns table (start_at timestamptz, end_at timestamptz, label text)
language plpgsql
stable
security definer set search_path = public, pg_temp as $$
declare
  v_tz text;
  v_dur int;
  v_now timestamptz := now();
  v_today date;
  v_closure public.business_closures%rowtype;
begin
  select coalesce(t.timezone, 'Asia/Ho_Chi_Minh') into v_tz
    from public.tenants t where t.id = p_tenant;
  if v_tz is null then return; end if;

  -- Cửa sổ đặt trước: từ HÔM NAY (theo giờ tiệm) tới 60 ngày. Không có trần
  -- thì một dòng lệnh đặt được lịch cho năm 2030 và nó nằm mãi trong màn Lịch.
  v_today := (v_now at time zone v_tz)::date;
  if p_date is null or p_date < v_today or p_date > v_today + 60 then return; end if;

  -- Chỉ DỊCH VỤ đang bán mới đặt được. `duration_minutes` là thứ chia ra lưới
  -- giờ — hàng hoá (kind='product') không có nó nên không bao giờ lọt vào đây.
  select i.duration_minutes into v_dur
    from public.items i
   where i.id = p_item
     and i.tenant_id = p_tenant
     and i.kind = 'service'
     and i.status = 'active'
     and i.duration_minutes is not null;
  if v_dur is null or v_dur <= 0 then return; end if;

  -- Ngày nghỉ ĐÈ giờ thường — cùng luật ưu tiên với `computeOpenRanges`
  -- (lib/booking/schedule.ts) và `computeStorefrontStatus` (lib/storefront/hours.ts).
  select * into v_closure
    from public.business_closures c
   where c.tenant_id = p_tenant
     and p_date between c.date_from and c.date_to
   order by c.date_from
   limit 1;
  if v_closure.id is not null and v_closure.is_full_day then return; end if;

  return query
  with khung as (
    -- Ngày nghỉ ĐỔI GIỜ (không nghỉ cả ngày) → đúng MỘT khung theo giờ đã đổi.
    select v_closure.open_time as o, v_closure.close_time as c
     where v_closure.id is not null
       and v_closure.open_time is not null
       and v_closure.close_time is not null
    union all
    -- Không có ngày nghỉ → giờ thường của đúng thứ đó. NHIỀU dòng/thứ là hợp
    -- lệ (nghỉ trưa = hai khung), #80 dựng bảng theo đúng ý đó.
    select h.open_time, h.close_time
      from public.business_hours h
     where v_closure.id is null
       and h.tenant_id = p_tenant
       and h.weekday = extract(dow from p_date)::smallint
       and not h.is_closed
       and h.open_time is not null
       and h.close_time is not null
  ), phut as (
    select (extract(hour from k.o) * 60 + extract(minute from k.o))::int as mo,
           (extract(hour from k.c) * 60 + extract(minute from k.c))::int as mc
      from khung k
  ), moc as (
    select p.mo + g.i * v_dur as m
      from phut p
      cross join lateral generate_series(0, greatest(0, (p.mc - p.mo) / v_dur - 1)) as g(i)
     where p.mc > p.mo
  )
  -- `distinct`: hai khung giờ của cùng một thứ CÓ THỂ chồng nhau (bảng
  -- business_hours không cấm), và khi đó cùng một mốc giờ sinh ra hai lần. Mốc
  -- trùng làm danh sách hiện hai ô y hệt nhau — vô nghĩa với khách.
  select distinct
         s.t,
         s.t + make_interval(mins => v_dur),
         to_char(make_interval(mins => m.m), 'HH24:MI')
    from moc m
    cross join lateral (
      select ((p_date::timestamp + make_interval(mins => m.m)) at time zone v_tz) as t
    ) s
   where m.m + v_dur <= (select max(p.mc) from phut p where p.mo <= m.m and m.m < p.mc)
     and s.t > v_now
   order by 1;
end $$;

comment on function private.storefront_slot_grid(uuid, uuid, date) is
  'BẢN DUY NHẤT sinh mốc giờ hợp lệ cho cửa đặt lịch công khai (#290): giờ mở cửa của thứ đó, ngày nghỉ ĐÈ lên, trừ mốc đã qua, trần 60 ngày. CỐ Ý KHÔNG trừ lịch đã đặt — chống trùng là việc của EXCLUDE trên appointments.';

-- ── D. Cửa ĐỌC — khách xem giờ trống ─────────────────────────────────────
create or replace function public.storefront_slots(
  p_slug text,
  p_item uuid,
  p_date date
) returns jsonb
language plpgsql
stable
security definer set search_path = public, pg_temp as $$
declare
  v_tenant public.tenants%rowtype := private.storefront_resolve(p_slug);
  v_sf public.tenant_storefront%rowtype;
  v_item public.items%rowtype;
  v_closure public.business_closures%rowtype;
  v_slots jsonb;
begin
  -- Tiệm không có / chưa bật mặt tiền ⇒ CÙNG một câu trả lời (#209 LỖ 2).
  if v_tenant.id is null then raise exception 'not_found'; end if;
  select * into v_sf from public.tenant_storefront where tenant_id = v_tenant.id;
  if v_sf.tenant_id is null or not v_sf.storefront_enabled then
    raise exception 'not_found';
  end if;
  -- Chưa bật đặt lịch ⇒ TỪ CHỐI. Không có nhánh "chưa cấu hình thì cho qua".
  if not v_sf.booking_enabled then raise exception 'booking_disabled'; end if;

  select * into v_item from public.items i
   where i.id = p_item and i.tenant_id = v_tenant.id
     and i.kind = 'service' and i.status = 'active';
  if v_item.id is null then raise exception 'item_not_found'; end if;

  select * into v_closure
    from public.business_closures c
   where c.tenant_id = v_tenant.id
     and p_date between c.date_from and c.date_to
   order by c.date_from
   limit 1;

  -- `taken` = khung đó đã có lịch của TIỆM (bất kể thợ nào) — quyết định ③.
  -- Chỉ để HIỂN THỊ (thẻ design: giờ đầy vẫn hiện, gạch ngang, để khách thấy
  -- tiệm đông chứ không tưởng tiệm nghỉ). Lệnh ghi KHÔNG dùng cờ này.
  select coalesce(jsonb_agg(jsonb_build_object(
           'start', g.start_at,
           'label', g.label,
           'taken', exists (
             select 1 from public.appointments a
              where a.tenant_id = v_tenant.id
                and a.deleted_at is null
                and a.status in ('booked', 'arrived')
                and tstzrange(a.start_at, a.end_at) && tstzrange(g.start_at, g.end_at)))
           order by g.start_at), '[]'::jsonb)
    into v_slots
    from private.storefront_slot_grid(v_tenant.id, p_item, p_date) g;

  return jsonb_build_object(
    'date', p_date,
    'timezone', v_tenant.timezone,
    'item_id', v_item.id,
    'item_name', v_item.name,
    'duration_minutes', v_item.duration_minutes,
    'price_vnd', v_item.price_vnd,
    -- Lý do nghỉ hiện NGUYÊN VĂN câu chủ tiệm đã gõ (thẻ design) — không rút
    -- gọn thành "không có giờ trống", vì hai chuyện đó khác nhau với khách.
    'closure', case when v_closure.id is null then null
                    else jsonb_build_object('reason', v_closure.reason,
                                            'is_full_day', v_closure.is_full_day) end,
    'slots', v_slots);
end $$;

revoke execute on function public.storefront_slots(text, uuid, date) from public;
grant execute on function public.storefront_slots(text, uuid, date) to anon, authenticated;

comment on function public.storefront_slots(text, uuid, date) is
  'Cửa ĐỌC giờ trống của trang tự đặt lịch (#290). Chỉ trả khi tiệm đã bật mặt tiền VÀ bật đặt lịch. Mốc giờ do private.storefront_slot_grid sinh; cờ `taken` chỉ để hiển thị, KHÔNG phải chốt chống trùng.';

-- ── E. Cửa GHI — khách đặt lịch thật ─────────────────────────────────────
create or replace function public.storefront_book(
  p_slug text,
  p_item uuid,
  p_start timestamptz,
  p_name text,
  p_phone text,
  p_note text default null,
  p_ip_hash text default null
) returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant public.tenants%rowtype := private.storefront_resolve(p_slug);
  v_sf public.tenant_storefront%rowtype;
  v_item public.items%rowtype;
  v_now timestamptz := now();
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_phone text := btrim(coalesce(p_phone, ''));
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_e164 text;
  v_recent int;
  v_date date;
  v_end timestamptz;
  v_staff uuid;
  v_res jsonb;
  v_contact uuid;
  v_matched boolean;
  v_appt uuid;
  v_label text;
begin
  if v_tenant.id is null then raise exception 'not_found'; end if;
  select * into v_sf from public.tenant_storefront where tenant_id = v_tenant.id;
  if v_sf.tenant_id is null or not v_sf.storefront_enabled then
    raise exception 'not_found';
  end if;
  if not v_sf.booking_enabled then raise exception 'booking_disabled'; end if;

  if v_name = '' then raise exception 'invalid_request'; end if;
  -- ĐÚNG khuôn số điện thoại của form nhận khách (#80/#240) — một luật cho cả
  -- hai cửa, không viết bản thứ hai rồi lệch (bài học #180).
  if v_phone !~ '^0\d{9,10}$' then raise exception 'invalid_phone'; end if;
  v_e164 := '+84' || substring(v_phone from 2);

  -- ── Chống gửi dồn: DÙNG LẠI đúng hai ngưỡng của form nhận khách (#240) và
  --    đếm trên CÙNG một bảng, nên không ai lách trần lead bằng cách đi cửa
  --    đặt lịch.
  --    KHÁC #240 đúng một chỗ, và đây là quyết định: nhánh 5/(tiệm,IP) ở lead
  --    biến thành "giữ chờ duyệt" — ở đây KHÔNG làm được. Một lịch nằm chờ
  --    duyệt thì KHÔNG giữ được khung giờ; tới lúc chủ tiệm bấm Nhận, giờ đó
  --    có thể đã bị người khác lấy, và khách thì đã tin là mình có lịch. Thà
  --    từ chối ngay và nói thật còn hơn hứa một khung giờ không có thật.
  if p_ip_hash is not null then
    select count(*) into v_recent
      from public.storefront_lead_submissions
     where tenant_id = v_tenant.id
       and ip_hash = p_ip_hash
       and created_at > v_now - interval '1 hour';
    if v_recent >= 5 then raise exception 'rate_limited'; end if;
  end if;

  select count(*) into v_recent
    from public.storefront_lead_submissions
   where tenant_id = v_tenant.id
     and created_at > v_now - interval '1 hour';
  if v_recent >= 60 then raise exception 'rate_limited'; end if;

  select * into v_item from public.items i
   where i.id = p_item and i.tenant_id = v_tenant.id
     and i.kind = 'service' and i.status = 'active'
     and i.duration_minutes is not null;
  if v_item.id is null then raise exception 'item_not_found'; end if;

  -- Mốc giờ khách gửi lên phải NẰM ĐÚNG trên lưới giờ hợp lệ. Đây là phép kiểm
  -- LUẬT KINH DOANH (giờ mở cửa · ngày nghỉ · quá khứ · trần 60 ngày) — thứ
  -- CSDL không có ràng buộc nào canh, nên phải kiểm ở đây.
  -- CỐ Ý KHÔNG kiểm "khung này đã có ai đặt chưa": xem quyết định ② đầu file.
  v_date := (p_start at time zone v_tenant.timezone)::date;
  if not exists (
    select 1 from private.storefront_slot_grid(v_tenant.id, p_item, v_date) g
     where g.start_at = p_start
  ) then
    raise exception 'slot_invalid';
  end if;
  v_end := p_start + make_interval(mins => v_item.duration_minutes);
  v_label := to_char(p_start at time zone v_tenant.timezone, 'HH24:MI');

  -- Ca phải có NGƯỜI LÀM (ràng buộc appointments_staff_present, #229). Bản này
  -- KHÔNG cho khách chọn thợ (đo ~1,1 người/tiệm — thẻ design), nên gán tạm
  -- người đầu danh sách theo thứ tự tên; tiệm đổi lại trong màn Lịch như mọi
  -- ca khác. Tiệm CHƯA có hồ sơ nhân sự nào ⇒ TỪ CHỐI, không đặt bừa.
  select e.id into v_staff
    from public.employees e
   where e.tenant_id = v_tenant.id
     and e.ended_on is null
   order by e.full_name, e.id
   limit 1;
  if v_staff is null then raise exception 'no_staff'; end if;

  -- Khách vào hệ thống bằng ĐÚNG đường của form nhận khách: trùng SĐT thì gộp
  -- vào khách cũ, chưa có thì tạo mới + gán nguồn + đẻ việc chăm (#240).
  v_res := private.storefront_materialize_lead(
    v_tenant.id, v_name, v_phone, v_e164, '{}'::jsonb, '');
  v_contact := (v_res ->> 'contact_id')::uuid;
  v_matched := (v_res ->> 'matched')::boolean;
  if v_contact is null then raise exception 'failed'; end if;

  -- ⭐ CHỖ QUAN TRỌNG NHẤT CỦA CẢ FILE: cứ GHI. Hai người bấm cùng một khung
  -- thì `appointments_no_overlap_staff` (EXCLUDE) đánh trượt người thứ hai với
  -- mã 23P01, và ta dịch nó thành 'slot_taken'. Đổi khối này thành "select
  -- trước rồi mới insert" là mở lại đúng cái khe mà EXCLUDE sinh ra để bịt.
  begin
    insert into public.appointments (
      tenant_id, contact_id, staff_employee_id, item_id,
      start_at, end_at, status, price_vnd, note, source
    ) values (
      v_tenant.id, v_contact, v_staff, v_item.id,
      p_start, v_end, 'booked', v_item.price_vnd, v_note, 'public'
    )
    returning id into v_appt;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;
  if v_appt is null then raise exception 'failed'; end if;

  -- Dòng băm để phép đếm chống-lũ (5/IP · 60/tiệm) tính đủ cả lượt đặt lịch —
  -- CÙNG bảng với form nhận khách, nên hai cửa không lách trần của nhau.
  insert into public.storefront_lead_submissions
      (tenant_id, token_hash, ip_hash, contact_id, matched_existing)
    values (v_tenant.id, null, p_ip_hash, v_contact, v_matched);

  -- Ghi sổ vào ĐÚNG quyển sổ chung `record_audit` (hợp đồng 24q). Không gọi
  -- được `record_audit_log()` vì hàm đó đòi thẻ đăng nhập — xem đầu file.
  insert into public.record_audit
      (tenant_id, entity_type, entity_id, actor_id, action, diff)
    values (v_tenant.id, 'appointment', v_appt, null, 'created',
            jsonb_build_object(
              'nguon', 'public',
              'contact_id', v_contact,
              'khach_cu', v_matched,
              'item_id', v_item.id,
              'ten_dich_vu', v_item.name,
              'start_at', p_start,
              'end_at', v_end,
              'staff_employee_id', v_staff));

  return jsonb_build_object(
    'appointment_id', v_appt,
    'start_at', p_start,
    'end_at', v_end,
    'date', v_date,
    'label', v_label,
    'item_name', v_item.name,
    'duration_minutes', v_item.duration_minutes,
    'price_vnd', v_item.price_vnd);
end $$;

revoke execute on function public.storefront_book(text, uuid, timestamptz, text, text, text, text)
  from public;
grant execute on function public.storefront_book(text, uuid, timestamptz, text, text, text, text)
  to anon, authenticated;

comment on function public.storefront_book(text, uuid, timestamptz, text, text, text, text) is
  'Khách TỰ ĐẶT LỊCH trên mặt tiền (#290). Chặn 5/giờ mỗi (tiệm,IP) · 60/giờ mỗi tiệm, đếm chung bảng với form nhận khách. Khách vào qua private.storefront_materialize_lead (gộp nếu trùng SĐT). Chống trùng giờ DO EXCLUDE của CSDL phán — hàm KHÔNG tự kiểm trước khi ghi.';

-- ── F. storefront_view: thêm công tắc + danh sách dịch vụ đặt được ───────
-- KỶ LUẬT CHÉP (bài học #125/#128 và #209): CHÉP NGUYÊN VĂN bản mới nhất
-- (#209 — 20260820000209_va_sau_lo_cua_cong_khai.sql) rồi chỉ thêm đúng phần
-- cần thêm. `create or replace` ghi đè proconfig nên ghim lại `set search_path`
-- ngay trong định nghĩa (bài học #40).
--
-- Vì sao nhét vào đây thay vì dựng RPC thứ hai: mỗi lượt tải `/t/[slug]` đã gọi
-- đúng một lần hàm này (#88 gom lại bằng `cache()`); thêm một cửa nữa là thêm
-- một lượt gọi cho MỌI lượt xem trang. Truy vấn dịch vụ nằm trong nhánh
-- `if booking_enabled` nên tiệm chưa bật KHÔNG tốn thêm gì.
create or replace function public.storefront_view(p_slug text)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant public.tenants%rowtype := private.storefront_resolve(p_slug);
  v_sf public.tenant_storefront%rowtype;
  v_catalog jsonb;
  v_fields jsonb;
  v_hours jsonb;
  v_closures jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  if v_tenant.id is null then
    raise exception 'not_found';
  end if;

  select * into v_sf from public.tenant_storefront where tenant_id = v_tenant.id;
  -- ĐỔI so với #80: trước đây `return jsonb_build_object('enabled', false)`.
  -- Tiệm chưa bật mặt tiền thì với người ngoài nó KHÔNG TỒN TẠI — cùng một
  -- ngoại lệ, cùng một mã HTTP, không có khe nào để dò.
  if v_sf.tenant_id is null or not v_sf.storefront_enabled then
    raise exception 'not_found';
  end if;

  select content -> 'lead_form_fields' into v_catalog
    from public.industry_packs where key = v_tenant.industry;

  -- Chỉ trả field ĐÃ BẬT (tenant_storefront.lead_form_fields), không trả cả danh mục.
  select coalesce(jsonb_agg(f), '[]'::jsonb) into v_fields
    from jsonb_array_elements(coalesce(v_catalog, '[]'::jsonb)) f
    where coalesce(v_sf.lead_form_fields, '[]'::jsonb) ? (f ->> 'key');

  select coalesce(jsonb_agg(jsonb_build_object(
           'weekday', h.weekday, 'is_closed', h.is_closed,
           'open_time', to_char(h.open_time, 'HH24:MI'),
           'close_time', to_char(h.close_time, 'HH24:MI'))
           order by h.weekday, h.open_time nulls first), '[]'::jsonb)
    into v_hours
    from public.business_hours h where h.tenant_id = v_tenant.id;

  -- Chỉ ngày nghỉ CÒN HIỆU LỰC/SẮP TỚI — ngày nghỉ đã qua không có ích cho
  -- khách xem và không cần lộ lịch sử vận hành của tiệm.
  select coalesce(jsonb_agg(jsonb_build_object(
           'date_from', c.date_from, 'date_to', c.date_to, 'reason', c.reason,
           'is_full_day', c.is_full_day,
           'open_time', to_char(c.open_time, 'HH24:MI'),
           'close_time', to_char(c.close_time, 'HH24:MI'))
           order by c.date_from), '[]'::jsonb)
    into v_closures
    from public.business_closures c
    where c.tenant_id = v_tenant.id
      and c.date_to >= (now() at time zone v_tenant.timezone)::date;

  -- THÊM #290: danh sách dịch vụ khách đặt được. Chỉ khi tiệm ĐÃ BẬT đặt lịch,
  -- và chỉ dịch vụ ĐANG BÁN có thời lượng — không trả cả bảng giá của tiệm.
  if v_sf.booking_enabled then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', i.id, 'name', i.name,
             'duration_minutes', i.duration_minutes,
             'price_vnd', i.price_vnd)
             order by i.sort_order, i.name), '[]'::jsonb)
      into v_items
      from public.items i
     where i.tenant_id = v_tenant.id
       and i.kind = 'service'
       and i.status = 'active'
       and i.duration_minutes is not null;
  end if;

  return jsonb_build_object(
    'enabled', true,
    'name', v_tenant.name,
    'intro', v_sf.intro,
    'address', v_sf.address,
    'zalo_contact_url', v_sf.zalo_contact_url,
    'lead_form_enabled', v_sf.lead_form_enabled,
    'lead_form_fields', v_fields,
    'booking_enabled', v_sf.booking_enabled,
    'booking_items', v_items,
    'timezone', v_tenant.timezone,
    -- Giờ hiện tại + thứ TẠI TIỆM, kiểu wall-clock không offset — so sánh
    -- trực tiếp với 'hours' ở trên (cũng wall-clock), #88 không cần đụng múi
    -- giờ ở tầng JS.
    'now', (now() at time zone v_tenant.timezone),
    'today_weekday', extract(dow from (now() at time zone v_tenant.timezone))::int,
    'hours', v_hours,
    'closures', v_closures);
end $$;
revoke execute on function public.storefront_view(text) from public;
grant execute on function public.storefront_view(text) to anon, authenticated;
